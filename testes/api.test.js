"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { criarServidor } = require("../server");

async function arrancar(extra = {}) {
  const { servidor } = criarServidor({ ...extra, DB_FILE: ":memory:", DATA_DIR: require("node:os").tmpdir() + "/eink-teste", SEGREDO: "teste", DEV_LOGIN: "1", ADMIN_USERS: "admin@escola.pt", DOMINIOS_PERMITIDOS: "escola.pt", BASE_URL: "http://localhost" });
  await new Promise((r) => servidor.listen(0, r));
  const base = "http://127.0.0.1:" + servidor.address().port;
  const entrar = async (upn, qs = "") => {
    const r = await fetch(base + "/auth/entrar?dev=" + upn + qs, { redirect: "manual" });
    const ck = (r.headers.getSetCookie()[0] || "").split(";")[0];
    const chamar = async (m, u, b) => {
      const r2 = await fetch(base + u, { method: m, headers: { cookie: ck, "x-requested-with": "eink", "content-type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) });
      return { estado: r2.status, d: await r2.json().catch(() => null) };
    };
    return { chamar, ck, status: r.status };
  };
  return { base, servidor, entrar };
}

test("API: docentes, turmas, notas e pauta", async (t) => {
  const { base, servidor, entrar } = await arrancar();
  t.after(() => servidor.close());

  assert.strictEqual((await fetch(base + "/api/turmas")).status, 401);
  assert.strictEqual((await entrar("aluno@escola.pt")).status, 403, "quem não foi autorizado não entra");

  const adm = await entrar("admin@escola.pt");
  assert.strictEqual((await adm.chamar("POST", "/api/admin/professores", { upn: "ana@escola.pt", nome: "Ana" })).estado, 200);
  assert.strictEqual((await adm.chamar("POST", "/api/admin/professores", { upn: "x@fora.pt" })).estado, 400, "domínio de fora");
  const ana = await entrar("ana@escola.pt");
  assert.strictEqual((await ana.chamar("GET", "/api/admin/professores")).estado, 403, "só administradores");

  const { d: { id: tid } } = await ana.chamar("POST", "/api/turmas", { nome: "7.º A", ano_letivo: "2026/2027" });
  await ana.chamar("POST", `/api/turmas/${tid}/alunos`, { texto: "1 Ana Silva\n2 Bruno Costa" });
  const turma = (await ana.chamar("GET", "/api/turmas/" + tid)).d;
  assert.strictEqual(turma.alunos.length, 2);
  assert.strictEqual(turma.periodos.length, 3);

  const per = turma.periodos[0].id;
  const { d: { id: aid } } = await ana.chamar("POST", `/api/periodos/${per}/avaliacoes`, { titulo: "Teste 1", tipo: "teste", peso: 1, maximo: 20 });
  const [a1, a2] = turma.alunos;
  assert.strictEqual((await ana.chamar("PUT", `/api/avaliacoes/${aid}/notas`, { linhas: [{ aluno: a1.id, nota: "15" }, { aluno: a2.id, nota: "8,5" }] })).estado, 200);
  assert.strictEqual((await ana.chamar("PUT", `/api/avaliacoes/${aid}/notas`, { linhas: [{ aluno: a1.id, nota: "25" }] })).estado, 400, "acima do máximo");

  const p = (await ana.chamar("GET", `/api/periodos/${per}/pauta`)).d;
  assert.strictEqual(p.alunos[0].final, 75);
  assert.strictEqual(p.alunos[0].nivel, 4);
  assert.strictEqual(p.alunos[1].final, 42.5);
  assert.strictEqual(p.alunos[1].nivel, 2);

  const gerais = (await ana.chamar("GET", "/api/grupos")).d[0].esquemas[0].criterios; // grupo «Geral»: testes e trabalhos 70 %, comportamento 30 %
  const comp = gerais.find((k) => k.tipo === "nivel").id;
  await ana.chamar("PUT", `/api/periodos/${per}/niveis`, { criterio: comp, aluno: a1.id, nivel: 5 });
  assert.strictEqual((await ana.chamar("GET", `/api/periodos/${per}/pauta`)).d.alunos[0].final, Math.round(75 * 0.7 + 95 * 0.3));

  const csv = await fetch(`${base}/api/periodos/${per}/pauta.csv`, { headers: { cookie: ana.ck } });
  assert.match(await csv.text(), /Ana Silva;.*Bruno Costa;/s);

  // Isolamento: outro docente não vê nem mexe nos dados da Ana.
  await adm.chamar("POST", "/api/admin/professores", { upn: "rui@escola.pt" });
  const rui = await entrar("rui@escola.pt");
  assert.strictEqual((await rui.chamar("GET", "/api/turmas/" + tid)).estado, 404);
  assert.strictEqual((await rui.chamar("GET", `/api/periodos/${per}/pauta`)).estado, 404);
  assert.strictEqual((await rui.chamar("PUT", `/api/avaliacoes/${aid}/notas`, { linhas: [] })).estado, 404);
  assert.strictEqual((await rui.chamar("DELETE", "/api/turmas/" + tid)).estado, 404);

  // Escrita sem o cabeçalho de defesa é recusada.
  const semCab = await fetch(base + "/api/turmas", { method: "POST", headers: { cookie: ana.ck, "content-type": "application/json" }, body: '{"nome":"X"}' });
  assert.strictEqual(semCab.status, 403);

  // Presenças
  assert.strictEqual((await ana.chamar("PUT", `/api/turmas/${tid}/presencas`, { data: "2026-11-02", estados: { [a1.id]: "P", [a2.id]: "F" } })).estado, 200);
  assert.deepStrictEqual((await ana.chamar("GET", `/api/turmas/${tid}/presencas?data=2026-11-02`)).d, { [a1.id]: "P", [a2.id]: "F" });
});

test("páginas: sem sessão vai para a entrada e há ficheiros estáticos", async (t) => {
  const { base, servidor } = await arrancar();
  t.after(() => servidor.close());
  const r = await fetch(base + "/", { redirect: "manual" });
  assert.strictEqual(r.status, 302);
  assert.strictEqual((await fetch(base + "/entrar.html")).status, 200);
  assert.strictEqual((await fetch(base + "/estilo.css")).status, 200);
  assert.strictEqual((await fetch(base + "/../server.js")).status, 404);
});

test("API: critérios por grupo disciplinar e média ponderada com vários testes", async (t) => {
  const { servidor, entrar } = await arrancar();
  t.after(() => servidor.close());
  const adm = await entrar("admin@escola.pt");
  await adm.chamar("POST", "/api/admin/professores", { upn: "ana@escola.pt", nome: "Ana" });
  const ana = await entrar("ana@escola.pt");

  // Só o administrador cria grupos e critérios.
  assert.strictEqual((await ana.chamar("POST", "/api/admin/grupos", { nome: "550 Informática" })).estado, 403);
  const { d: { id: gid } } = await adm.chamar("POST", "/api/admin/grupos", { nome: "550 Informática" });
  assert.strictEqual((await adm.chamar("POST", "/api/admin/grupos", { nome: "550 Informática" })).estado, 400, "nome repetido");
  const esq = (await adm.chamar("GET", "/api/grupos")).d.find((g) => g.id === gid).esquemas[0];
  const cri = esq.criterios, eid = esq.id;
  assert.strictEqual(esq.ano, 0, "o esquema base é o de todos os anos");

  // Os pesos têm de somar 100 %.
  const lista = (extra) => ({ criterios: [{ id: cri[0].id, nome: "Testes", peso: 60, tipo: "testes" }, { nome: "Trabalhos", peso: 20, tipo: "testes" }, { id: cri[1].id, nome: "Atitudes", peso: 20 + extra, tipo: "nivel" }] });
  const mau = await adm.chamar("PUT", "/api/admin/esquemas/" + eid, lista(5));
  assert.strictEqual(mau.estado, 400);
  assert.match(mau.d.erro, /100 %/);
  const bom = await adm.chamar("PUT", "/api/admin/esquemas/" + eid, lista(0));
  assert.strictEqual(bom.estado, 200);
  const [kTestes, kTrab, kAtit] = bom.d.esquemas[0].criterios;
  assert.deepStrictEqual(bom.d.esquemas[0].criterios.map((k) => k.peso), [60, 20, 20]);

  // A docente cria a turma nesse grupo e lança vários testes.
  const { d: { id: tid } } = await ana.chamar("POST", "/api/turmas", { nome: "7.º B", grupo_id: gid });
  await ana.chamar("POST", `/api/turmas/${tid}/alunos`, { texto: "1 Ana\n2 Bruno" });
  const turma = (await ana.chamar("GET", "/api/turmas/" + tid)).d;
  assert.strictEqual(turma.grupo.criterios.length, 3);
  const per = turma.periodos[0].id, [a1, a2] = turma.alunos;
  const nova = async (titulo, criterio, peso, maximo) => (await ana.chamar("POST", `/api/periodos/${per}/avaliacoes`, { titulo, criterio, peso, maximo })).d.id;
  const t1 = await nova("Teste 1", kTestes.id, 1, 20), t2 = await nova("Teste 2", kTestes.id, 2, 100), tr = await nova("Projeto", kTrab.id, 1, 20);
  assert.strictEqual((await ana.chamar("POST", `/api/periodos/${per}/avaliacoes`, { titulo: "X", criterio: kAtit.id })).estado, 400, "critério de nível não aceita testes");
  const notas = async (aval, v1, v2) => ana.chamar("PUT", `/api/avaliacoes/${aval}/notas`, { linhas: [{ aluno: a1.id, nota: String(v1) }, { aluno: a2.id, nota: String(v2) }] });
  await notas(t1, 16, 8); // 80 % e 40 %
  await notas(t2, 50, 70); // 50 % e 70 %, peso 2
  await notas(tr, 18, 10); // 90 % e 50 %
  await ana.chamar("PUT", `/api/periodos/${per}/niveis`, { criterio: kAtit.id, aluno: a1.id, nivel: 4 }); // 80 %
  const p = (await ana.chamar("GET", `/api/periodos/${per}/pauta`)).d;
  const [r1, r2] = p.alunos;
  assert.strictEqual(r1.criterios[kTestes.id], 60); // (80*1 + 50*2) / 3
  assert.strictEqual(r1.final, Math.round(60 * 0.6 + 90 * 0.2 + 80 * 0.2)); // 70
  assert.strictEqual(r1.parcial, false);
  assert.strictEqual(r2.criterios[kTestes.id], 60); // (40*1 + 70*2) / 3 = 60
  assert.strictEqual(r2.final, 57.5); // sem atitudes: renormaliza (46 / 0,8)
  assert.strictEqual(r2.parcial, true);

  // Um critério com avaliações lançadas não se retira; o administrador altera os pesos e a pauta acompanha.
  const semTrab = await adm.chamar("PUT", "/api/admin/esquemas/" + eid, { criterios: [{ id: kTestes.id, nome: "Testes", peso: 80, tipo: "testes" }, { id: kAtit.id, nome: "Atitudes", peso: 20, tipo: "nivel" }] });
  assert.strictEqual(semTrab.estado, 409);
  await adm.chamar("PUT", "/api/admin/esquemas/" + eid, { criterios: [{ id: kTestes.id, nome: "Testes", peso: 40, tipo: "testes" }, { id: kTrab.id, nome: "Trabalhos", peso: 40, tipo: "testes" }, { id: kAtit.id, nome: "Atitudes", peso: 20, tipo: "nivel" }] });
  assert.strictEqual((await ana.chamar("GET", `/api/periodos/${per}/pauta`)).d.alunos[0].final, Math.round(60 * 0.4 + 90 * 0.4 + 80 * 0.2)); // 76
  assert.strictEqual((await adm.chamar("PUT", "/api/admin/esquemas/" + eid, { criterios: [{ id: kAtit.id, nome: "Atitudes", peso: 100, tipo: "testes" }] })).estado, 409, "não muda o tipo");

  // Um docente não usa critérios de outro grupo, e o grupo com turmas não se apaga.
  const outro = (await adm.chamar("GET", "/api/grupos")).d.find((g) => g.nome === "Geral").esquemas[0].criterios[0].id;
  assert.strictEqual((await ana.chamar("POST", `/api/periodos/${per}/avaliacoes`, { titulo: "Y", criterio: outro })).estado, 400);
  assert.strictEqual((await adm.chamar("DELETE", "/api/admin/grupos/" + gid)).estado, 409);

  // CSV com a média de cada critério
  const csv = await (await fetch(`http://127.0.0.1:${servidor.address().port}/api/periodos/${per}/pauta.csv`, { headers: { cookie: ana.ck } })).text();
  assert.match(csv, /Média Testes \(40 %\)/);
  assert.match(csv, /Média Trabalhos \(40 %\)/);
});

test("API: grelha de um teste, casas decimais e entrada pelo grupo do Entra ID", async (t) => {
  const { base, servidor, entrar } = await arrancar();
  t.after(() => servidor.close());
  const adm = await entrar("admin@escola.pt");
  await adm.chamar("POST", "/api/admin/professores", { upn: "ana@escola.pt" });
  const ana = await entrar("ana@escola.pt");
  const { d: { id: tid } } = await ana.chamar("POST", "/api/turmas", { nome: "8.º A" });
  await ana.chamar("POST", `/api/turmas/${tid}/alunos`, { texto: "1 Ana\n2 Bruno\n3 Carla" });
  const turma = (await ana.chamar("GET", "/api/turmas/" + tid)).d, per = turma.periodos[0].id, [a1, a2, a3] = turma.alunos;
  const { d: { id: av } } = await ana.chamar("POST", `/api/periodos/${per}/avaliacoes`, { titulo: "Teste 1", peso: 1, maximo: 100 });

  // O docente define a grelha: 3 questões, cotações 8 + 7 + 5 = 20 pontos.
  const g = await ana.chamar("PUT", `/api/avaliacoes/${av}/grelha`, { itens: [{ grupo: "Grupo I", nome: "1.", cotacao: 8 }, { grupo: "Grupo I", nome: "2.", cotacao: "7" }, { grupo: "Grupo II", nome: "3.", cotacao: 5 }] });
  assert.strictEqual(g.estado, 200);
  assert.strictEqual(g.d.avaliacao.maximo, 20);
  const [i1, i2, i3] = g.d.itens;
  assert.strictEqual((await ana.chamar("PUT", `/api/avaliacoes/${av}/notas`, { linhas: [{ aluno: a1.id, nota: "10" }] })).estado, 409, "com grelha, a nota vem das pontuações");

  const marcar = (aluno, item, nota) => ({ aluno: aluno.id, item: item.id, nota });
  const r = await ana.chamar("PUT", `/api/avaliacoes/${av}/grelha/notas`, { linhas: [marcar(a1, i1, "8"), marcar(a1, i2, "5,5"), marcar(a1, i3, "3"), marcar(a2, i1, "4"), marcar(a2, i3, "2,5")] });
  assert.strictEqual(r.estado, 200);
  const totais = Object.fromEntries(r.d.alunos.map((x) => [x.id, x.total]));
  assert.strictEqual(totais[a1.id], 16.5);
  assert.strictEqual(totais[a2.id], 6.5);
  assert.strictEqual(totais[a3.id], null, "sem pontuações, sem nota");
  assert.strictEqual((await ana.chamar("PUT", `/api/avaliacoes/${av}/grelha/notas`, { linhas: [marcar(a1, i3, "6")] })).estado, 400, "acima da cotação");

  // O total da grelha chega à pauta (82,5 % e 32,5 %); a nota final do grupo «Geral» usa 1 casa decimal.
  let p = (await ana.chamar("GET", `/api/periodos/${per}/pauta`)).d;
  assert.strictEqual(p.avaliacoes[0].n_itens, 3);
  assert.strictEqual(p.alunos[0].final, 82.5);
  assert.strictEqual(p.alunos[1].final, 32.5);
  assert.strictEqual(p.alunos[2].final, null);

  // Não se baixa a cotação abaixo de uma pontuação já lançada.
  assert.strictEqual((await ana.chamar("PUT", `/api/avaliacoes/${av}/grelha`, { itens: [{ id: i1.id, nome: "1.", cotacao: 6 }, { id: i2.id, nome: "2.", cotacao: 7 }, { id: i3.id, nome: "3.", cotacao: 5 }] })).estado, 409);
  // Mudar a cotação recalcula o máximo e a pauta: item 3 passa a valer 10 (a1 fica com 16,5/25 = 66 %).
  await ana.chamar("PUT", `/api/avaliacoes/${av}/grelha`, { itens: [{ id: i1.id, nome: "1.", cotacao: 8 }, { id: i2.id, nome: "2.", cotacao: 7 }, { id: i3.id, nome: "3.", cotacao: 10 }] });
  p = (await ana.chamar("GET", `/api/periodos/${per}/pauta`)).d;
  assert.strictEqual(p.alunos[0].final, 66);

  // Outro docente não mexe na grelha.
  await adm.chamar("POST", "/api/admin/professores", { upn: "rui@escola.pt" });
  const rui = await entrar("rui@escola.pt");
  assert.strictEqual((await rui.chamar("GET", `/api/avaliacoes/${av}/grelha`)).estado, 404);
  assert.strictEqual((await rui.chamar("PUT", `/api/avaliacoes/${av}/grelha/notas`, { linhas: [] })).estado, 404);

  // Duas casas decimais, escolhidas pelo administrador no grupo.
  const geral = (await adm.chamar("GET", "/api/grupos")).d[0].esquemas[0];
  assert.strictEqual((await adm.chamar("PUT", "/api/admin/esquemas/" + geral.id, { casas: 3, criterios: geral.criterios })).estado, 400);
  assert.strictEqual((await adm.chamar("PUT", "/api/admin/esquemas/" + geral.id, { casas: 2, criterios: geral.criterios })).d.esquemas[0].casas, 2);
  const { d: { id: av2 } } = await ana.chamar("POST", `/api/periodos/${per}/avaliacoes`, { titulo: "Ficha", peso: 1, maximo: 3 });
  await ana.chamar("PUT", `/api/avaliacoes/${av2}/notas`, { linhas: [{ aluno: a3.id, nota: "2" }] }); // 66,666...
  p = (await ana.chamar("GET", `/api/periodos/${per}/pauta`)).d;
  assert.strictEqual(p.alunos[2].final, 66.67);
  assert.strictEqual(p.alunos[0].final, 66);
  void base;
});

test("Entrada pelo grupo «docentes» do Entra ID (como no helpdesk)", async (t) => {
  const { servidor, entrar } = await arrancar({ GRUPO_DOCENTES_ID: "11111111-2222-3333-4444-555555555555", GRUPO_ADMIN_ID: "66666666-7777-8888-9999-000000000000" });
  t.after(() => servidor.close());
  // Quem pertence ao grupo entra sem ninguém o ter adicionado e fica registado.
  const ana = await entrar("ana@escola.pt");
  assert.strictEqual(ana.status, 302);
  const eu = (await ana.chamar("GET", "/api/eu")).d;
  assert.strictEqual(eu.admin, false);
  assert.strictEqual(eu.grupoDocentes, true);
  assert.strictEqual((await ana.chamar("GET", "/api/admin/professores")).estado, 403);
  // Quem não pertence ao grupo não entra (um aluno, por exemplo).
  assert.strictEqual((await entrar("aluno@escola.pt", "&fora=1")).status, 403);
  // Quem pertence ao grupo de administradores é administrador.
  const adm = await entrar("chefe@escola.pt", "&admin=1");
  assert.strictEqual((await adm.chamar("GET", "/api/eu")).d.admin, true);
  assert.strictEqual((await adm.chamar("GET", "/api/admin/professores")).d.length, 2);
  // Ao sair do grupo, a conta fica desativada e a sessão deixa de valer.
  assert.strictEqual((await entrar("ana@escola.pt", "&fora=1")).status, 403);
  assert.strictEqual((await ana.chamar("GET", "/api/turmas")).estado, 401);
  // Voltando ao grupo, volta a entrar.
  assert.strictEqual((await entrar("ana@escola.pt")).status, 302);
});

test("Graph: pertença ao grupo (200 sim, 404 não, outro código erro)", async (t) => {
  const http = require("node:http");
  const { ehMembro } = require("../lib/grupo");
  const GID = "11111111-2222-3333-4444-555555555555";
  const g = http.createServer((req, res) => { const ok = req.headers.authorization === "Bearer bom"; res.statusCode = req.url === "/me/memberOf/" + GID ? (ok ? 200 : req.headers.authorization === "Bearer erro" ? 500 : 404) : 404; res.end("{}"); });
  await new Promise((r) => g.listen(0, r)); t.after(() => g.close());
  const graphUrl = "http://127.0.0.1:" + g.address().port;
  assert.strictEqual(await ehMembro("bom", GID, { graphUrl }), true);
  assert.strictEqual(await ehMembro("mau", GID, { graphUrl }), false);
  await assert.rejects(ehMembro("erro", GID, { graphUrl }), /Graph/);
  await assert.rejects(ehMembro("bom", "nao-e-guid", { graphUrl }), /GUID/);
  assert.strictEqual(await ehMembro("", GID, { graphUrl }), false);
});

test("API: critérios por disciplina e por ano de escolaridade", async (t) => {
  const { servidor, entrar } = await arrancar();
  t.after(() => servidor.close());
  const adm = await entrar("admin@escola.pt");
  await adm.chamar("POST", "/api/admin/professores", { upn: "ana@escola.pt" });
  const ana = await entrar("ana@escola.pt");
  const { d: { id: gid } } = await adm.chamar("POST", "/api/admin/grupos", { nome: "550 Informática" });
  const base = (await adm.chamar("GET", "/api/grupos")).d.find((g) => g.id === gid).esquemas[0];

  // Turmas do 7.º e do 8.º ano, ainda sem esquema próprio: ambas usam o de «todos os anos».
  const nova = async (nome, ano) => (await ana.chamar("POST", "/api/turmas", { nome, ano, grupo_id: gid })).d.id;
  const t7 = await nova("7.º A", 7), t8 = await nova("8.º A", 8), t0 = await nova("Outra", undefined);
  assert.strictEqual((await ana.chamar("POST", "/api/turmas", { nome: "X", ano: 13, grupo_id: gid })).estado, 400);
  assert.strictEqual((await ana.chamar("GET", "/api/turmas/" + t8)).d.grupo.ano, 0);

  // O administrador cria o esquema do 8.º ano (cópia do base) e muda-lhe os pesos: só as turmas do 8.º ano o usam.
  assert.strictEqual((await ana.chamar("POST", `/api/admin/grupos/${gid}/esquemas`, { ano: 8 })).estado, 403);
  assert.strictEqual((await adm.chamar("POST", `/api/admin/grupos/${gid}/esquemas`, { ano: 0 })).estado, 400);
  const { d: { id: e8 } } = await adm.chamar("POST", `/api/admin/grupos/${gid}/esquemas`, { ano: 8 });
  assert.strictEqual((await adm.chamar("POST", `/api/admin/grupos/${gid}/esquemas`, { ano: 8 })).estado, 400, "já existe");
  const g = (await adm.chamar("GET", "/api/grupos")).d.find((x) => x.id === gid);
  assert.deepStrictEqual(g.esquemas.map((e) => e.ano), [0, 8]);
  const c8 = g.esquemas[1].criterios;
  assert.deepStrictEqual(c8.map((k) => k.peso), [70, 30], "começa como cópia do base");
  assert.notDeepStrictEqual(c8.map((k) => k.id), base.criterios.map((k) => k.id), "critérios próprios");
  const r = await adm.chamar("PUT", "/api/admin/esquemas/" + e8, { casas: 2, criterios: [{ id: c8[0].id, nome: "Testes", peso: 50, tipo: "testes" }, { nome: "Fichas", peso: 30, tipo: "testes" }, { id: c8[1].id, nome: "Atitudes", peso: 20, tipo: "nivel" }] });
  assert.strictEqual(r.estado, 200);
  const turma8 = (await ana.chamar("GET", "/api/turmas/" + t8)).d, turma7 = (await ana.chamar("GET", "/api/turmas/" + t7)).d, turma0 = (await ana.chamar("GET", "/api/turmas/" + t0)).d;
  assert.strictEqual(turma8.grupo.ano, 8);
  assert.strictEqual(turma8.grupo.casas, 2);
  assert.deepStrictEqual(turma8.grupo.criterios.map((k) => k.peso), [50, 30, 20]);
  assert.strictEqual(turma7.grupo.ano, 0);
  assert.deepStrictEqual(turma7.grupo.criterios.map((k) => k.peso), [70, 30]);
  assert.strictEqual(turma0.grupo.ano, 0);

  // A pauta do 8.º ano calcula pelos pesos do 8.º; a do 7.º, pelos do base.
  for (const [tid, notaA, notaB] of [[t8, 80, 60], [t7, 80, 60]]) {
    await ana.chamar("POST", `/api/turmas/${tid}/alunos`, { texto: "1 Ana" });
    const tu = (await ana.chamar("GET", "/api/turmas/" + tid)).d, per = tu.periodos[0].id, crit = tu.grupo.criterios.filter((k) => k.tipo === "testes");
    for (const [k, nota] of [[crit[0], notaA], [crit[1], notaB]]) {
      if (!k) continue;
      const { d: { id: av } } = await ana.chamar("POST", `/api/periodos/${per}/avaliacoes`, { titulo: "T", criterio: k.id, peso: 1, maximo: 100 });
      await ana.chamar("PUT", `/api/avaliacoes/${av}/notas`, { linhas: [{ aluno: tu.alunos[0].id, nota: String(nota) }] });
    }
  }
  const p8 = (await ana.chamar("GET", `/api/periodos/${turma8.periodos[0].id}/pauta`)).d.alunos[0];
  assert.strictEqual(p8.final, 72.5); // (80*50 + 60*30) / 80 = 72,5 (2 casas)
  const p7 = (await ana.chamar("GET", `/api/periodos/${turma7.periodos[0].id}/pauta`)).d.alunos[0];
  assert.strictEqual(p7.final, 80); // só o critério «Testes e trabalhos» tem notas

  // Com avaliações lançadas, não se cria nem se apaga um esquema que mudaria os critérios dessas turmas.
  assert.strictEqual((await adm.chamar("POST", `/api/admin/grupos/${gid}/esquemas`, { ano: 7 })).estado, 409);
  assert.strictEqual((await adm.chamar("DELETE", "/api/admin/esquemas/" + e8)).estado, 409);
  assert.strictEqual((await adm.chamar("DELETE", "/api/admin/esquemas/" + base.id)).estado, 400, "o base não se apaga");
  // Sem turmas com dados nesse ano, apaga-se.
  const { d: { id: e9 } } = await adm.chamar("POST", `/api/admin/grupos/${gid}/esquemas`, { ano: 9 });
  assert.strictEqual((await adm.chamar("DELETE", "/api/admin/esquemas/" + e9)).estado, 200);
});
