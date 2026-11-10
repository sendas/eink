"use strict";
// Rotas de administração e segurança: cópias de segurança, fecho de períodos, registo de alterações, importação de alunos,
// arquivo de turmas, retenção (RGPD) e alertas. Recebe as ferramentas do servidor em `X`.
const { lerXlsx, paraTexto, lerAlunos } = require("./xlsx-ler");

module.exports = function registar(X) {
  const { rota, db, erro, texto, inteiro, existe, transacao, soAdmin, turmaDe, periodoDe, dadosPauta, copias } = X;
  const cfgLer = (k, def) => { const r = db.prepare("SELECT valor FROM config WHERE chave = ?").get(k); return r ? r.valor : def; };
  const cfgGravar = (k, v) => db.prepare("INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor").run(k, String(v));
  const retencaoAnos = () => Math.min(10, Math.max(1, Number(cfgLer("retencao_anos", "5")) || 5));

  // ---------- cópias de segurança ----------
  rota("GET", "/api/admin/copias", (c) => { soAdmin(c); return { copias: copias.listar(), manter: copias.manter }; });
  rota("POST", "/api/admin/copias", (c) => { soAdmin(c); const nome = copias.fazer(); return { nome, copias: copias.listar() }; });

  // ---------- fecho de períodos ----------
  rota("GET", "/api/admin/periodos", (c) => {
    soAdmin(c);
    return db.prepare(`SELECT d.id, d.nome AS periodo, d.fechado, d.fechado_em, d.fechado_por, t.nome AS turma, t.ano_letivo, t.arquivada, p.upn AS docente
      FROM periodos d JOIN turmas t ON t.id = d.turma_id JOIN professores p ON p.id = t.prof_id ORDER BY t.arquivada, t.ano_letivo DESC, t.nome, d.ordem`).all();
  });
  // ids: períodos concretos, ou nome: todos os períodos com esse nome (por exemplo «1.º período») nas turmas ativas.
  rota("POST", "/api/admin/periodos/fechar", (c) => {
    soAdmin(c);
    const fechado = c.b.fechado === true ? 1 : 0;
    let ids = Array.isArray(c.b.ids) ? c.b.ids.map(inteiro).filter((x) => x !== null) : [];
    if (c.b.nome) ids = db.prepare("SELECT d.id FROM periodos d JOIN turmas t ON t.id = d.turma_id WHERE d.nome = ? AND t.arquivada = 0").all(texto(c.b.nome, 60)).map((r) => r.id);
    if (!ids.length) throw erro(400, "Não há períodos para alterar.");
    transacao(() => {
      for (const id of ids) {
        const d = db.prepare("SELECT d.*, t.nome AS turma_nome FROM periodos d JOIN turmas t ON t.id = d.turma_id WHERE d.id = ?").get(id);
        if (!d || !!d.fechado === !!fechado) continue;
        db.prepare("UPDATE periodos SET fechado = ?, fechado_em = ?, fechado_por = ? WHERE id = ?").run(fechado, fechado ? new Date().toISOString() : null, fechado ? c.p.upn : "", id);
        db.prepare("INSERT INTO auditoria (quem, turma_id, turma, periodo_id, periodo, acao) VALUES (?, ?, ?, ?, ?, ?)").run(c.p.upn, d.turma_id, d.turma_nome, d.id, d.nome, fechado ? "Período fechado" : "Período reaberto");
      }
    });
    return { ok: true, alterados: ids.length };
  });

  // ---------- registo de alterações ----------
  const filtrosAud = (u) => { const q = [], v = []; for (const [k, col] of [["turma", "turma"], ["aluno", "aluno"], ["acao", "acao"], ["quem", "quem"]]) { const x = (u.searchParams.get(k) || "").trim(); if (x) { q.push(`${col} LIKE ?`); v.push(`%${x}%`); } } return { onde: q.length ? "WHERE " + q.join(" AND ") : "", v }; };
  rota("GET", "/api/admin/auditoria", (c, u) => {
    soAdmin(c);
    const { onde, v } = filtrosAud(u);
    return db.prepare(`SELECT id, quando, quem, turma, periodo, aluno, acao, detalhe, antes, depois FROM auditoria ${onde} ORDER BY id DESC LIMIT 500`).all(...v);
  });
  // Cada docente vê o histórico dos seus períodos.
  rota("GET", "/api/periodos/:id/auditoria", (c) => {
    const per = existe(periodoDe(c.p, c.id[0]));
    return db.prepare("SELECT id, quando, quem, aluno, acao, detalhe, antes, depois FROM auditoria WHERE periodo_id = ? ORDER BY id DESC LIMIT 300").all(per.id);
  });

  // ---------- importar alunos (ficheiro .xlsx/.csv/.txt, ou texto colado) ----------
  // Devolve o texto «número, nome, email» separado por tabulações, para o docente rever antes de adicionar.
  rota("POST", "/api/importar/alunos", (c) => {
    const nome = String(c.b.nome || "").toLowerCase();
    const buf = Buffer.from(String(c.b.base64 || ""), "base64");
    if (!buf.length) throw erro(400, "Ficheiro vazio.");
    let linhas;
    if (nome.endsWith(".xlsx") || (buf[0] === 0x50 && buf[1] === 0x4b)) { try { linhas = lerAlunos(paraTexto(lerXlsx(buf))); } catch (e) { throw erro(400, e.publico ? e.message : "Não consegui ler o ficheiro Excel."); } }
    else linhas = lerAlunos(buf.toString("utf8"), { virgula: true });
    if (!linhas.length) throw erro(400, "Não encontrei nomes de alunos no ficheiro.");
    return { total: linhas.length, texto: linhas.slice(0, 300).map((a) => [a.numero ?? "", a.nome, a.email].join("\t")).join("\n") };
  });
  X.lerAlunos = lerAlunos;

  // ---------- arquivo de turmas e retenção (RGPD) ----------
  rota("POST", "/api/turmas/:id/arquivar", (c) => {
    const t = existe(turmaDe(c.p, c.id[0]));
    const arq = c.b.arquivada === false ? 0 : 1;
    db.prepare("UPDATE turmas SET arquivada = ?, arquivada_em = ? WHERE id = ?").run(arq, arq ? new Date().toISOString() : null, t.id);
    return { ok: true };
  });
  // Arquiva de uma vez as turmas de um ano letivo (por exemplo, «2025/2026») do docente.
  rota("POST", "/api/turmas/arquivar-ano", (c) => {
    const ano = texto(c.b.ano_letivo, 20);
    if (!ano) throw erro(400, "Indica o ano letivo.");
    const r = db.prepare("UPDATE turmas SET arquivada = 1, arquivada_em = ? WHERE prof_id = ? AND ano_letivo = ? AND arquivada = 0").run(new Date().toISOString(), c.p.id, ano);
    return { arquivadas: Number(r.changes) };
  });
  rota("GET", "/api/admin/privacidade", (c) => {
    soAdmin(c);
    const anos = retencaoAnos();
    const limite = new Date(Date.now() - anos * 365.25 * 86400000).toISOString();
    const arquivadas = db.prepare("SELECT t.id, t.nome, t.ano_letivo, t.arquivada_em, p.upn AS docente, (SELECT COUNT(*) FROM alunos WHERE turma_id = t.id) AS alunos FROM turmas t JOIN professores p ON p.id = t.prof_id WHERE t.arquivada = 1 ORDER BY t.arquivada_em").all();
    return { anos, limite, arquivadas: arquivadas.map((t) => ({ ...t, expirada: t.arquivada_em < limite })), alunosTotal: db.prepare("SELECT COUNT(*) AS n FROM alunos").get().n, auditoriaExpirada: db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE quando < ?").get(limite.slice(0, 19).replace("T", " ")).n, registosExpirados: db.prepare("SELECT COUNT(*) AS n FROM registos WHERE data < ?").get(limite.slice(0, 10)).n };
  });
  rota("POST", "/api/admin/privacidade/retencao", (c) => {
    soAdmin(c);
    const a = inteiro(c.b.anos);
    if (a === null || a < 1 || a > 10) throw erro(400, "A retenção vai de 1 a 10 anos.");
    cfgGravar("retencao_anos", a);
    return { anos: a };
  });
  // Apaga as turmas arquivadas há mais do prazo (com os alunos, notas e registos), o registo de alterações e os registos de participação mais antigos que o prazo.
  rota("POST", "/api/admin/privacidade/apagar", (c) => {
    soAdmin(c);
    if (c.b.confirmar !== "APAGAR") throw erro(400, "Escreve APAGAR para confirmar.");
    const limite = new Date(Date.now() - retencaoAnos() * 365.25 * 86400000).toISOString();
    const antigas = db.prepare("SELECT id FROM turmas WHERE arquivada = 1 AND arquivada_em < ?").all(limite);
    transacao(() => {
      for (const t of antigas) { db.prepare("DELETE FROM auditoria WHERE turma_id = ?").run(t.id); db.prepare("DELETE FROM turmas WHERE id = ?").run(t.id); }
      db.prepare("DELETE FROM auditoria WHERE quando < ?").run(limite.slice(0, 19).replace("T", " "));
      db.prepare("DELETE FROM registos WHERE data < ?").run(limite.slice(0, 10)); // registos de participação mais antigos que o prazo
    });
    return { turmas: antigas.length };
  });

  // ---------- alertas: alunos a acompanhar (nota baixa ou muitas faltas) ----------
  const NOTA_ALERTA = 50, FALTAS_ALERTA = 5;
  rota("GET", "/api/alertas", (c) => {
    const saida = [];
    for (const t of db.prepare("SELECT * FROM turmas WHERE prof_id = ? AND arquivada = 0 ORDER BY nome").all(c.p.id)) {
      // O período mais recente com avaliações lançadas.
      const per = db.prepare("SELECT d.* FROM periodos d WHERE d.turma_id = ? AND EXISTS (SELECT 1 FROM avaliacoes a WHERE a.periodo_id = d.id) ORDER BY d.ordem DESC LIMIT 1").get(t.id);
      const faltas = new Map(db.prepare("SELECT p.aluno_id l, COUNT(*) n FROM presencas p JOIN alunos a ON a.id = p.aluno_id WHERE a.turma_id = ? AND p.estado = 'F' GROUP BY p.aluno_id").all(t.id).map((r) => [r.l, r.n]));
      const pauta = per ? new Map(dadosPauta(per).alunos.map((a) => [a.id, a])) : new Map();
      for (const al of db.prepare("SELECT id, numero, nome FROM alunos WHERE turma_id = ? ORDER BY COALESCE(numero, 9999), nome").all(t.id)) {
        const a = pauta.get(al.id), nf = faltas.get(al.id) || 0, motivos = [];
        if (a && a.final !== null && a.final < NOTA_ALERTA) motivos.push(`nota ${String(a.final).replace(".", ",")} % (${a.mencao})`);
        if (nf >= FALTAS_ALERTA) motivos.push(`${nf} faltas`);
        if (motivos.length) saida.push({ turma_id: t.id, turma: t.nome, periodo_id: per ? per.id : null, periodo: per ? per.nome : "", aluno: al.nome, numero: al.numero, final: a ? a.final : null, faltas: nf, motivos });
      }
    }
    return { limiteNota: NOTA_ALERTA, limiteFaltas: FALTAS_ALERTA, alertas: saida.slice(0, 100) };
  });
};
