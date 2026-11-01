"use strict";
// Direção de turma: o administrador indica quem é o diretor de cada turma (ano letivo + nome da turma, por exemplo «2026/2027» e «7.º B»)
// e esse docente vê, só para leitura, a pauta consolidada de todas as disciplinas dessa turma. As turmas dos vários docentes
// associam-se pelo ano letivo e pelo nome da turma, e os alunos pelo nome.
const { INTERCALAR } = require("./avaliacao");

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

module.exports = function registar(X) {
  const { rota, db, erro, texto, inteiro, soAdmin, dadosPauta } = X;
  const NOME_INTER = Object.fromEntries(INTERCALAR.map((m) => [m.id, m.nome]));
  const chave = (t) => `${t.ano_letivo}\u0001${norm(t.nome)}`;

  // Turmas ativas de todos os docentes, agrupadas por ano letivo e nome.
  const grupos = () => {
    const m = new Map();
    for (const t of db.prepare("SELECT t.id, t.nome, t.ano_letivo, t.grupo_id, p.id AS prof_id, p.nome AS docente, p.upn FROM turmas t JOIN professores p ON p.id = t.prof_id WHERE t.arquivada = 0 AND t.ano_letivo <> '' ORDER BY t.ano_letivo DESC, t.nome").all()) {
      const k = chave(t); if (!m.has(k)) m.set(k, { ano_letivo: t.ano_letivo, turma: t.nome, turmas: [] });
      m.get(k).turmas.push(t);
    }
    return m;
  };
  const direcao = (ano, turma) => db.prepare("SELECT d.*, p.upn, p.nome FROM direcoes d JOIN professores p ON p.id = d.prof_id WHERE d.ano_letivo = ? AND d.turma = ?").get(ano, turma);
  const dirigidas = (c) => [...grupos().values()].filter((g) => { const d = db.prepare("SELECT 1 FROM direcoes WHERE ano_letivo = ? AND turma = ? AND prof_id = ?").get(g.ano_letivo, g.turma, c.p.id); return d || db.prepare("SELECT 1 FROM direcoes WHERE ano_letivo = ? AND prof_id = ? AND LOWER(turma) = LOWER(?)").get(g.ano_letivo, c.p.id, g.turma); });
  X.nDirecoes = (profId) => db.prepare("SELECT COUNT(*) AS n FROM direcoes WHERE prof_id = ?").get(profId).n;

  // ---- administração ----
  rota("GET", "/api/admin/direcoes", (c) => {
    soAdmin(c);
    return [...grupos().values()].map((g) => { const d = db.prepare("SELECT d.prof_id, p.upn, p.nome FROM direcoes d JOIN professores p ON p.id = d.prof_id WHERE d.ano_letivo = ? AND LOWER(d.turma) = LOWER(?)").get(g.ano_letivo, g.turma); return { ano_letivo: g.ano_letivo, turma: g.turma, docentes: new Set(g.turmas.map((t) => t.prof_id)).size, disciplinas: g.turmas.length, diretor: d ? { prof_id: d.prof_id, upn: d.upn, nome: d.nome } : null }; });
  });
  rota("PUT", "/api/admin/direcoes", (c) => {
    soAdmin(c);
    const ano = texto(c.b.ano_letivo, 20), turma = texto(c.b.turma, 60);
    if (!ano || !turma) throw erro(400, "Indica o ano letivo e a turma.");
    db.prepare("DELETE FROM direcoes WHERE ano_letivo = ? AND LOWER(turma) = LOWER(?)").run(ano, turma);
    if (c.b.prof_id !== null && c.b.prof_id !== undefined) {
      const p = db.prepare("SELECT id FROM professores WHERE id = ? AND ativo = 1").get(inteiro(c.b.prof_id));
      if (!p) throw erro(400, "Docente inexistente.");
      db.prepare("INSERT INTO direcoes (ano_letivo, turma, prof_id) VALUES (?, ?, ?)").run(ano, turma, p.id);
    }
    return { ok: true };
  });

  // ---- vista do diretor de turma ----
  rota("GET", "/api/dt", (c) => dirigidas(c).map((g) => ({ ano_letivo: g.ano_letivo, turma: g.turma, disciplinas: g.turmas.length })));
  rota("GET", "/api/dt/consolidado", (c, u) => {
    const ano = u.searchParams.get("ano_letivo") || "", nome = u.searchParams.get("turma") || "", periodoNome = u.searchParams.get("periodo") || "";
    const g = grupos().get(`${ano}\u0001${norm(nome)}`);
    if (!g) throw erro(404, "Turma inexistente.");
    if (!c.p.admin && !dirigidas(c).some((x) => x.ano_letivo === g.ano_letivo && norm(x.turma) === norm(g.turma))) throw erro(403, "Não és o diretor desta turma.");
    const periodos = [...new Set(g.turmas.flatMap((t) => db.prepare("SELECT nome FROM periodos WHERE turma_id = ? ORDER BY ordem").all(t.id).map((p) => p.nome)))];
    const per = periodoNome || periodos[0] || "";
    const disciplinas = [], alunos = new Map();
    for (const t of g.turmas) {
      const grupoNome = db.prepare("SELECT nome FROM grupos WHERE id = ?").get(t.grupo_id).nome;
      const p = db.prepare("SELECT * FROM periodos WHERE turma_id = ? AND nome = ?").get(t.id, per);
      const d = p ? dadosPauta(p) : null;
      const inter = new Map();
      if (p) for (const r of db.prepare("SELECT aluno_id, n, mencao FROM intercalares WHERE periodo_id = ? AND mencao IS NOT NULL").all(p.id)) inter.set(r.aluno_id + ":" + r.n, r.mencao);
      const faltas = new Map(db.prepare("SELECT a.id, COUNT(*) AS n FROM presencas pr JOIN alunos a ON a.id = pr.aluno_id WHERE a.turma_id = ? AND pr.estado = 'F' GROUP BY a.id").all(t.id).map((r) => [r.id, r.n]));
      disciplinas.push({ turma_id: t.id, disciplina: grupoNome, docente: t.docente || t.upn, casas: d ? d.grupo.casas : 1, periodo: !!p, fechado: !!(p && p.fechado) });
      for (const al of db.prepare("SELECT id, numero, nome FROM alunos WHERE turma_id = ?").all(t.id)) {
        const k = norm(al.nome); if (!alunos.has(k)) alunos.set(k, { nome: al.nome, numero: al.numero, celulas: {}, faltas: 0 });
        const x = alunos.get(k); if (x.numero === null) x.numero = al.numero;
        const a = d && d.alunos.find((y) => y.id === al.id);
        x.celulas[t.id] = { final: a ? a.final : null, parcial: a ? a.parcial : false, nivel: a ? a.nivel : null, mencao: a ? a.mencao : "", inter1: NOME_INTER[inter.get(al.id + ":1")] || "", inter2: NOME_INTER[inter.get(al.id + ":2")] || "" };
        x.faltas += faltas.get(al.id) || 0;
      }
    }
    const lista = [...alunos.values()].map((x) => {
      const fin = Object.values(x.celulas).map((y) => y.final).filter((v) => v !== null);
      return { ...x, media: fin.length ? Math.round((fin.reduce((z, v) => z + v, 0) / fin.length) * 100) / 100 : null, negativas: fin.filter((v) => v < 50).length, comNota: fin.length };
    }).sort((a, b) => (a.numero ?? 9999) - (b.numero ?? 9999) || a.nome.localeCompare(b.nome, "pt"));
    // Fica registado quem consultou a pauta consolidada (são dados de várias disciplinas).
    db.prepare("INSERT INTO auditoria (quem, turma, periodo, acao, detalhe) VALUES (?, ?, ?, 'Vista do diretor de turma', ?)").run(c.p.upn, g.turma, per, g.ano_letivo);
    return { ano_letivo: g.ano_letivo, turma: g.turma, periodo: per, periodos, disciplinas, alunos: lista, limite: 50 };
  });
};
