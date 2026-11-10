"use strict";
// Sala de aula (0.30.0): mural, bilhete de saída, sondagens com resposta certa e «Usar outra vez», grupos, lembretes, plano da aula,
// resumo das presenças, registo de participação, mapa com disposições e quizzes por equipas, ao próprio ritmo, baralhados e repostos depois de um reinício.
const test = require("node:test");
const assert = require("node:assert");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { criarServidor } = require("../server");

async function arrancar(extra = {}) {
  const { servidor, db } = criarServidor({ DB_FILE: ":memory:", DATA_DIR: os.tmpdir() + "/eink-teste-sala", SEGREDO: "teste", DEV_LOGIN: "1", ADMIN_USERS: "admin@escola.pt", DOMINIOS_PERMITIDOS: "escola.pt", BASE_URL: "http://localhost", ...extra });
  await new Promise((r) => servidor.listen(0, r));
  const base = "http://127.0.0.1:" + servidor.address().port;
  const entrar = async (upn) => {
    const r = await fetch(base + "/auth/entrar?dev=" + upn, { redirect: "manual" });
    const ck = (r.headers.getSetCookie()[0] || "").split(";")[0];
    const chamar = async (m, u, b) => {
      const r2 = await fetch(base + u, { method: m, headers: { cookie: ck, "x-requested-with": "eink", "content-type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) });
      return { estado: r2.status, d: await r2.json().catch(() => null) };
    };
    return { chamar, ck };
  };
  const adm = await entrar("admin@escola.pt");
  await adm.chamar("POST", "/api/admin/professores", { upn: "ana@escola.pt" });
  await adm.chamar("POST", "/api/admin/professores", { upn: "rui@escola.pt" });
  const ana = await entrar("ana@escola.pt"), rui = await entrar("rui@escola.pt");
  return { base, servidor, db, entrar, adm, ana, rui };
}
// Um navegador de aluno: guarda os cookies que o servidor lhe dá.
const navegador = (base) => {
  const ck = new Map();
  return async (m, u, b) => {
    const r = await fetch(base + u, { method: m, headers: { "content-type": "application/json", cookie: [...ck].map(([k, v]) => `${k}=${v}`).join("; ") }, body: b === undefined ? undefined : JSON.stringify(b) });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(";"); const i = kv.indexOf("="); ck.set(kv.slice(0, i), kv.slice(i + 1)); }
    return { estado: r.status, d: await r.json().catch(() => null) };
  };
};

test("Mural: notas anónimas, limites, palavrões, aprovação, votos nas dúvidas e código expirado", async (t) => {
  const { base, servidor, db, ana, rui } = await arrancar();
  t.after(() => servidor.close());
  const { d: { id: tid } } = await ana.chamar("POST", "/api/turmas", { nome: "8.º B" });
  assert.strictEqual((await ana.chamar("POST", "/api/sondagens", { tipo: "mural", opcoes: ["a", "b", "c", "d", "e"] })).estado, 400, "até 4 colunas");
  assert.strictEqual((await rui.chamar("POST", "/api/sondagens", { tipo: "mural", turma: tid })).estado, 404, "a turma tem de ser do docente");
  const { d: m } = await ana.chamar("POST", "/api/sondagens", { tipo: "mural", pergunta: "Dúvidas sobre frações", opcoes: [], extra: { modo: "duvidas" }, turma: tid });
  const al = navegador(base), al2 = navegador(base);
  let g = (await al("GET", `/s/api/${m.codigo}`)).d;
  assert.deepStrictEqual([g.tipo, g.modo, g.restantes, g.notas.length, g.aberta], ["mural", "duvidas", 5, 0, true]);
  assert.strictEqual((await al("POST", `/s/api/${m.codigo}/votar`, { texto: "a" })).estado, 400, "demasiado curta");
  assert.strictEqual((await al("POST", `/s/api/${m.codigo}/votar`, { texto: "que merda é isto" })).estado, 400, "filtro de palavrões");
  for (let i = 1; i <= 5; i++) assert.strictEqual((await al("POST", `/s/api/${m.codigo}/votar`, { texto: `Dúvida número ${i} ${"x".repeat(200)}` })).estado, 200);
  assert.strictEqual((await al("POST", `/s/api/${m.codigo}/votar`, { texto: "Mais uma" })).estado, 409, "até 5 por navegador");
  g = (await al2("GET", `/s/api/${m.codigo}`)).d;
  assert.strictEqual(g.notas.length, 5);
  assert.ok(g.notas.every((n) => n.texto.length <= 140), "até 140 caracteres");
  assert.ok(!("criada" in g.notas[0]) && !("ip" in g.notas[0]), "nada que identifique quem escreveu");
  const alvo = g.notas[3].id;
  assert.strictEqual((await al2("POST", `/s/api/${m.codigo}/gosto`, { id: alvo })).estado, 200);
  assert.strictEqual((await al2("POST", `/s/api/${m.codigo}/gosto`, { id: alvo })).estado, 409, "um voto por dúvida");
  assert.strictEqual((await al2("POST", `/s/api/${m.codigo}/gosto`, { id: 999999 })).estado, 404);
  g = (await al2("GET", `/s/api/${m.codigo}`)).d;
  assert.strictEqual(g.notas[0].id, alvo, "no modo dúvidas, a mais votada sobe");
  assert.deepStrictEqual(g.gostei, [alvo]);
  // O docente esconde, destaca e muda de coluna; os alunos deixam de ver a nota escondida.
  assert.strictEqual((await rui.chamar("PUT", `/api/sondagens/${m.id}/respostas/${alvo}`, { oculta: true })).estado, 404);
  await ana.chamar("PUT", `/api/sondagens/${m.id}/respostas/${alvo}`, { oculta: true, destaque: true });
  assert.strictEqual((await al2("GET", `/s/api/${m.codigo}`)).d.notas.length, 4);
  const v = (await ana.chamar("GET", `/api/sondagens/${m.id}`)).d;
  assert.deepStrictEqual([v.total, v.pendentes, v.turma_id, !!v.respostas.find((x) => x.id === alvo).destaque], [5, 1, tid, true]);
  assert.strictEqual((await ana.chamar("GET", `/api/sondagens?tipo=mural&turma=${tid}`)).d.length, 1);
  assert.strictEqual((await ana.chamar("GET", "/api/sondagens?tipo=bilhete")).d.length, 0);
  // Mural de ideias com aprovação: as notas ficam pendentes até o docente as mostrar; não há votos.
  const { d: m2 } = await ana.chamar("POST", "/api/sondagens", { tipo: "mural", opcoes: ["Sei", "Quero saber"], extra: { modo: "ideias", aprovar: true } });
  const r = await al("POST", `/s/api/${m2.codigo}/votar`, { texto: "Os fungos não são plantas", coluna: 1 });
  assert.deepStrictEqual([r.estado, r.d.pendente], [200, true]);
  assert.strictEqual((await al("GET", `/s/api/${m2.codigo}`)).d.notas.length, 0, "pendente: ainda não aparece");
  const pend = (await ana.chamar("GET", `/api/sondagens/${m2.id}`)).d;
  assert.deepStrictEqual([pend.pendentes, pend.respostas[0].coluna], [1, 1]);
  await ana.chamar("PUT", `/api/sondagens/${m2.id}/respostas/${pend.respostas[0].id}`, { oculta: false, coluna: 9 });
  const vis = (await al("GET", `/s/api/${m2.codigo}`)).d;
  assert.deepStrictEqual([vis.notas.length, vis.notas[0].coluna], [1, 1], "coluna limitada às que existem");
  assert.strictEqual((await al("POST", `/s/api/${m2.codigo}/gosto`, { id: pend.respostas[0].id })).estado, 400, "no mural de ideias não há votos");
  // «Usar outra vez» copia o modo e as colunas com um código novo.
  const cop = (await ana.chamar("POST", `/api/sondagens/${m2.id}/copiar`, {})).d;
  assert.notStrictEqual(cop.codigo, m2.codigo);
  const gc = (await al("GET", `/s/api/${cop.codigo}`)).d;
  assert.deepStrictEqual([gc.modo, gc.aprovar, gc.colunas, gc.notas.length], ["ideias", true, ["Sei", "Quero saber"], 0]);
  // Ao fim de 12 horas o código deixa de aceitar notas.
  db.prepare("UPDATE sondagens SET criada = datetime('now', '-13 hours') WHERE id = ?").run(m.id);
  assert.strictEqual((await al2("GET", `/s/api/${m.codigo}`)).d.aberta, false);
  assert.strictEqual((await al2("POST", `/s/api/${m.codigo}/votar`, { texto: "Tarde demais" })).estado, 409, "código expirado");
  assert.strictEqual((await ana.chamar("GET", `/api/sondagens/${m.id}`)).d.expirada, true);
});

test("Bilhete de saída: escala e texto, uma vez por navegador, resultados só para o docente", async (t) => {
  const { base, servidor, db, ana, rui } = await arrancar();
  t.after(() => servidor.close());
  assert.strictEqual((await ana.chamar("POST", "/api/sondagens", { tipo: "bilhete", extra: { perguntas: [] } })).estado, 400);
  const { d: b } = await ana.chamar("POST", "/api/sondagens", { tipo: "bilhete", extra: { perguntas: [{ tipo: "escala", texto: "Quanto percebeste?" }, { tipo: "texto", texto: "Uma dúvida" }] } });
  const al = navegador(base);
  const g = (await al("GET", `/s/api/${b.codigo}`)).d;
  assert.deepStrictEqual([g.tipo, g.pergunta, g.perguntas.length, g.votou], ["bilhete", "Bilhete de saída", 2, false]);
  assert.ok(!("resultados" in g), "os alunos não veem os resultados");
  assert.strictEqual((await al("POST", `/s/api/${b.codigo}/votar`, { respostas: [9, ""] })).estado, 400, "pelo menos uma resposta válida");
  assert.strictEqual((await al("POST", `/s/api/${b.codigo}/votar`, { respostas: [3, "que merda"] })).estado, 400, "filtro de palavrões");
  assert.strictEqual((await al("POST", `/s/api/${b.codigo}/votar`, { respostas: [4, "As frações impróprias"] })).estado, 200);
  assert.strictEqual((await al("POST", `/s/api/${b.codigo}/votar`, { respostas: [5, "outra"] })).estado, 409, "um bilhete por navegador");
  assert.strictEqual((await al("GET", `/s/api/${b.codigo}`)).d.votou, true);
  for (const [v, txt] of [[2, ""], [3, "Frações equivalentes"]]) assert.strictEqual((await navegador(base)("POST", `/s/api/${b.codigo}/votar`, { respostas: [v, txt] })).estado, 200);
  const r = (await ana.chamar("GET", `/api/sondagens/${b.id}`)).d;
  assert.strictEqual(r.total, 3);
  assert.deepStrictEqual([r.resultados[0].dist, r.resultados[0].n, r.resultados[0].media], [[0, 1, 1, 1, 0], 3, 3]);
  assert.strictEqual(r.resultados[1].respostas.length, 2);
  assert.ok(r.resultados[1].palavras.some((p) => p.palavra === "frações"));
  assert.strictEqual((await rui.chamar("GET", `/api/sondagens/${b.id}`)).estado, 404);
  assert.strictEqual((await ana.chamar("POST", `/api/sondagens/${b.id}/voto`, { opcao: 0 })).estado, 400, "não se contam votos à mão num bilhete");
  await ana.chamar("POST", `/api/sondagens/${b.id}/repor`, {});
  const z = (await ana.chamar("GET", `/api/sondagens/${b.id}`)).d;
  assert.deepStrictEqual([z.total, z.resultados[0].n, z.resultados[1].respostas.length], [0, 0, 0]);
  await ana.chamar("POST", `/api/sondagens/${b.id}/estado`, { aberta: false });
  assert.strictEqual((await navegador(base)("POST", `/s/api/${b.codigo}/votar`, { respostas: [4, ""] })).estado, 409, "fechado");
  db.prepare("UPDATE sondagens SET aberta = 1, criada = datetime('now', '-13 hours') WHERE id = ?").run(b.id);
  assert.strictEqual((await navegador(base)("POST", `/s/api/${b.codigo}/votar`, { respostas: [4, ""] })).estado, 409, "código expirado");
});

test("Sondagens: resposta certa, resultados escondidos até revelar e «Usar outra vez»", async (t) => {
  const { servidor, ana } = await arrancar();
  t.after(() => servidor.close());
  const { d: s } = await ana.chamar("POST", "/api/sondagens", { pergunta: "2 + 2?", opcoes: ["3", "4"], certa: 1, esconder: true });
  let v = (await ana.chamar("GET", `/api/sondagens/${s.id}`)).d;
  assert.deepStrictEqual([v.certa, v.revelada], [1, false]);
  await ana.chamar("POST", `/api/sondagens/${s.id}/estado`, { revelada: true });
  assert.strictEqual((await ana.chamar("GET", `/api/sondagens/${s.id}`)).d.revelada, true);
  await ana.chamar("POST", `/api/sondagens/${s.id}/estado`, { revelada: false });
  await ana.chamar("POST", `/api/sondagens/${s.id}/estado`, { aberta: false });
  v = (await ana.chamar("GET", `/api/sondagens/${s.id}`)).d;
  assert.deepStrictEqual([v.aberta, v.revelada], [false, true], "fechar revela os resultados");
  const c = (await ana.chamar("POST", `/api/sondagens/${s.id}/copiar`, {})).d;
  const vc = (await ana.chamar("GET", `/api/sondagens/${c.id}`)).d;
  assert.deepStrictEqual([vc.pergunta, vc.opcoes, vc.certa, vc.revelada, vc.aberta, vc.total], ["2 + 2?", ["3", "4"], 1, false, true, 0]);
  assert.strictEqual((await ana.chamar("GET", "/api/sondagens?tipo=sondagem")).d.length, 2);
});

test("Gestão da aula: grupos, lembretes, plano de hoje e resumo das presenças (só o docente da turma)", async (t) => {
  const { servidor, ana, rui } = await arrancar();
  t.after(() => servidor.close());
  const { d: { id: tid } } = await ana.chamar("POST", "/api/turmas", { nome: "9.º C" });
  await ana.chamar("POST", `/api/turmas/${tid}/alunos`, { texto: "1 Ana\n2 Bruno\n3 Carla\n4 Duarte" });
  const al = (await ana.chamar("GET", "/api/turmas/" + tid)).d.alunos;
  assert.ok(al.every((a) => "foto" in a), "a lista de alunos diz se há fotografia");
  // Grupos
  assert.strictEqual((await ana.chamar("POST", `/api/turmas/${tid}/grupos`, { grupos: [[al[0].id, al[1].id], [al[1].id]] })).estado, 400, "um aluno, um grupo");
  assert.strictEqual((await ana.chamar("POST", `/api/turmas/${tid}/grupos`, { grupos: [[al[0].id, 99999]] })).estado, 400);
  const { d: { id: gid } } = await ana.chamar("POST", `/api/turmas/${tid}/grupos`, { nome: "Trabalho de grupo", grupos: [[al[0].id, al[1].id], [al[2].id, al[3].id]] });
  assert.deepStrictEqual((await ana.chamar("GET", `/api/turmas/${tid}/grupos`)).d[0].dados, [[al[0].id, al[1].id], [al[2].id, al[3].id]]);
  assert.strictEqual((await rui.chamar("GET", `/api/turmas/${tid}/grupos`)).estado, 404);
  await ana.chamar("DELETE", `/api/turmas/${tid}/grupos/${gid}`);
  assert.strictEqual((await ana.chamar("GET", `/api/turmas/${tid}/grupos`)).d.length, 0);
  // Lembretes
  assert.strictEqual((await ana.chamar("POST", `/api/turmas/${tid}/lembretes`, { texto: "  " })).estado, 400);
  await ana.chamar("POST", `/api/turmas/${tid}/lembretes`, { texto: "Autorizações da visita" });
  await ana.chamar("POST", `/api/turmas/${tid}/lembretes`, { textos: ["Testes corrigidos", "Livro de ponto"] });
  let l = (await ana.chamar("GET", `/api/turmas/${tid}/lembretes`)).d;
  assert.strictEqual(l.length, 3);
  assert.strictEqual((await rui.chamar("PUT", `/api/lembretes/${l[0].id}`, { feito: true })).estado, 404);
  await ana.chamar("PUT", `/api/lembretes/${l[0].id}`, { feito: true });
  l = (await ana.chamar("GET", `/api/turmas/${tid}/lembretes`)).d;
  assert.deepStrictEqual([l[2].texto, l[2].feito], ["Autorizações da visita", true], "os feitos vão para o fim");
  assert.strictEqual((await ana.chamar("POST", `/api/turmas/${tid}/lembretes`, { textos: Array(98).fill("x") })).estado, 409, "até 100 por turma");
  await ana.chamar("DELETE", `/api/lembretes/${l[2].id}`);
  assert.strictEqual((await ana.chamar("GET", `/api/turmas/${tid}/lembretes`)).d.length, 2);
  // Plano da aula
  assert.strictEqual((await ana.chamar("GET", `/api/turmas/${tid}/aula?data=ontem`)).estado, 400);
  assert.deepStrictEqual((await ana.chamar("GET", `/api/turmas/${tid}/aula?data=2026-11-03`)).d, { data: "2026-11-03", plano: [], anterior: null });
  assert.strictEqual((await ana.chamar("PUT", `/api/turmas/${tid}/aula`, { data: "2026-11-03", plano: Array(13).fill({ tipo: "texto" }) })).estado, 400, "até 12 passos");
  await ana.chamar("PUT", `/api/turmas/${tid}/aula`, { data: "2026-11-03", plano: [{ tipo: "temporizador", texto: "Exercícios", feito: true }, { tipo: "inventado", texto: "Nota" }] });
  const a = (await ana.chamar("GET", `/api/turmas/${tid}/aula?data=2026-11-10`)).d;
  assert.deepStrictEqual(a.plano, []);
  assert.deepStrictEqual(a.anterior, { data: "2026-11-03", plano: [{ tipo: "temporizador", texto: "Exercícios", feito: false }, { tipo: "texto", texto: "Nota", feito: false }] }, "copia-se da aula anterior, por fazer");
  assert.strictEqual((await rui.chamar("PUT", `/api/turmas/${tid}/aula`, { data: "2026-11-03", plano: [] })).estado, 404);
  // Resumo das presenças
  await ana.chamar("PUT", `/api/turmas/${tid}/presencas`, { data: "2026-11-03", estados: { [al[0].id]: "F", [al[1].id]: "A" } });
  await ana.chamar("PUT", `/api/turmas/${tid}/presencas`, { data: "2026-11-05", estados: { [al[0].id]: "F" } });
  const r = (await ana.chamar("GET", `/api/turmas/${tid}/presencas/resumo`)).d;
  assert.strictEqual(r.aulas, 2);
  assert.deepStrictEqual([r.alunos[al[0].id].F, r.alunos[al[0].id].faltas, r.alunos[al[1].id].A], [2, ["2026-11-03", "2026-11-05"], 1]);
  assert.strictEqual((await ana.chamar("GET", `/api/turmas/${tid}/presencas/resumo?desde=2026-11-04`)).d.alunos[al[0].id].F, 1);
  assert.strictEqual((await rui.chamar("GET", `/api/turmas/${tid}/presencas/resumo`)).estado, 404);
});

test("Registo de participação: tipos do docente, só o dono vê, na pauta como apoio e apagado com a retenção", async (t) => {
  const { servidor, db, adm, ana, rui } = await arrancar();
  t.after(() => servidor.close());
  const { d: { id: tid } } = await ana.chamar("POST", "/api/turmas", { nome: "7.º D", ano_letivo: "2026/2027" });
  await ana.chamar("POST", `/api/turmas/${tid}/alunos`, { texto: "1 Ana\n2 Bruno" });
  const turma = (await ana.chamar("GET", "/api/turmas/" + tid)).d, [a1, a2] = turma.alunos;
  assert.deepStrictEqual((await ana.chamar("GET", "/api/eu/registo-tipos")).d.map((x) => x.nome), ["Participou", "Ajudou um colega", "Sem material", "Distraído"]);
  assert.strictEqual((await ana.chamar("PUT", "/api/eu/registo-tipos", { tipos: [] })).estado, 400);
  assert.strictEqual((await ana.chamar("PUT", "/api/eu/registo-tipos", { tipos: [{ nome: "A", positivo: true }, { nome: "a", positivo: false }] })).estado, 400, "tipos diferentes");
  await ana.chamar("PUT", "/api/eu/registo-tipos", { tipos: [{ nome: "Participou", positivo: true }, { nome: "Sem trabalho de casa", positivo: false }] });
  assert.strictEqual((await rui.chamar("GET", "/api/eu/registo-tipos")).d.length, 4, "os tipos são de cada docente");
  assert.strictEqual((await ana.chamar("POST", `/api/turmas/${tid}/registos`, { aluno: a1.id, tipo: "Inventado", data: "2026-11-09" })).estado, 400);
  assert.strictEqual((await ana.chamar("POST", `/api/turmas/${tid}/registos`, { aluno: 99999, tipo: "Participou", data: "2026-11-09" })).estado, 400);
  assert.strictEqual((await rui.chamar("POST", `/api/turmas/${tid}/registos`, { aluno: a1.id, tipo: "Participou", data: "2026-11-09" })).estado, 404);
  for (const [a, tp, d] of [[a1, "Participou", "2026-11-09"], [a1, "Participou", "2026-11-09"], [a1, "Sem trabalho de casa", "2026-11-10"], [a2, "Participou", "2026-11-10"]]) assert.strictEqual((await ana.chamar("POST", `/api/turmas/${tid}/registos`, { aluno: a.id, tipo: tp, data: d })).estado, 200);
  const r = (await ana.chamar("GET", `/api/turmas/${tid}/registos?dia=2026-11-09`)).d;
  assert.deepStrictEqual(r.alunos[a1.id], { pos: 2, neg: 1, tipos: { Participou: 2, "Sem trabalho de casa": 1 } });
  assert.strictEqual(r.dia.length, 2);
  assert.strictEqual((await ana.chamar("GET", `/api/turmas/${tid}/registos?desde=2026-11-10&ate=2026-11-10`)).d.alunos[a1.id].pos, 0);
  assert.strictEqual((await rui.chamar("GET", `/api/turmas/${tid}/registos`)).estado, 404, "só o docente da turma");
  assert.strictEqual((await rui.chamar("DELETE", `/api/registos/${r.dia[0].id}`)).estado, 404);
  await ana.chamar("DELETE", `/api/registos/${r.dia[0].id}`);
  assert.strictEqual((await ana.chamar("GET", `/api/turmas/${tid}/registos`)).d.alunos[a1.id].pos, 1);
  // Na pauta, como apoio (não muda a nota)
  const per = turma.periodos[0].id;
  const pr = (await ana.chamar("GET", `/api/periodos/${per}/registos`)).d;
  assert.deepStrictEqual([pr.alunos[a1.id].pos, pr.alunos[a1.id].neg, pr.alunos[a2.id].pos], [1, 1, 1]);
  assert.strictEqual((await rui.chamar("GET", `/api/periodos/${per}/registos`)).estado, 404);
  // Retenção: os registos mais antigos que o prazo apagam-se com «Apagar o que passou o prazo».
  db.prepare("UPDATE registos SET data = '2015-01-05' WHERE aluno_id = ?").run(a2.id);
  assert.strictEqual((await adm.chamar("GET", "/api/admin/privacidade")).d.registosExpirados, 1);
  assert.strictEqual((await adm.chamar("POST", "/api/admin/privacidade/apagar", { confirmar: "APAGAR" })).estado, 200);
  const depois = (await ana.chamar("GET", `/api/turmas/${tid}/registos`)).d.alunos;
  assert.deepStrictEqual([!!depois[a1.id], !!depois[a2.id]], [true, false]);
  // Apagar o aluno apaga os seus registos.
  await ana.chamar("DELETE", `/api/alunos/${a1.id}`);
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM registos").get().n, 0);
});

test("Mapa de sala: outras disposições guardadas (até 6, validadas)", async (t) => {
  const { servidor, ana } = await arrancar();
  t.after(() => servidor.close());
  const { d: { id: tid } } = await ana.chamar("POST", "/api/turmas", { nome: "5.º A" });
  await ana.chamar("POST", `/api/turmas/${tid}/alunos`, { texto: "1 Ana\n2 Bruno" });
  const [a1, a2] = (await ana.chamar("GET", "/api/turmas/" + tid)).d.alunos;
  const disp = { nome: "Testes", linhas: 2, colunas: 2, lugares: { "0,0": a2.id, "1,1": a1.id, "5,5": a1.id } };
  assert.strictEqual((await ana.chamar("PUT", `/api/turmas/${tid}/mapa`, { linhas: 2, colunas: 2, lugares: { "0,0": a1.id }, disposicoes: Array(7).fill(disp) })).estado, 400, "até 6 disposições");
  assert.strictEqual((await ana.chamar("PUT", `/api/turmas/${tid}/mapa`, { linhas: 2, colunas: 2, lugares: { "0,0": a1.id }, disposicoes: [{ ...disp, lugares: { "0,0": a1.id, "0,1": a1.id } }] })).estado, 400, "um aluno, um lugar, também nas disposições");
  assert.strictEqual((await ana.chamar("PUT", `/api/turmas/${tid}/mapa`, { linhas: 2, colunas: 2, lugares: { "0,0": a1.id }, disposicoes: [disp] })).estado, 200);
  const m = (await ana.chamar("GET", `/api/turmas/${tid}/mapa`)).d;
  assert.deepStrictEqual(m.disposicoes, [{ nome: "Testes", linhas: 2, colunas: 2, lugares: { "0,0": a2.id, "1,1": a1.id } }]);
  assert.ok(m.alunos.every((a) => "foto" in a));
});

test("Quizzes: equipas, revisão ao próprio ritmo, perguntas baralhadas e análise por pergunta", async (t) => {
  const { base, servidor, ana } = await arrancar();
  t.after(() => servidor.close());
  const perguntas = [{ texto: "2 + 2?", opcoes: ["3", "4", "5"], certa: 1, explicacao: "Quatro." }, { texto: "Capital?", opcoes: ["Porto", "Lisboa"], certa: 1 }];
  const { d: { id: qid } } = await ana.chamar("POST", "/api/quizzes", { titulo: "Contas", perguntas, baralhar: true });
  assert.strictEqual((await ana.chamar("GET", `/api/quizzes/${qid}`)).d.baralhar, true, "a opção de baralhar fica guardada");
  const jogador = (pin) => { const n = navegador(base); return (sub, b) => n(b ? "POST" : "GET", `/j/api/${pin}${sub ? "/" + sub : ""}`, b); };
  // Por equipas
  const { d: { pin } } = await ana.chamar("POST", `/api/quizzes/${qid}/vivo`, { equipas: 2 });
  const j1 = jogador(pin), j2 = jogador(pin), j3 = jogador(pin);
  assert.deepStrictEqual((await j1("")).d.equipas, ["Vermelha", "Azul"]);
  assert.strictEqual((await j1("entrar", { alcunha: "Rato" })).estado, 400, "tem de escolher a equipa");
  assert.strictEqual((await j1("entrar", { alcunha: "Rato", equipa: 5 })).estado, 400);
  assert.strictEqual((await j1("entrar", { alcunha: "Rato", equipa: 0 })).d.equipa, 0);
  await j2("entrar", { alcunha: "Gato", equipa: 1 }); await j3("entrar", { alcunha: "Cão", equipa: 1 });
  await ana.chamar("POST", `/api/vivo/${pin}/acao`, { acao: "comecar" });
  // Com as perguntas baralhadas, a resposta certa acompanha o texto da opção.
  const q = (await j1("")).d.pergunta, certaTxt = q.texto === "2 + 2?" ? "4" : "Lisboa", k = q.opcoes.indexOf(certaTxt);
  assert.ok(k >= 0);
  await j1("responder", { pergunta: q.id, resposta: k }); await j2("responder", { pergunta: q.id, resposta: (k + 1) % q.opcoes.length });
  let p = (await ana.chamar("POST", `/api/vivo/${pin}/acao`, { acao: "mostrar" })).d;
  assert.strictEqual(p.certa, k);
  assert.deepStrictEqual(p.equipas.map((e) => [e.nome, e.membros]), [["Vermelha", 1], ["Azul", 2]], "a equipa com melhor média fica à frente");
  assert.ok(p.equipas[0].media > 0 && p.equipas[1].media === 0);
  assert.ok((await j1("")).d.topoEquipas.length === 2);
  await ana.chamar("POST", `/api/vivo/${pin}/acao`, { acao: "proxima" });
  await ana.chamar("POST", `/api/vivo/${pin}/acao`, { acao: "mostrar" });
  p = (await ana.chamar("POST", `/api/vivo/${pin}/acao`, { acao: "proxima" })).d;
  assert.strictEqual(p.fase, "fim");
  assert.strictEqual(p.perguntas.length, 2);
  const an = p.perguntas.find((x) => x.texto === q.texto);
  assert.deepStrictEqual([an.respostas, an.pct, an.errada], [2, 33, (k + 1) % q.opcoes.length], "% de acertos e a errada mais escolhida");
  const res = (await ana.chamar("GET", `/api/quizzes/${qid}/resultados`)).d[0];
  assert.deepStrictEqual([res.equipas.length, res.ranking[0].equipa, res.perguntas.length], [2, "Vermelha", 2]);
  await ana.chamar("POST", `/api/vivo/${pin}/acao`, { acao: "fechar" });

  // Revisão ao próprio ritmo: sem tempo, cada aluno avança sozinho e vê a explicação.
  const { d: r } = await ana.chamar("POST", `/api/quizzes/${qid}/vivo`, { ritmo: true, horas: 2, equipas: 3 });
  const a = jogador(r.pin);
  let v = (await a("entrar", { alcunha: "Mocho" })).d;
  assert.deepStrictEqual([v.ritmo, v.fase, v.idx, v.equipas.length], [true, "livre", 0, 0], "sem equipas na revisão");
  assert.strictEqual((await ana.chamar("POST", `/api/vivo/${r.pin}/acao`, { acao: "comecar" })).estado, 400, "não há «começar»");
  const certa = (pg) => pg.opcoes.indexOf(pg.texto === "2 + 2?" ? "4" : "Lisboa");
  v = (await a("responder", { pergunta: v.pergunta.id, resposta: certa(v.pergunta) })).d;
  assert.deepStrictEqual([v.mostrar, v.ok], [true, true]);
  assert.ok(typeof v.explicacao === "string");
  assert.strictEqual((await a("responder", { pergunta: v.pergunta.id, resposta: 0 })).estado, 400, "a primeira resposta é a que conta");
  assert.strictEqual((await a("")).d.ok, true);
  v = (await a("seguinte", {})).d;
  assert.deepStrictEqual([v.idx, v.mostrar], [1, undefined]);
  v = (await a("responder", { pergunta: v.pergunta.id, resposta: (certa(v.pergunta) + 1) % v.pergunta.opcoes.length })).d;
  assert.deepStrictEqual([v.ok, v.ultima], [false, true]);
  v = (await a("seguinte", {})).d;
  assert.deepStrictEqual([v.concluido, v.certas], [true, 1]);
  p = (await ana.chamar("GET", `/api/vivo/${r.pin}`)).d;
  assert.deepStrictEqual([p.ritmo, p.concluiram, p.jogadores.length], [true, 1, 1]);
  assert.ok(p.expira - Date.now() > 3600000 && p.expira - Date.now() <= 7200000, "fica aberto as horas pedidas");
  assert.ok((await ana.chamar("GET", "/api/vivo")).d.some((x) => x.pin === r.pin && x.ritmo));
  await ana.chamar("POST", `/api/vivo/${r.pin}/acao`, { acao: "terminar" });
  assert.strictEqual((await ana.chamar("GET", `/api/quizzes/${qid}/resultados`)).d[0].ritmo, true, "o resumo da revisão fica nos resultados");
  await ana.chamar("POST", `/api/vivo/${r.pin}/acao`, { acao: "fechar" });
});

test("Quiz ao vivo: o jogo em curso sobrevive a um reinício do servidor", async (t) => {
  const ficheiro = path.join(os.tmpdir(), `eink-vivo-${process.pid}-${Date.now()}.db`);
  t.after(() => { for (const f of [ficheiro, ficheiro + "-wal", ficheiro + "-shm"]) fs.rmSync(f, { force: true }); });
  const A = await arrancar({ DB_FILE: ficheiro });
  const { d: { id: qid } } = await A.ana.chamar("POST", "/api/quizzes", { titulo: "Reinício", perguntas: [{ texto: "Sim?", opcoes: ["Sim", "Não"], certa: 0 }] });
  const { d: { pin } } = await A.ana.chamar("POST", `/api/quizzes/${qid}/vivo`, {});
  const aluno = navegador(A.base);
  await aluno("POST", `/j/api/${pin}/entrar`, { alcunha: "Falcão" });
  await new Promise((r) => setTimeout(r, 500)); // as gravações juntam-se (300 ms)
  const linha = A.db.prepare("SELECT dados FROM vivo_sessoes WHERE pin = ?").get(pin);
  assert.ok(linha && linha.dados.includes("Falcão"), "a sessão fica guardada na base de dados");
  // Simula o reinício: a sessão sai da memória (fechar também a apaga da base de dados, por isso volta a pôr-se a linha guardada).
  await A.ana.chamar("POST", `/api/vivo/${pin}/acao`, { acao: "fechar" });
  assert.strictEqual(A.db.prepare("SELECT COUNT(*) AS n FROM vivo_sessoes WHERE pin = ?").get(pin).n, 0, "fechar apaga a sessão guardada");
  A.db.prepare("INSERT INTO vivo_sessoes (pin, prof_id, dados, atualizado) VALUES (?, 0, ?, datetime('now'))").run(pin, linha.dados);
  await new Promise((r) => A.servidor.close(r));
  const B = await arrancar({ DB_FILE: ficheiro });
  t.after(() => B.servidor.close());
  const ana = await B.entrar("ana@escola.pt");
  const v = (await ana.chamar("GET", `/api/vivo/${pin}`)).d;
  assert.deepStrictEqual([v.fase, v.jogadores], ["sala", ["Falcão"]], "o jogo voltou com os jogadores");
  const alunoB = navegador(B.base);
  assert.strictEqual((await alunoB("GET", `/j/api/${pin}`)).d.ativo, true);
  assert.strictEqual((await ana.chamar("POST", `/api/vivo/${pin}/acao`, { acao: "comecar" })).d.fase, "pergunta");
  await ana.chamar("POST", `/api/vivo/${pin}/acao`, { acao: "fechar" });
});
