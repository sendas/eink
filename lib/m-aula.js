"use strict";
// Gestão da aula: grupos guardados (sorteio), lembretes da turma, plano da aula («Começar a aula»), resumo das presenças
// e registo rápido de participação. Tudo filtrado pelo docente da turma; o registo de participação nunca vai para o projetor.

const TIPOS_PADRAO = [
  { nome: "Participou", positivo: true }, { nome: "Ajudou um colega", positivo: true },
  { nome: "Sem material", positivo: false }, { nome: "Distraído", positivo: false },
];
const PASSOS = new Set(["chamada", "temporizador", "sorteio", "sondagem", "quiz", "mural", "bilhete", "roda", "tarefa", "placar", "quiz-projetor", "mapa", "texto"]);
const DATA = /^\d{4}-\d{2}-\d{2}$/;

module.exports = function registar(X) {
  const { rota, db, erro, texto, inteiro, existe, turmaDe, transacao } = X;
  const turma = (c) => existe(turmaDe(c.p, c.id[0]), "Turma inexistente.");
  const alunosDe = (t) => new Set(db.prepare("SELECT id FROM alunos WHERE turma_id = ?").all(t.id).map((x) => x.id));
  const data = (v) => { const d = String(v || ""); if (!DATA.test(d)) throw erro(400, "Data inválida."); return d; };

  // ---------- grupos guardados ----------
  rota("GET", "/api/turmas/:id/grupos", (c) => db.prepare("SELECT id, nome, dados, criado FROM grupos_turma WHERE turma_id = ? ORDER BY id DESC").all(turma(c).id).map((g) => ({ ...g, dados: JSON.parse(g.dados) })));
  rota("POST", "/api/turmas/:id/grupos", (c) => {
    const t = turma(c), doTurma = alunosDe(t);
    if (!Array.isArray(c.b.grupos) || c.b.grupos.length < 1 || c.b.grupos.length > 20) throw erro(400, "Indica de 1 a 20 grupos.");
    const vistos = new Set();
    const grupos = c.b.grupos.map((g) => (Array.isArray(g) ? g : []).map(inteiro).filter((id) => {
      if (!doTurma.has(id)) throw erro(400, "Aluno que não pertence à turma.");
      if (vistos.has(id)) throw erro(400, "Um aluno só pode estar num grupo.");
      vistos.add(id); return true;
    }));
    if (db.prepare("SELECT COUNT(*) AS n FROM grupos_turma WHERE turma_id = ?").get(t.id).n >= 20) throw erro(409, "Esta turma já tem 20 conjuntos de grupos guardados: apaga algum.");
    const nome = texto(c.b.nome, 60) || `Grupos de ${new Date().toLocaleDateString("pt-PT")}`;
    return { id: Number(db.prepare("INSERT INTO grupos_turma (turma_id, nome, dados) VALUES (?, ?, ?)").run(t.id, nome, JSON.stringify(grupos)).lastInsertRowid) };
  });
  rota("DELETE", "/api/turmas/:id/grupos/:gid", (c) => { const t = turma(c); db.prepare("DELETE FROM grupos_turma WHERE id = ? AND turma_id = ?").run(c.id[1], t.id); return { ok: true }; });

  // ---------- lembretes da turma (antigas listas) ----------
  rota("GET", "/api/turmas/:id/lembretes", (c) => db.prepare("SELECT id, texto, feito, criado FROM lembretes WHERE turma_id = ? ORDER BY feito, id").all(turma(c).id).map((l) => ({ ...l, feito: !!l.feito })));
  rota("POST", "/api/turmas/:id/lembretes", (c) => {
    const t = turma(c);
    const lista = (Array.isArray(c.b.textos) ? c.b.textos : [c.b.texto]).map((x) => texto(x, 140)).filter(Boolean);
    if (!lista.length) throw erro(400, "Escreve o lembrete.");
    if (db.prepare("SELECT COUNT(*) AS n FROM lembretes WHERE turma_id = ?").get(t.id).n + lista.length > 100) throw erro(409, "Uma turma leva até 100 lembretes.");
    const ins = db.prepare("INSERT INTO lembretes (turma_id, texto) VALUES (?, ?)");
    transacao(() => { for (const x of lista) ins.run(t.id, x); });
    return { ok: true, adicionados: lista.length };
  });
  const lembrete = (c) => existe(db.prepare("SELECT l.* FROM lembretes l JOIN turmas t ON t.id = l.turma_id WHERE l.id = ? AND t.prof_id = ?").get(c.id[0], c.p.id));
  rota("PUT", "/api/lembretes/:id", (c) => {
    const l = lembrete(c);
    db.prepare("UPDATE lembretes SET texto = ?, feito = ? WHERE id = ?").run(c.b.texto === undefined ? l.texto : (texto(c.b.texto, 140) || l.texto), c.b.feito === undefined ? l.feito : (c.b.feito ? 1 : 0), l.id);
    return { ok: true };
  });
  rota("DELETE", "/api/lembretes/:id", (c) => { const l = lembrete(c); db.prepare("DELETE FROM lembretes WHERE id = ?").run(l.id); return { ok: true }; });

  // ---------- plano da aula ----------
  const lerPlano = (v) => {
    if (!Array.isArray(v) || v.length > 12) throw erro(400, "O plano leva até 12 passos.");
    return v.map((x) => ({ tipo: PASSOS.has(x && x.tipo) ? x.tipo : "texto", texto: texto(x && x.texto, 120), feito: !!(x && x.feito), ...(x && inteiro(x.ref) ? { ref: inteiro(x.ref) } : {}) }));
  };
  rota("GET", "/api/turmas/:id/aula", (c, u) => {
    const t = turma(c), d = data(u.searchParams.get("data"));
    const r = db.prepare("SELECT plano FROM aulas WHERE turma_id = ? AND data = ?").get(t.id, d);
    const ant = db.prepare("SELECT data, plano FROM aulas WHERE turma_id = ? AND data < ? AND plano <> '[]' ORDER BY data DESC LIMIT 1").get(t.id, d);
    return { data: d, plano: r ? JSON.parse(r.plano) : [], anterior: ant ? { data: ant.data, plano: JSON.parse(ant.plano).map((x) => ({ ...x, feito: false })) } : null };
  });
  rota("PUT", "/api/turmas/:id/aula", (c) => {
    const t = turma(c), d = data(c.b.data), plano = lerPlano(c.b.plano);
    db.prepare("INSERT INTO aulas (turma_id, data, plano) VALUES (?, ?, ?) ON CONFLICT (turma_id, data) DO UPDATE SET plano = excluded.plano").run(t.id, d, JSON.stringify(plano));
    return { ok: true };
  });

  // ---------- resumo das presenças ----------
  rota("GET", "/api/turmas/:id/presencas/resumo", (c, u) => {
    const t = turma(c);
    const desde = DATA.test(u.searchParams.get("desde") || "") ? u.searchParams.get("desde") : "0000-00-00";
    const linhas = db.prepare("SELECT p.aluno_id a, p.estado e, p.data d FROM presencas p JOIN alunos l ON l.id = p.aluno_id WHERE l.turma_id = ? AND p.data >= ? ORDER BY p.data").all(t.id, desde);
    const porAluno = {};
    for (const r of linhas) { const x = porAluno[r.a] || (porAluno[r.a] = { F: 0, A: 0, P: 0, faltas: [] }); x[r.e]++; if (r.e === "F") x.faltas.push(r.d); }
    return { aulas: new Set(linhas.map((r) => r.d)).size, alunos: porAluno };
  });

  // ---------- registo rápido de participação ----------
  const tiposDe = (p) => { try { const l = JSON.parse(p.registo_tipos || ""); if (Array.isArray(l) && l.length) return l; } catch { /* por defeito */ } return TIPOS_PADRAO; };
  X.tiposRegisto = tiposDe;
  rota("GET", "/api/eu/registo-tipos", (c) => tiposDe(c.p));
  rota("PUT", "/api/eu/registo-tipos", (c) => {
    if (!Array.isArray(c.b.tipos) || c.b.tipos.length < 1 || c.b.tipos.length > 8) throw erro(400, "Define de 1 a 8 tipos de registo.");
    const tipos = c.b.tipos.map((x) => ({ nome: texto(x && x.nome, 40), positivo: !!(x && x.positivo) })).filter((x) => x.nome);
    if (!tipos.length) throw erro(400, "Dá um nome a cada tipo de registo.");
    if (new Set(tipos.map((x) => x.nome.toLowerCase())).size !== tipos.length) throw erro(400, "Os tipos têm de ser diferentes.");
    db.prepare("UPDATE professores SET registo_tipos = ? WHERE id = ?").run(JSON.stringify(tipos), c.p.id);
    return tipos;
  });
  // Totais por aluno (positivos e negativos, e por tipo) num intervalo de datas, e os registos de um dia.
  const resumoRegistos = (t, desde, ate) => {
    const linhas = db.prepare("SELECT r.id, r.aluno_id, r.data, r.tipo, r.positivo, r.criado FROM registos r JOIN alunos a ON a.id = r.aluno_id WHERE a.turma_id = ? AND r.data BETWEEN ? AND ? ORDER BY r.id").all(t.id, desde, ate);
    const alunos = {};
    for (const r of linhas) {
      const x = alunos[r.aluno_id] || (alunos[r.aluno_id] = { pos: 0, neg: 0, tipos: {} });
      if (r.positivo) x.pos++; else x.neg++;
      x.tipos[r.tipo] = (x.tipos[r.tipo] || 0) + 1;
    }
    return { alunos, linhas };
  };
  X.resumoRegistos = resumoRegistos;
  rota("GET", "/api/turmas/:id/registos", (c, u) => {
    const t = turma(c), q = (k, d) => (DATA.test(u.searchParams.get(k) || "") ? u.searchParams.get(k) : d);
    const { alunos, linhas } = resumoRegistos(t, q("desde", "0000-00-00"), q("ate", "9999-12-31"));
    const dia = q("dia", "");
    return { tipos: tiposDe(c.p), alunos, dia: dia ? linhas.filter((r) => r.data === dia).map(({ id, aluno_id, tipo, positivo }) => ({ id, aluno_id, tipo, positivo: !!positivo })) : [] };
  });
  rota("POST", "/api/turmas/:id/registos", (c) => {
    const t = turma(c), al = inteiro(c.b.aluno);
    if (!alunosDe(t).has(al)) throw erro(400, "Aluno que não pertence à turma.");
    const tipo = tiposDe(c.p).find((x) => x.nome === texto(c.b.tipo, 40));
    if (!tipo) throw erro(400, "Tipo de registo desconhecido.");
    const d = data(c.b.data);
    if (db.prepare("SELECT COUNT(*) AS n FROM registos r JOIN alunos a ON a.id = r.aluno_id WHERE a.turma_id = ? AND r.data = ?").get(t.id, d).n >= 500) throw erro(409, "Demasiados registos neste dia.");
    return { id: Number(db.prepare("INSERT INTO registos (aluno_id, data, tipo, positivo) VALUES (?, ?, ?, ?)").run(al, d, tipo.nome, tipo.positivo ? 1 : 0).lastInsertRowid) };
  });
  rota("DELETE", "/api/registos/:id", (c) => {
    const r = existe(db.prepare("SELECT r.id FROM registos r JOIN alunos a ON a.id = r.aluno_id JOIN turmas t ON t.id = a.turma_id WHERE r.id = ? AND t.prof_id = ?").get(c.id[0], c.p.id));
    db.prepare("DELETE FROM registos WHERE id = ?").run(r.id);
    return { ok: true };
  });
  // Na pauta: os totais do período da turma (só para o docente, como apoio a dar o nível; não entram no cálculo).
  rota("GET", "/api/periodos/:id/registos", (c) => {
    const per = existe(db.prepare("SELECT d.*, t.id AS tid FROM periodos d JOIN turmas t ON t.id = d.turma_id WHERE d.id = ? AND t.prof_id = ?").get(c.id[0], c.p.id));
    return { tipos: tiposDe(c.p), alunos: resumoRegistos({ id: per.tid }, "0000-00-00", "9999-12-31").alunos };
  });
};
