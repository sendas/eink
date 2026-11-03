"use strict";
// Estatísticas de acesso e utilização. Só se guardam contagens por dia, docente e área, sem conteúdos. Os endereços IP e os navegadores estão em lib/m-acessos.js.
const RETENCAO_DIAS = 400;
const AREAS = new Set(["painel", "turmas", "turmas-arquivadas", "turma", "pauta", "grelha", "intercalares", "temporizador", "sorteio", "chamada", "listas", "sondagens", "sondagem", "mapa", "quadros", "quadro", "quizzes", "quiz", "quiz-resultados", "vivo", "gestao", "admin", "criterios", "fecho", "auditoria", "copias", "privacidade-admin", "estatisticas", "dt", "direcoes"]);

const hoje = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Lisbon" }).format(new Date());
// Data (aaaa-mm-dd) deslocada de `n` dias.
const somarDias = (dia, n) => { const d = new Date(dia + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function criar(db) {
  const contar = (profId, area, n = 1) => db.prepare("INSERT INTO uso (dia, prof_id, area, n) VALUES (?, ?, ?, ?) ON CONFLICT (dia, prof_id, area) DO UPDATE SET n = n + excluded.n").run(hoje(), profId, area, n);
  const contarPublico = (tipo, n = 1) => db.prepare("INSERT INTO uso_publico (dia, tipo, n) VALUES (?, ?, ?) ON CONFLICT (dia, tipo) DO UPDATE SET n = n + excluded.n").run(hoje(), tipo, n);
  const limpar = () => { const limite = somarDias(hoje(), -RETENCAO_DIAS); db.prepare("DELETE FROM uso WHERE dia < ?").run(limite); db.prepare("DELETE FROM uso_publico WHERE dia < ?").run(limite); };
  return { contar, contarPublico, limpar };
}

function registar(X, est) {
  const { rota, db, erro, inteiro, soAdmin } = X;
  // O navegador diz em que ecrã está (uma vez por mudança de ecrã); só se aceitam ecrãs conhecidos.
  rota("POST", "/api/uso", (c) => { const a = String(c.b.area || ""); if (AREAS.has(a)) est.contar(c.p.id, "v_" + a); return { ok: true }; });

  rota("GET", "/api/admin/estatisticas", (c, u) => {
    soAdmin(c);
    const dias = Math.min(365, Math.max(7, inteiro(u.searchParams.get("dias")) || 30));
    const fim = hoje(), ini = somarDias(fim, -(dias - 1));
    const linhas = db.prepare("SELECT dia, prof_id, area, n FROM uso WHERE dia >= ?").all(ini);
    const serie = [];
    for (let i = 0; i < dias; i++) {
      const dia = somarDias(ini, i), doDia = linhas.filter((l) => l.dia === dia);
      const logins = doDia.filter((l) => l.area === "login");
      serie.push({ dia, logins: logins.reduce((z, l) => z + l.n, 0), docentes: new Set(logins.map((l) => l.prof_id)).size, vistas: doDia.filter((l) => l.area.startsWith("v_")).reduce((z, l) => z + l.n, 0) });
    }
    const porArea = new Map();
    for (const l of linhas) porArea.set(l.area, (porArea.get(l.area) || 0) + l.n);
    const ativosDesde = (d) => new Set(db.prepare("SELECT DISTINCT prof_id FROM uso WHERE area = 'login' AND dia >= ?").all(somarDias(fim, -(d - 1))).map((r) => r.prof_id)).size;
    const docentes = db.prepare("SELECT id, upn, nome, ultimo_acesso FROM professores WHERE ativo = 1 ORDER BY upn").all().map((p) => {
      const meus = linhas.filter((l) => l.prof_id === p.id);
      return { upn: p.upn, nome: p.nome, ultimo_acesso: p.ultimo_acesso, logins: meus.filter((l) => l.area === "login").reduce((z, l) => z + l.n, 0), vistas: meus.filter((l) => l.area.startsWith("v_")).reduce((z, l) => z + l.n, 0), exportacoes: meus.filter((l) => l.area === "exportacao").reduce((z, l) => z + l.n, 0) };
    });
    const publico = db.prepare("SELECT dia, tipo, n FROM uso_publico WHERE dia >= ? ORDER BY dia").all(ini);
    const n = (sql) => db.prepare(sql).get().n;
    return {
      dias, de: ini, ate: fim, serie,
      areas: [...porArea.entries()].filter(([a]) => a.startsWith("v_")).map(([a, v]) => ({ area: a.slice(2), n: v })).sort((a, b) => b.n - a.n),
      exportacoes: porArea.get("exportacao") || 0, jogosCriados: porArea.get("jogo_sessao") || 0,
      docentes, publico,
      publicoTotais: publico.reduce((o, r) => { o[r.tipo] = (o[r.tipo] || 0) + r.n; return o; }, {}),
      resumo: { docentesAtivos7: ativosDesde(7), docentesAtivos30: ativosDesde(30), docentesTotal: docentes.length, nuncaEntraram: docentes.filter((d) => !d.ultimo_acesso).length, logins: serie.reduce((z, d) => z + d.logins, 0), vistas: serie.reduce((z, d) => z + d.vistas, 0) },
      dados: { turmas: n("SELECT COUNT(*) AS n FROM turmas WHERE arquivada = 0"), alunos: n("SELECT COUNT(*) AS n FROM alunos"), avaliacoes: n("SELECT COUNT(*) AS n FROM avaliacoes"), notas: n("SELECT COUNT(*) AS n FROM notas"), quizzes: n("SELECT COUNT(*) AS n FROM quizzes"), sondagens: n("SELECT COUNT(*) AS n FROM sondagens"), jogosTerminados: n("SELECT COUNT(*) AS n FROM quiz_resultados") },
    };
  });
  void erro;
}

module.exports = { criar, registar, hoje, somarDias, AREAS };
