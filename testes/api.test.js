"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { criarServidor } = require("../server");

async function arrancar(extra = {}) {
  const { servidor, db } = criarServidor({ ...extra, DB_FILE: ":memory:", DATA_DIR: require("node:os").tmpdir() + "/eink-teste", SEGREDO: "teste", DEV_LOGIN: "1", ADMIN_USERS: "admin@escola.pt", DOMINIOS_PERMITIDOS: "escola.pt", BASE_URL: "http://localhost" });
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
  return { base, servidor, entrar, db };
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

  const gerais = (await ana.chamar("GET", "/api/grupos")).d.find((g) => g.nome === "Geral").esquemas[0].criterios; // grupo «Geral»: testes e trabalhos 70 %, comportamento 30 %
  const comp = gerais.find((k) => k.tipo === "nivel").id;
  await ana.chamar("PUT", `/api/periodos/${per}/niveis`, { criterio: comp, aluno: a1.id, nivel: 5 });
  assert.strictEqual((await ana.chamar("GET", `/api/periodos/${per}/pauta`)).d.alunos[0].final, Math.round(75 * 0.7 + 95 * 0.3));
  // Comportamento em percentagem (0 a 100) em vez de nível
  const pc = (valor) => ana.chamar("PUT", `/api/periodos/${per}/niveis`, { criterio: comp, aluno: a1.id, valor });
  assert.strictEqual((await pc("60 %")).estado, 200);
  let al0 = (await ana.chamar("GET", `/api/periodos/${per}/pauta`)).d.alunos[0];
  assert.strictEqual(al0.final, 70.5); assert.strictEqual(al0.compPct[comp], 60); assert.strictEqual(al0.niveis[comp], 3);
  assert.strictEqual((await pc("72,5%")).estado, 200); assert.strictEqual((await ana.chamar("GET", `/api/periodos/${per}/pauta`)).d.alunos[0].compPct[comp], 72.5);
  assert.strictEqual((await pc("101")).estado, 400); assert.strictEqual((await pc("muito bom")).estado, 400);
  assert.strictEqual((await pc("5")).estado, 200); al0 = (await ana.chamar("GET", `/api/periodos/${per}/pauta`)).d.alunos[0];
  assert.strictEqual(al0.compPct[comp], undefined); assert.strictEqual(al0.final, Math.round(75 * 0.7 + 95 * 0.3));

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
  const geral = (await adm.chamar("GET", "/api/grupos")).d.find((g) => g.nome === "Geral").esquemas[0];
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

test("API: copiar grelha, reordenar questões, intercalares e Excel", async (t) => {
  const { base, servidor, entrar } = await arrancar();
  t.after(() => servidor.close());
  const adm = await entrar("admin@escola.pt");
  await adm.chamar("POST", "/api/admin/professores", { upn: "ana@escola.pt" });
  await adm.chamar("POST", "/api/admin/professores", { upn: "rui@escola.pt" });
  const ana = await entrar("ana@escola.pt"), rui = await entrar("rui@escola.pt");
  const { d: { id: tid } } = await ana.chamar("POST", "/api/turmas", { nome: "7.º A" });
  await ana.chamar("POST", `/api/turmas/${tid}/alunos`, { texto: "1 Ana\n2 Bruno\n3 Carla" });
  const turma = (await ana.chamar("GET", "/api/turmas/" + tid)).d, per = turma.periodos[0].id, [a1, a2, a3] = turma.alunos;
  const nova = async (titulo) => (await ana.chamar("POST", `/api/periodos/${per}/avaliacoes`, { titulo, peso: 1 })).d.id;
  const t1 = await nova("Teste 1"), t2 = await nova("Teste 2");

  // Reordenar: a ordem da lista é a ordem das questões e os ids mantêm-se (as pontuações acompanham a questão).
  const g = (await ana.chamar("PUT", `/api/avaliacoes/${t1}/grelha`, { itens: [{ grupo: "I", nome: "1.", cotacao: 6 }, { grupo: "I", nome: "2.", cotacao: 4 }, { grupo: "II", nome: "3.", cotacao: 10 }] })).d;
  const [i1, i2, i3] = g.itens;
  await ana.chamar("PUT", `/api/avaliacoes/${t1}/grelha/notas`, { linhas: [{ aluno: a1.id, item: i3.id, nota: "9" }, { aluno: a1.id, item: i1.id, nota: "5" }] });
  const r = (await ana.chamar("PUT", `/api/avaliacoes/${t1}/grelha`, { itens: [i3, i1, i2].map((i) => ({ id: i.id, grupo: i.grupo, nome: i.nome, cotacao: i.cotacao })) })).d;
  assert.deepStrictEqual(r.itens.map((i) => i.nome), ["3.", "1.", "2."]);
  assert.strictEqual(r.alunos[0].total, 14, "as pontuações ficam com a sua questão");

  // Copiar: só a estrutura. Não copia pontuações, nem de testes de outro docente, nem sobre pontuações sem confirmar.
  const c = await ana.chamar("POST", `/api/avaliacoes/${t2}/grelha/copiar`, { de: t1 });
  assert.strictEqual(c.estado, 200);
  assert.deepStrictEqual(c.d.itens.map((i) => [i.grupo, i.nome, i.cotacao]), [["II", "3.", 10], ["I", "1.", 6], ["I", "2.", 4]]);
  assert.strictEqual(c.d.avaliacao.maximo, 20);
  assert.ok(c.d.alunos.every((x) => x.total === null), "sem pontuações copiadas");
  assert.strictEqual((await ana.chamar("GET", "/api/grelhas")).d.length, 2);
  assert.strictEqual((await rui.chamar("GET", "/api/grelhas")).d.length, 0);
  assert.strictEqual((await rui.chamar("POST", `/api/avaliacoes/${t2}/grelha/copiar`, { de: t1 })).estado, 404);
  const tr = (await rui.chamar("POST", "/api/turmas", { nome: "9.º B" })).d.id, pr = (await rui.chamar("GET", "/api/turmas/" + tr)).d.periodos[0].id;
  const tRui = (await rui.chamar("POST", `/api/periodos/${pr}/avaliacoes`, { titulo: "X", peso: 1 })).d.id;
  assert.strictEqual((await rui.chamar("POST", `/api/avaliacoes/${tRui}/grelha/copiar`, { de: t1 })).estado, 404, "não copia de outro docente");
  await ana.chamar("PUT", `/api/avaliacoes/${t2}/grelha/notas`, { linhas: [{ aluno: a2.id, item: c.d.itens[0].id, nota: "7" }] });
  assert.strictEqual((await ana.chamar("POST", `/api/avaliacoes/${t2}/grelha/copiar`, { de: t1 })).estado, 409);
  assert.strictEqual((await ana.chamar("POST", `/api/avaliacoes/${t2}/grelha/copiar`, { de: t1, substituir: true })).estado, 200);

  // Intercalares: a proposta vem da nota; descritiva guardada; só o dono acede.
  const nota = async (aval, aluno, v) => ana.chamar("PUT", `/api/avaliacoes/${aval}/grelha/notas`, { linhas: [{ aluno: aluno.id, item: (await ana.chamar("GET", `/api/avaliacoes/${aval}/grelha`)).d.itens[0].id, nota: String(v) }] });
  await nota(t2, a2, 5); await nota(t2, a3, 10); // a grelha de T2 vale 20 pontos: 5 = 25 % e 10 = 50 %
  let i = (await ana.chamar("GET", `/api/periodos/${per}/intercalares?n=1`)).d;
  assert.deepStrictEqual(i.mencoes.map((m) => m.nome), ["Não satisfaz", "Satisfaz", "Satisfaz bastante"]);
  const prop = await ana.chamar("POST", `/api/periodos/${per}/intercalares/propor`, { n: 1 });
  assert.strictEqual(prop.estado, 200);
  const por = Object.fromEntries(prop.d.alunos.map((a) => [a.nome, a.mencao]));
  assert.strictEqual(por.Ana, "sb", "Ana: 14/20 = 70 % = nível 4 = Satisfaz bastante");
  assert.strictEqual(por.Bruno, "ns", "Bruno: 25 % = nível 2 = Não satisfaz");
  assert.strictEqual(por.Carla, "st", "Carla: 50 % = nível 3 = Satisfaz");
  await ana.chamar("PUT", `/api/periodos/${per}/intercalares`, { n: 1, linhas: [{ aluno: a1.id, mencao: "sb", descritiva: "  Bom trabalho.\nContinuar assim.  " }] });
  i = (await ana.chamar("GET", `/api/periodos/${per}/intercalares?n=1`)).d;
  assert.strictEqual(i.alunos[0].mencao, "sb");
  assert.strictEqual(i.alunos[0].descritiva, "Bom trabalho.\nContinuar assim.");
  assert.strictEqual((await ana.chamar("PUT", `/api/periodos/${per}/intercalares`, { n: 1, linhas: [{ aluno: a1.id, mencao: "ótimo" }] })).estado, 400);
  assert.strictEqual((await ana.chamar("PUT", `/api/periodos/${per}/intercalares`, { n: 3, linhas: [] })).estado, 400);
  assert.strictEqual((await rui.chamar("GET", `/api/periodos/${per}/intercalares?n=1`)).estado, 404);
  // Menção e descritiva vazias apagam o registo
  await ana.chamar("PUT", `/api/periodos/${per}/intercalares`, { n: 1, linhas: [{ aluno: a1.id, mencao: null, descritiva: "" }] });
  assert.strictEqual((await ana.chamar("GET", `/api/periodos/${per}/intercalares?n=1`)).d.alunos[0].mencao, null);
  assert.strictEqual((await ana.chamar("GET", `/api/periodos/${per}/intercalares?n=2`)).d.alunos[0].mencao, null, "a 2.ª é independente");

  // Excel
  await ana.chamar("PUT", `/api/periodos/${per}/intercalares`, { n: 2, linhas: [{ aluno: a2.id, mencao: "st", descritiva: "Tem de estudar mais." }] });
  const x = await fetch(`${base}/api/periodos/${per}/pauta.xlsx`, { headers: { cookie: ana.ck } });
  assert.strictEqual(x.status, 200);
  assert.match(x.headers.get("content-type"), /spreadsheetml/);
  const buf = Buffer.from(await x.arrayBuffer());
  assert.strictEqual(buf.subarray(0, 2).toString(), "PK");
  assert.ok(buf.includes("xl/worksheets/sheet2.xml"), "tem a folha da intercalar");
  assert.strictEqual((await fetch(`${base}/api/periodos/${per}/pauta.xlsx`, { headers: { cookie: rui.ck } })).status, 404);
});

test("API: fechar período, registo de alterações, importar alunos, arquivo, cópias e alertas", async (t) => {
  const { base, servidor, entrar, db } = await arrancar();
  t.after(() => servidor.close());
  const adm = await entrar("admin@escola.pt");
  await adm.chamar("POST", "/api/admin/professores", { upn: "ana@escola.pt" });
  const ana = await entrar("ana@escola.pt");
  const { d: { id: tid } } = await ana.chamar("POST", "/api/turmas", { nome: "7.º A", ano_letivo: "2025/2026" });

  // Importar alunos: texto colado do Excel (tabulações, com email) e ficheiros .xlsx e .csv.
  assert.strictEqual((await ana.chamar("POST", `/api/turmas/${tid}/alunos`, { texto: "N.º\tNome\tEmail\n1\tAna Silva\tana@x.pt\n2\tBruno Costa\t\n3 Carla Mendes" })).d.adicionados, 3);
  const { criarXlsx } = require("../lib/xlsx");
  const xl = criarXlsx([{ nome: "A", linhas: [["Número", "Nome", "E-mail"], [4, "Diogo Santos", "diogo@x.pt"], [5, "Eva Rocha & Filha", null]] }]);
  const imp = await ana.chamar("POST", "/api/importar/alunos", { nome: "turma.xlsx", base64: xl.toString("base64") });
  assert.strictEqual(imp.d.total, 2);
  assert.match(imp.d.texto, /4\tDiogo Santos\tdiogo@x\.pt/);
  assert.match(imp.d.texto, /Eva Rocha & Filha/);
  const csv = await ana.chamar("POST", "/api/importar/alunos", { nome: "turma.csv", base64: Buffer.from("Nome;Número\nFilipe Lopes;6\n").toString("base64") });
  assert.match(csv.d.texto, /6\tFilipe Lopes/);
  assert.strictEqual((await ana.chamar("POST", "/api/importar/alunos", { nome: "x.xlsx", base64: Buffer.from("lixo").toString("base64") })).estado, 400);
  await ana.chamar("POST", `/api/turmas/${tid}/alunos`, { texto: imp.d.texto });
  const turma = (await ana.chamar("GET", "/api/turmas/" + tid)).d, per = turma.periodos[0].id;
  assert.strictEqual(turma.alunos.length, 5);
  assert.strictEqual(db.prepare("SELECT email FROM alunos WHERE nome = 'Ana Silva'").get().email, "ana@x.pt");

  // Notas e registo de alterações.
  const av = (await ana.chamar("POST", `/api/periodos/${per}/avaliacoes`, { titulo: "Teste 1", peso: 1, maximo: 20 })).d.id;
  const [a1, a2] = turma.alunos;
  await ana.chamar("PUT", `/api/avaliacoes/${av}/notas`, { linhas: [{ aluno: a1.id, nota: "8" }, { aluno: a2.id, nota: "15" }] });
  await ana.chamar("PUT", `/api/avaliacoes/${av}/notas`, { linhas: [{ aluno: a1.id, nota: "9" }, { aluno: a2.id, nota: "15" }] });
  const hist = (await ana.chamar("GET", `/api/periodos/${per}/auditoria`)).d;
  const mud = hist.find((h) => h.acao === "Nota" && h.aluno === "Ana Silva" && h.depois === "9");
  assert.ok(mud, "a alteração 8 → 9 ficou registada");
  assert.strictEqual(mud.antes, "8");
  assert.strictEqual(mud.quem, "ana@escola.pt");
  assert.ok(hist.some((h) => h.acao === "Avaliação criada"));
  assert.strictEqual(hist.filter((h) => h.acao === "Nota" && h.aluno === "Bruno Costa").length, 1, "só se regista o que mudou");
  assert.strictEqual((await adm.chamar("GET", "/api/admin/auditoria?aluno=Ana")).d.length > 0, true);
  assert.strictEqual((await ana.chamar("GET", "/api/admin/auditoria")).estado, 403);

  // Alertas: nota abaixo de 50 % e faltas.
  const dias = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"];
  for (const d of dias) await ana.chamar("PUT", `/api/turmas/${tid}/presencas`, { data: d, estados: { [a2.id]: "F" } });
  const al = (await ana.chamar("GET", "/api/alertas")).d;
  assert.deepStrictEqual(al.alertas.map((x) => x.aluno), ["Ana Silva", "Bruno Costa"].filter((n) => n === "Ana Silva" || n === "Bruno Costa"));
  assert.match(al.alertas.find((x) => x.aluno === "Ana Silva").motivos[0], /45 %/);
  assert.match(al.alertas.find((x) => x.aluno === "Bruno Costa").motivos[0], /5 faltas/);

  // Fechar o período: ninguém altera, o administrador reabre.
  const lista = (await adm.chamar("GET", "/api/admin/periodos")).d;
  assert.ok(lista.some((x) => x.id === per && x.docente === "ana@escola.pt"));
  assert.strictEqual((await ana.chamar("POST", "/api/admin/periodos/fechar", { ids: [per], fechado: true })).estado, 403);
  assert.strictEqual((await adm.chamar("POST", "/api/admin/periodos/fechar", { nome: "1.º período", fechado: true })).d.alterados >= 1, true);
  for (const r of [
    ana.chamar("PUT", `/api/avaliacoes/${av}/notas`, { linhas: [{ aluno: a1.id, nota: "10" }] }),
    ana.chamar("POST", `/api/periodos/${per}/avaliacoes`, { titulo: "X", peso: 1 }),
    ana.chamar("PATCH", `/api/avaliacoes/${av}`, { peso: 2 }),
    ana.chamar("DELETE", `/api/avaliacoes/${av}`),
    ana.chamar("PUT", `/api/avaliacoes/${av}/grelha`, { itens: [{ nome: "1", cotacao: 20 }] }),
    ana.chamar("PUT", `/api/periodos/${per}/intercalares`, { n: 1, linhas: [{ aluno: a1.id, mencao: "st" }] }),
  ]) { const x = await r; assert.strictEqual(x.estado, 423, JSON.stringify(x.d)); assert.match(x.d.erro, /fechado/); }
  assert.strictEqual((await ana.chamar("GET", `/api/periodos/${per}/pauta`)).d.periodo.fechado, 1);
  assert.strictEqual((await ana.chamar("GET", `/api/periodos/${per}/pauta`)).estado, 200, "ler continua a poder-se");
  await adm.chamar("POST", "/api/admin/periodos/fechar", { ids: [per], fechado: false });
  assert.strictEqual((await ana.chamar("PUT", `/api/avaliacoes/${av}/notas`, { linhas: [{ aluno: a1.id, nota: "10" }] })).estado, 200);
  assert.ok((await adm.chamar("GET", "/api/admin/auditoria?acao=fechado")).d.length >= 1);

  // Arquivar e retenção.
  assert.strictEqual((await ana.chamar("POST", "/api/turmas/arquivar-ano", { ano_letivo: "2025/2026" })).d.arquivadas, 1);
  assert.strictEqual((await ana.chamar("GET", "/api/turmas")).d.length, 0);
  assert.strictEqual((await ana.chamar("GET", "/api/turmas?arquivadas=1")).d.length, 1);
  assert.strictEqual((await ana.chamar("GET", "/api/alertas")).d.alertas.length, 0, "turmas arquivadas não geram alertas");
  let priv = (await adm.chamar("GET", "/api/admin/privacidade")).d;
  assert.strictEqual(priv.anos, 5);
  assert.strictEqual(priv.arquivadas[0].expirada, false);
  assert.strictEqual((await adm.chamar("POST", "/api/admin/privacidade/retencao", { anos: 11 })).estado, 400);
  assert.strictEqual((await adm.chamar("POST", "/api/admin/privacidade/apagar", {})).estado, 400, "exige confirmação");
  assert.strictEqual((await adm.chamar("POST", "/api/admin/privacidade/apagar", { confirmar: "APAGAR" })).d.turmas, 0, "ainda dentro do prazo");
  db.prepare("UPDATE turmas SET arquivada_em = '2015-01-01T00:00:00.000Z'").run();
  assert.strictEqual((await adm.chamar("GET", "/api/admin/privacidade")).d.arquivadas[0].expirada, true);
  assert.strictEqual((await adm.chamar("POST", "/api/admin/privacidade/apagar", { confirmar: "APAGAR" })).d.turmas, 1);
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM alunos").get().n, 0);
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE turma_id IS NOT NULL").get().n, 0, "o registo da turma apagada também sai");

  // Cópias de segurança: criar, listar e descarregar uma cópia que se pode abrir.
  const cp = await adm.chamar("POST", "/api/admin/copias", {});
  assert.strictEqual(cp.estado, 200);
  assert.match(cp.d.nome, /^eink-\d{4}-\d{2}-\d{2}-\d{6}\.db\.gz$/);
  assert.strictEqual((await ana.chamar("POST", "/api/admin/copias", {})).estado, 403);
  const down = await fetch(`${base}/api/admin/copias/descarregar?nome=${cp.d.nome}`, { headers: { cookie: adm.ck } });
  assert.strictEqual(down.status, 200);
  const raw = require("node:zlib").gunzipSync(Buffer.from(await down.arrayBuffer()));
  assert.strictEqual(raw.subarray(0, 15).toString(), "SQLite format 3");
  assert.strictEqual((await fetch(`${base}/api/admin/copias/descarregar?nome=../../etc/passwd`, { headers: { cookie: adm.ck } })).status, 404);
  assert.strictEqual((await fetch(`${base}/api/admin/copias/descarregar?nome=${cp.d.nome}`, { headers: { cookie: ana.ck } })).status, 403);
});

test("Apreciações: textos pelos níveis, género e menção sugerida", async (t) => {
  const APR = require("../public/apreciacao.js");
  const r = APR.gerar({ nome: "Ana Ferreira", genero: "F", niveis: { assiduidade: 5, empenho: 4, conhecimentos: 2 } });
  assert.match(r.texto, /^Ana é assídua e pontual; mostra-se empenhada/);
  assert.match(r.texto, /No entanto, ela revela dificuldades/);
  assert.doesNotMatch(r.texto, /[{}|]/);
  assert.strictEqual(r.mencao, "sb"); // média 3,67
  const m = APR.gerar({ nome: "Bruno", genero: "M", niveis: { assiduidade: 1, empenho: 2 } });
  assert.match(m.texto, /^Bruno falta muito às aulas/);
  assert.strictEqual(m.mencao, "ns");
  assert.match(m.texto, /Será necessário que Bruno se empenhe mais/);
  assert.strictEqual(APR.gerar({ nome: "X", genero: "M", niveis: {} }).texto, "");
  assert.strictEqual(APR.gerar({ nome: "Carla", genero: "F", niveis: { empenho: 3, participacao: 3 } }).mencao, "st");
  // Todos os critérios têm 5 textos, sem marcas por resolver em nenhum género
  for (const c of APR.CRITERIOS) { assert.strictEqual(c.niveis.length, 5); for (const g of ["M", "F"]) for (let n = 1; n <= 5; n++) assert.doesNotMatch(APR.gerar({ nome: "Z", genero: g, niveis: { [c.id]: n } }).texto, /[{}|]/); }
  void t;
});

test("API: mapa de sala, quadros e sondagens (com votos públicos)", async (t) => {
  const { base, servidor, entrar } = await arrancar();
  t.after(() => servidor.close());
  const adm = await entrar("admin@escola.pt");
  await adm.chamar("POST", "/api/admin/professores", { upn: "ana@escola.pt" });
  await adm.chamar("POST", "/api/admin/professores", { upn: "rui@escola.pt" });
  const ana = await entrar("ana@escola.pt"), rui = await entrar("rui@escola.pt");
  const { d: { id: tid } } = await ana.chamar("POST", "/api/turmas", { nome: "7.º A" });
  await ana.chamar("POST", `/api/turmas/${tid}/alunos`, { texto: "1 Ana\n2 Bruno\n3 Carla" });
  const [a1, a2] = (await ana.chamar("GET", "/api/turmas/" + tid)).d.alunos;

  // Mapa de sala
  assert.deepStrictEqual((await ana.chamar("GET", `/api/turmas/${tid}/mapa`)).d.lugares, {});
  assert.strictEqual((await ana.chamar("PUT", `/api/turmas/${tid}/mapa`, { linhas: 3, colunas: 4, lugares: { "0,0": a1.id, "0,1": a2.id, "1,1": "x", "9,9": a1.id } })).estado, 200);
  const m = (await ana.chamar("GET", `/api/turmas/${tid}/mapa`)).d;
  assert.deepStrictEqual(m.lugares, { "0,0": a1.id, "0,1": a2.id, "1,1": "x" }, "o lugar fora da sala ignora-se");
  assert.strictEqual((await ana.chamar("PUT", `/api/turmas/${tid}/mapa`, { linhas: 3, colunas: 4, lugares: { "0,0": a1.id, "0,1": a1.id } })).estado, 400, "um aluno, um lugar");
  assert.strictEqual((await ana.chamar("PUT", `/api/turmas/${tid}/mapa`, { linhas: 20, colunas: 4, lugares: {} })).estado, 400);
  assert.strictEqual((await rui.chamar("GET", `/api/turmas/${tid}/mapa`)).estado, 404);
  assert.strictEqual((await rui.chamar("PUT", `/api/turmas/${tid}/mapa`, { linhas: 3, colunas: 4, lugares: { "0,0": a1.id } })).estado, 404);

  // Quadros
  const { d: { id: qid } } = await ana.chamar("POST", "/api/quadros", { nome: "Plano" });
  await ana.chamar("PUT", `/api/quadros/${qid}`, { notas: [{ id: "n1", x: 10, y: 20, cor: 2, texto: "Ideia" }, { id: "n2", x: 99999, y: -5, cor: 99, texto: "x".repeat(900) }] });
  const q = (await ana.chamar("GET", `/api/quadros/${qid}`)).d;
  assert.strictEqual(q.notas.length, 2);
  assert.deepStrictEqual([q.notas[1].x, q.notas[1].y, q.notas[1].cor, q.notas[1].texto.length], [3000, 0, 5, 500], "valores limitados");
  assert.strictEqual((await rui.chamar("GET", `/api/quadros/${qid}`)).estado, 404);
  assert.strictEqual((await rui.chamar("DELETE", `/api/quadros/${qid}`)).estado, 404);

  // Sondagem: o docente cria, os alunos votam sem sessão, o docente vê os resultados.
  assert.strictEqual((await ana.chamar("POST", "/api/sondagens", { pergunta: "Qual?", opcoes: ["a"] })).estado, 400);
  assert.strictEqual((await ana.chamar("POST", "/api/sondagens", { pergunta: "Qual?", opcoes: ["a", "A"] })).estado, 400, "opções repetidas");
  const { d: { id: sid, codigo } } = await ana.chamar("POST", "/api/sondagens", { pergunta: "Qual app usas mais?", opcoes: ["TikTok", "Instagram", "WhatsApp"] });
  assert.match(codigo, /^[A-Z2-9]{5}$/);
  const pagina = await fetch(`${base}/s/${codigo}`);
  assert.strictEqual(pagina.status, 200);
  assert.match(await pagina.text(), /sondagem\.js/);
  const info = await (await fetch(`${base}/s/api/${codigo}`)).json();
  assert.deepStrictEqual([info.pergunta, info.opcoes.length, info.aberta, info.votou], ["Qual app usas mais?", 3, true, false]);
  assert.ok(!("votos" in info), "os alunos não veem os resultados");
  const votar = (k, cookie) => fetch(`${base}/s/api/${codigo}/votar`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ opcao: k }) });
  const v1 = await votar(1);
  assert.strictEqual(v1.status, 200);
  const ck = (v1.headers.getSetCookie()[0] || "").split(";")[0];
  assert.match(ck, /^sv_/);
  assert.strictEqual((await votar(1, ck)).status, 409, "uma pessoa, um voto (por navegador)");
  assert.strictEqual((await votar(1)).status, 200, "outro navegador vota");
  assert.strictEqual((await votar(7)).status, 400);
  assert.strictEqual((await fetch(`${base}/s/api/ZZZZZ`)).status, 404);
  await ana.chamar("POST", `/api/sondagens/${sid}/voto`, { opcao: 0, delta: 1 }); // contagem à mão
  await ana.chamar("POST", `/api/sondagens/${sid}/voto`, { opcao: 2, delta: -1 }); // não desce de zero
  let s = (await ana.chamar("GET", `/api/sondagens/${sid}`)).d;
  assert.deepStrictEqual(s.votos, [1, 2, 0]);
  assert.strictEqual(s.total, 3);
  await ana.chamar("POST", `/api/sondagens/${sid}/estado`, { aberta: false });
  assert.strictEqual((await votar(0)).status, 409, "fechada");
  assert.strictEqual((await rui.chamar("GET", `/api/sondagens/${sid}`)).estado, 404);
  await ana.chamar("POST", `/api/sondagens/${sid}/repor`, {});
  assert.deepStrictEqual((await ana.chamar("GET", `/api/sondagens/${sid}`)).d.votos, [0, 0, 0]);
});

test("API: quizzes (editor, modelos do tic) e jogo ao vivo sem contas de aluno", async (t) => {
  const { base, servidor, entrar, db } = await arrancar();
  t.after(() => servidor.close());
  const adm = await entrar("admin@escola.pt");
  await adm.chamar("POST", "/api/admin/professores", { upn: "ana@escola.pt" });
  await adm.chamar("POST", "/api/admin/professores", { upn: "rui@escola.pt" });
  const ana = await entrar("ana@escola.pt"), rui = await entrar("rui@escola.pt");

  // Editor: validação das perguntas
  const boa = [{ texto: "2 + 2?", opcoes: ["3", "4", "5"], certa: 1, explicacao: "Soma.", tempo: 10 }, { texto: "Capital de Portugal?", opcoes: ["Porto", "Lisboa"], certa: 1 }];
  assert.strictEqual((await ana.chamar("POST", "/api/quizzes", { titulo: "", perguntas: boa })).estado, 400);
  assert.strictEqual((await ana.chamar("POST", "/api/quizzes", { titulo: "X", perguntas: [{ texto: "?", opcoes: ["a", "a"], certa: 0 }] })).estado, 400, "opções repetidas");
  assert.strictEqual((await ana.chamar("POST", "/api/quizzes", { titulo: "X", perguntas: [{ texto: "?", opcoes: ["a", "b"], certa: 5 }] })).estado, 400, "certa fora das opções");
  assert.strictEqual((await ana.chamar("POST", "/api/quizzes", { titulo: "X", perguntas: [] })).estado, 400);
  const { d: { id: qid } } = await ana.chamar("POST", "/api/quizzes", { titulo: "Contas", tempo: 20, perguntas: boa });
  assert.strictEqual((await ana.chamar("GET", `/api/quizzes/${qid}`)).d.perguntas[0].id, "q1");
  assert.strictEqual((await rui.chamar("GET", `/api/quizzes/${qid}`)).estado, 404);
  assert.strictEqual((await rui.chamar("POST", `/api/quizzes/${qid}/vivo`, {})).estado, 404);
  assert.strictEqual((await ana.chamar("POST", `/api/quizzes/${qid}/duplicar`, {})).estado, 200);
  // Modelos importados do tic.techpro.pt
  const mods = (await ana.chamar("GET", "/api/quiz-modelos")).d;
  assert.strictEqual(mods.length, 4);
  const dm = await ana.chamar("POST", "/api/quizzes/de-modelo", { modelo: mods[0].id });
  assert.strictEqual(dm.estado, 200);
  assert.strictEqual((await ana.chamar("GET", `/api/quizzes/${dm.d.id}`)).d.perguntas.length, mods[0].perguntas);
  assert.strictEqual((await ana.chamar("POST", "/api/quizzes/de-modelo", { modelo: "../../etc/passwd" })).estado, 404);

  // Jogo ao vivo: o docente abre a sala, os alunos entram com uma alcunha, sem sessão.
  const { d: { pin } } = await ana.chamar("POST", `/api/quizzes/${qid}/vivo`, {});
  assert.match(pin, /^\d{6}$/);
  assert.strictEqual((await fetch(`${base}/j/${pin}`)).status, 200);
  const jogador = async () => {
    let cookie = "";
    const chama = async (sub, corpo, qs = "") => {
      const r = await fetch(`${base}/j/api/${pin}${sub ? "/" + sub : ""}${qs}`, { method: corpo ? "POST" : "GET", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
      const c = (r.headers.getSetCookie()[0] || "").split(";")[0]; if (c) cookie = c;
      return { estado: r.status, d: await r.json() };
    };
    return chama;
  };
  const j1 = await jogador(), j2 = await jogador(), j3 = await jogador();
  assert.strictEqual((await j1("")).d.entrou, false);
  assert.strictEqual((await j1("entrar", { alcunha: "" })).estado, 400);
  assert.strictEqual((await j1("entrar", { alcunha: "merda" })).estado, 400, "o filtro bloqueia palavrões");
  assert.strictEqual((await j1("entrar", { alcunha: "Rato" })).d.nome, "Rato");
  assert.strictEqual((await j2("entrar", { alcunha: "rato" })).d.nome, "rato 2", "alcunha repetida ganha um número");
  assert.strictEqual((await j3("entrar", { alcunha: "<b>Lince</b>" })).d.nome, "bLince/b");
  assert.strictEqual((await j1("responder", { pergunta: "q1", resposta: 1 })).estado, 400, "ainda não começou");
  assert.strictEqual((await rui.chamar("GET", `/api/vivo/${pin}`)).estado, 404, "só o dono vê a sessão");
  assert.strictEqual((await rui.chamar("POST", `/api/vivo/${pin}/acao`, { acao: "comecar" })).estado, 404);
  assert.deepStrictEqual((await ana.chamar("GET", `/api/vivo/${pin}`)).d.jogadores.sort(), ["Rato", "bLince/b", "rato 2"].sort());

  let p = (await ana.chamar("POST", `/api/vivo/${pin}/acao`, { acao: "comecar" })).d;
  assert.strictEqual(p.fase, "pergunta");
  assert.strictEqual(p.certa, undefined, "o docente também só vê a certa depois");
  const va = (await j1("")).d;
  assert.strictEqual(va.fase, "pergunta");
  assert.ok(!("certa" in va), "o aluno não vê a resposta certa durante a pergunta");
  assert.strictEqual(va.pergunta.opcoes.length, 3);
  assert.strictEqual((await j3("entrar", { alcunha: "Tarde" })).estado, 200, "quem já entrou, continua dentro");
  assert.strictEqual((await (await jogador())("entrar", { alcunha: "Atrasado" })).estado, 409, "depois de começar já ninguém novo entra");
  assert.strictEqual((await j1("responder", { pergunta: "q1", resposta: 1 })).estado, 200); // certa
  assert.strictEqual((await j2("responder", { pergunta: "q1", resposta: 0 })).estado, 200); // errada
  assert.strictEqual((await j1("responder", { pergunta: "q1", resposta: 0 })).d.respondeu, true, "a primeira resposta é a que conta");
  assert.strictEqual((await j1("responder", { pergunta: "q1", resposta: 9 })).estado, 400);
  p = (await ana.chamar("GET", `/api/vivo/${pin}`)).d;
  assert.strictEqual(p.respondidos, 2);
  p = (await ana.chamar("POST", `/api/vivo/${pin}/acao`, { acao: "mostrar" })).d;
  assert.deepStrictEqual([p.fase, p.certa, p.contagem, p.semResposta], ["resposta", 1, [1, 1, 0], 1]);
  const v1 = (await j1("")).d, v2 = (await j2("")).d;
  assert.deepStrictEqual([v1.ok, v2.ok, v1.certa], [true, false, 1]);
  assert.ok(v1.ganhos > 500 && v1.ganhos <= 1000, "pontos pela rapidez: " + v1.ganhos);
  assert.strictEqual(v1.posicao, 1);
  assert.strictEqual((await ana.chamar("POST", `/api/vivo/${pin}/acao`, { acao: "mostrar" })).estado, 400, "já mostrada");

  await ana.chamar("POST", `/api/vivo/${pin}/acao`, { acao: "proxima" });
  await j1("responder", { pergunta: "q2", resposta: 1 }); await j2("responder", { pergunta: "q2", resposta: 1 });
  await ana.chamar("POST", `/api/vivo/${pin}/acao`, { acao: "mostrar" });
  p = (await ana.chamar("POST", `/api/vivo/${pin}/acao`, { acao: "proxima" })).d; // era a última: termina
  assert.strictEqual(p.fase, "fim");
  assert.deepStrictEqual(p.ranking.map((x) => x.nome), ["Rato", "rato 2", "bLince/b"]);
  assert.deepStrictEqual(p.ranking.map((x) => x.certas), [2, 1, 0]);
  const fim = (await j2("")).d;
  assert.strictEqual(fim.fase, "fim");
  assert.strictEqual(fim.certas, 1);
  assert.ok(fim.topo.length === 3);

  // O resumo guardou-se (alcunhas e % por pergunta; nenhum dado pessoal).
  const res = (await ana.chamar("GET", `/api/quizzes/${qid}/resultados`)).d;
  assert.strictEqual(res.length, 1);
  assert.strictEqual(res[0].jogadores, 3);
  assert.deepStrictEqual(res[0].perguntas.map((x) => x.pct), [33, 67]);
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM quiz_resultados").get().n, 1);

  // Fechar a sala
  assert.strictEqual((await ana.chamar("POST", `/api/vivo/${pin}/acao`, { acao: "fechar" })).d.fechada, true);
  assert.strictEqual((await j1("")).estado, 404);
  assert.strictEqual((await fetch(`${base}/j/api/000000`)).status, 404);
});

test("API: estatísticas de acesso (só contagens, só para administradores)", async (t) => {
  const { base, servidor, entrar, db } = await arrancar();
  t.after(() => servidor.close());
  const adm = await entrar("admin@escola.pt");
  await adm.chamar("POST", "/api/admin/professores", { upn: "ana@escola.pt" });
  const ana = await entrar("ana@escola.pt");
  await entrar("ana@escola.pt"); // segunda entrada no mesmo dia
  for (const area of ["pauta", "pauta", "quizzes", "<script>", "não-existe"]) await ana.chamar("POST", "/api/uso", { area });
  const { d: { id: tid } } = await ana.chamar("POST", "/api/turmas", { nome: "7.º A" });
  await fetch(`${base}/api/periodos/${(await ana.chamar("GET", "/api/turmas/" + tid)).d.periodos[0].id}/pauta.csv`, { headers: { cookie: ana.ck } });
  // páginas dos alunos
  const { d: { codigo, id } } = await ana.chamar("POST", "/api/sondagens", { pergunta: "Q?", opcoes: ["a", "b"] });
  await fetch(`${base}/s/${codigo}`);
  await fetch(`${base}/s/api/${codigo}/votar`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ opcao: 0 }) });
  void id;
  const { d: { id: qid } } = await ana.chamar("POST", "/api/quizzes", { titulo: "Q", perguntas: [{ texto: "?", opcoes: ["a", "b"], certa: 0 }] });
  const { d: { pin } } = await ana.chamar("POST", `/api/quizzes/${qid}/vivo`, {});
  await fetch(`${base}/j/${pin}`);
  await fetch(`${base}/j/api/${pin}/entrar`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ alcunha: "Gato" }) });

  assert.strictEqual((await ana.chamar("GET", "/api/admin/estatisticas")).estado, 403);
  const e = (await adm.chamar("GET", "/api/admin/estatisticas?dias=7")).d;
  assert.strictEqual(e.serie.length, 7);
  const hoje = e.serie[6];
  assert.strictEqual(hoje.logins, 3, "admin + 2 entradas da Ana");
  assert.strictEqual(hoje.docentes, 2);
  assert.strictEqual(hoje.vistas, 3, "pauta ×2 e quizzes; ecrãs desconhecidos ignoram-se");
  assert.deepStrictEqual(e.areas.map((a) => [a.area, a.n]), [["pauta", 2], ["quizzes", 1]]);
  assert.strictEqual(e.exportacoes, 1);
  assert.strictEqual(e.jogosCriados, 1);
  assert.deepStrictEqual(e.publicoTotais, { sondagem_pagina: 1, sondagem_voto: 1, jogo_pagina: 1, jogo_entrada: 1 });
  assert.strictEqual(e.resumo.docentesAtivos7, 2);
  assert.strictEqual(e.docentes.find((d) => d.upn === "ana@escola.pt").logins, 2);
  assert.strictEqual(e.dados.turmas, 1);
  // Sem IP nem conteúdos: as tabelas só têm contagens.
  assert.deepStrictEqual(db.prepare("PRAGMA table_info(uso)").all().map((c) => c.name), ["dia", "prof_id", "area", "n"]);
  assert.deepStrictEqual(db.prepare("PRAGMA table_info(uso_publico)").all().map((c) => c.name), ["dia", "tipo", "n"]);
  // Limpeza do que é antigo
  db.prepare("INSERT INTO uso_publico (dia, tipo, n) VALUES ('2020-01-01', 'sondagem_voto', 9)").run();
  require("../lib/m-estatisticas").criar(db).limpar();
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM uso_publico WHERE dia = '2020-01-01'").get().n, 0);
});

test("Configuração de produção: o arranque recusa configurações incompletas", () => {
  const { verificarConfig } = require("../server");
  const boa = { BASE_URL: "https://sala.techpro.pt", TENANT_ID: "11111111-2222-3333-4444-555555555555", CLIENT_ID: "a", CLIENT_SECRET: "b", ADMIN_USERS: "x@escola.pt" };
  assert.deepStrictEqual(verificarConfig(boa), []);
  assert.ok(verificarConfig({}).length >= 5);
  assert.match(verificarConfig({ ...boa, BASE_URL: "http://sala.techpro.pt" }).join(), /https/);
  assert.match(verificarConfig({ ...boa, BASE_URL: "https://sala.techpro.pt/" }).join(), /sem barra/);
  assert.match(verificarConfig({ ...boa, DEV_LOGIN: "1" }).join(), /DEV_LOGIN/);
  assert.match(verificarConfig({ ...boa, CLIENT_SECRET: " " }).join(), /CLIENT_SECRET/);
  assert.match(verificarConfig({ ...boa, GRUPO_DOCENTES_ID: "grupo-docentes" }).join(), /GUID/);
  assert.deepStrictEqual(verificarConfig({ ...boa, GRUPO_DOCENTES_ID: "11111111-2222-3333-4444-555555555555" }), []);
});

test("API: bancos partilhados por disciplina, importar notas do Excel e aviso do segredo", async (t) => {
  const { base, servidor, entrar } = await arrancar({ CLIENT_SECRET_EXPIRA: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10) });
  t.after(() => servidor.close());
  const adm = await entrar("admin@escola.pt");
  const g1 = (await adm.chamar("POST", "/api/admin/grupos", { nome: "550 Informática" })).d.id, g2 = (await adm.chamar("POST", "/api/admin/grupos", { nome: "510 Física" })).d.id;
  const prof = async (upn, g) => { const r = (await adm.chamar("POST", "/api/admin/professores", { upn })); void r; const l = (await adm.chamar("GET", "/api/admin/professores")).d; if (g) await adm.chamar("PUT", `/api/admin/professores/${l.find((x) => x.upn === upn).id}/grupo`, { grupo_id: g }); return entrar(upn); };
  const ana = await prof("ana@escola.pt", g1), rui = await prof("rui@escola.pt", g1), eva = await prof("eva@escola.pt", g2), sem = await prof("sem@escola.pt", null);

  // Aviso do segredo: só os administradores o veem.
  const seg = (await adm.chamar("GET", "/api/eu")).d.segredo;
  assert.ok(seg.dias >= 19 && seg.dias <= 21, "dias: " + seg.dias);
  assert.strictEqual((await ana.chamar("GET", "/api/eu")).d.segredo, null);

  // Partilhar uma grelha com o grupo
  const turma = async (u, ano) => { const id = (await u.chamar("POST", "/api/turmas", { nome: "7.º A", grupo_id: ano })).d.id; await u.chamar("POST", `/api/turmas/${id}/alunos`, { texto: "1 Ana Silva\n2 Bruno Costa\n3 Carla Mendes" }); const tt = (await u.chamar("GET", "/api/turmas/" + id)).d; return { id, per: tt.periodos[0].id, alunos: tt.alunos }; };
  const ta = await turma(ana, g1), tr = await turma(rui, g1), te = await turma(eva, g2);
  const av = async (u, t0) => (await u.chamar("POST", `/api/periodos/${t0.per}/avaliacoes`, { titulo: "Teste", peso: 1 })).d.id;
  const aA = await av(ana, ta), aR = await av(rui, tr), aE = await av(eva, te);
  await ana.chamar("PUT", `/api/avaliacoes/${aA}/grelha`, { itens: [{ grupo: "I", nome: "1.", cotacao: 6 }, { grupo: "II", nome: "2.", cotacao: 14 }] });
  assert.strictEqual((await ana.chamar("POST", "/api/partilhas", { tipo: "grelha", avaliacao: aR, titulo: "Teste do Rui" })).estado, 404, "só partilha os seus testes");
  const p1 = await ana.chamar("POST", "/api/partilhas", { tipo: "grelha", avaliacao: aA, titulo: "Teste global 1" });
  assert.strictEqual(p1.estado, 200);
  const lista = (await rui.chamar("GET", "/api/partilhas?tipo=grelha")).d;
  assert.deepStrictEqual(lista.map((x) => [x.titulo, x.n, x.pontos, x.minha]), [["Teste global 1", 2, 20, false]]);
  assert.strictEqual((await eva.chamar("GET", "/api/partilhas?tipo=grelha")).d.length, 0, "outra disciplina não vê");
  assert.strictEqual((await sem.chamar("GET", "/api/partilhas?tipo=grelha")).d.length, 0);
  assert.strictEqual((await sem.chamar("POST", "/api/partilhas", { tipo: "grelha", avaliacao: 1, titulo: "x" })).estado, 400, "sem disciplina atribuída");
  const copia = await rui.chamar("POST", `/api/avaliacoes/${aR}/grelha/copiar`, { partilha: p1.d.id });
  assert.deepStrictEqual(copia.d.itens.map((i) => [i.grupo, i.nome, i.cotacao]), [["I", "1.", 6], ["II", "2.", 14]]);
  assert.strictEqual((await eva.chamar("POST", `/api/avaliacoes/${aE}/grelha/copiar`, { partilha: p1.d.id })).estado, 404, "outra disciplina não copia");
  assert.strictEqual((await rui.chamar("DELETE", `/api/partilhas/${p1.d.id}`)).estado, 403, "só quem partilhou retira");
  // Quizzes: partilha-se sem imagens e copia-se para os quizzes do colega.
  const qid = (await ana.chamar("POST", "/api/quizzes", { titulo: "Revisão", perguntas: [{ texto: "?", opcoes: ["a", "b"], certa: 1 }] })).d.id;
  const pq = await ana.chamar("POST", "/api/partilhas", { tipo: "quiz", quiz: qid, titulo: "Revisão partilhada" });
  assert.strictEqual((await rui.chamar("GET", "/api/partilhas?tipo=quiz")).d[0].n, 1);
  const cq = await rui.chamar("POST", "/api/quizzes/de-partilha", { partilha: pq.d.id });
  assert.strictEqual((await rui.chamar("GET", `/api/quizzes/${cq.d.id}`)).d.perguntas[0].certa, 1);
  assert.strictEqual((await eva.chamar("POST", "/api/quizzes/de-partilha", { partilha: pq.d.id })).estado, 404);
  assert.strictEqual((await ana.chamar("DELETE", `/api/partilhas/${p1.d.id}`)).estado, 200);
  assert.strictEqual((await adm.chamar("DELETE", `/api/partilhas/${pq.d.id}`)).estado, 200, "o administrador também pode retirar");

  // Importar notas: colado do Excel, associa por número e por nome (sem acentos), avisa dos problemas.
  const imp = async (u, aval, corpo) => u.chamar("POST", `/api/avaliacoes/${aval}/notas/importar`, corpo);
  const aN = (await ana.chamar("POST", `/api/periodos/${ta.per}/avaliacoes`, { titulo: "Ficha", peso: 1, maximo: 20 })).d.id;
  const r = (await imp(ana, aN, { texto: "N.º\tNome\tNota\n1\tAna Silva\t15,5\n2\tbruno costa\t12/20\n3\tCarla Mendes\t25\n9\tFantasma Qualquer\t10\n" })).d;
  assert.deepStrictEqual(r.linhas.map((l) => [l.nome, l.ok, l.valor]), [["Ana Silva", true, 15.5], ["Bruno Costa", true, 12], ["Carla Mendes", false, null], ["Fantasma Qualquer", false, null]]);
  assert.match(r.linhas[2].motivo, /nota inválida/);
  assert.match(r.linhas[3].motivo, /não encontrado/);
  assert.strictEqual(r.aplicaveis, 2);
  // Só o nome e a nota, numa coluna só, e sem número
  assert.deepStrictEqual((await imp(ana, aN, { texto: "Ana Silva 18\nCarla Mendes 7,5" })).d.linhas.map((l) => [l.aluno !== null, l.valor]), [[true, 18], [true, 7.5]]);
  // Número que não bate com o nome: não troca notas
  assert.match((await imp(ana, aN, { texto: "1\tBruno Costa\t10" })).d.linhas[0].motivo, /o n\.º 1 é «Ana Silva»/);
  // Ficheiro .xlsx
  const { criarXlsx } = require("../lib/xlsx");
  const xl = criarXlsx([{ nome: "Notas", linhas: [["Número", "Nome", "Nota"], [1, "Ana Silva", 17], [2, "Bruno Costa", 9.5]] }]);
  const rx = (await imp(ana, aN, { nome: "notas.xlsx", base64: xl.toString("base64") })).d;
  assert.deepStrictEqual(rx.linhas.map((l) => l.valor), [17, 9.5]);
  assert.deepStrictEqual(rx.alunosSemLinha, ["Carla Mendes"]);
  assert.strictEqual((await imp(rui, aN, { texto: "1\tAna\t10" })).estado, 404, "só o dono do teste");
  assert.strictEqual((await imp(ana, aA, { texto: "1\tAna\t10" })).estado, 409, "teste com grelha");
  assert.strictEqual((await imp(ana, aN, { texto: "" })).estado, 400);
  // Aplicar o que o pré-visualizador devolveu usa o pedido normal de notas (valida, regista, respeita o fecho)
  const ap = await ana.chamar("PUT", `/api/avaliacoes/${aN}/notas`, { linhas: rx.linhas.filter((l) => l.ok).map((l) => ({ aluno: l.aluno, nota: l.nota })) });
  assert.strictEqual(ap.estado, 200);
  assert.strictEqual((await ana.chamar("GET", `/api/periodos/${ta.per}/pauta`)).d.notas[`${aN}:${ta.alunos[0].id}`], 17);
  void base;
});

test("API: vista do diretor de turma (pauta consolidada, só leitura)", async (t) => {
  const { servidor, entrar, db } = await arrancar();
  t.after(() => servidor.close());
  const adm = await entrar("admin@escola.pt");
  const g1 = (await adm.chamar("POST", "/api/admin/grupos", { nome: "550 Informática" })).d.id, g2 = (await adm.chamar("POST", "/api/admin/grupos", { nome: "300 Português" })).d.id;
  for (const u of ["dt@escola.pt", "inf@escola.pt", "por@escola.pt", "outro@escola.pt"]) await adm.chamar("POST", "/api/admin/professores", { upn: u, nome: u.split("@")[0] });
  const dt = await entrar("dt@escola.pt"), inf = await entrar("inf@escola.pt"), por = await entrar("por@escola.pt"), outro = await entrar("outro@escola.pt");
  const nova = async (u, grupo, nome, alunos) => { const id = (await u.chamar("POST", "/api/turmas", { nome, ano_letivo: "2026/2027", grupo_id: grupo })).d.id; await u.chamar("POST", `/api/turmas/${id}/alunos`, { texto: alunos }); return (await u.chamar("GET", "/api/turmas/" + id)).d; };
  const tI = await nova(inf, g1, "7.º B", "1 Ana Silva\n2 Bruno Costa\n3 Carla Mendes"), tP = await nova(por, g2, "7.º b", "1 Ana Silva\n2 Bruno Costa\n4 Diogo Lopes"), tX = await nova(outro, g1, "9.º C", "1 Zé Ninguém");
  const teste = async (u, tt, notas) => { const av = (await u.chamar("POST", `/api/periodos/${tt.periodos[0].id}/avaliacoes`, { titulo: "T", peso: 1, maximo: 20 })).d.id; await u.chamar("PUT", `/api/avaliacoes/${av}/notas`, { linhas: tt.alunos.map((a) => ({ aluno: a.id, nota: String(notas[a.nome]) })).filter((l) => l.nota !== "undefined") }); };
  await teste(inf, tI, { "Ana Silva": 16, "Bruno Costa": 6, "Carla Mendes": 12 });
  await teste(por, tP, { "Ana Silva": 14, "Bruno Costa": 8, "Diogo Lopes": 18 });
  await por.chamar("PUT", `/api/turmas/${tP.id}/presencas`, { data: "2026-10-01", estados: { [tP.alunos[1].id]: "F" } });
  await inf.chamar("PUT", `/api/turmas/${tI.id}/presencas`, { data: "2026-10-02", estados: { [tI.alunos[1].id]: "F" } });

  const url = (extra = "") => `/api/dt/consolidado?ano_letivo=${encodeURIComponent("2026/2027")}&turma=${encodeURIComponent("7.º B")}${extra}`;
  assert.strictEqual((await dt.chamar("GET", url())).estado, 403, "ainda não é diretor");
  assert.strictEqual((await dt.chamar("GET", "/api/dt")).d.length, 0);
  assert.strictEqual((await dt.chamar("PUT", "/api/admin/direcoes", { ano_letivo: "2026/2027", turma: "7.º B", prof_id: 1 })).estado, 403);
  const dirs = (await adm.chamar("GET", "/api/admin/direcoes")).d;
  assert.deepStrictEqual(dirs.map((x) => [x.turma, x.docentes, x.disciplinas]).sort(), [["7.º B", 2, 2], ["9.º C", 1, 1]], "7.º B e 7.º b juntam-se");
  const dtId = (await adm.chamar("GET", "/api/admin/professores")).d.find((x) => x.upn === "dt@escola.pt").id;
  assert.strictEqual((await adm.chamar("PUT", "/api/admin/direcoes", { ano_letivo: "2026/2027", turma: "7.º B", prof_id: dtId })).estado, 200);
  assert.strictEqual((await dt.chamar("GET", "/api/eu")).d.dt, true);
  assert.deepStrictEqual((await dt.chamar("GET", "/api/dt")).d.map((x) => [x.turma, x.disciplinas]), [["7.º B", 2]]);
  assert.strictEqual((await dt.chamar("GET", `/api/dt/consolidado?ano_letivo=${encodeURIComponent("2026/2027")}&turma=${encodeURIComponent("9.º C")}`)).estado, 403, "só a sua turma");

  const c = (await dt.chamar("GET", url())).d;
  assert.deepStrictEqual(c.disciplinas.map((d) => [d.disciplina, d.docente]).sort(), [["300 Português", "por"], ["550 Informática", "inf"]]);
  assert.deepStrictEqual(c.alunos.map((a) => a.nome), ["Ana Silva", "Bruno Costa", "Carla Mendes", "Diogo Lopes"], "união dos alunos das duas turmas");
  const por_ = (n) => c.alunos.find((a) => a.nome === n);
  const dI = c.disciplinas.find((d) => d.docente === "inf").turma_id, dP = c.disciplinas.find((d) => d.docente === "por").turma_id;
  assert.deepStrictEqual([por_("Ana Silva").celulas[dI].final, por_("Ana Silva").celulas[dP].final, por_("Ana Silva").media], [80, 70, 75]);
  assert.deepStrictEqual([por_("Bruno Costa").negativas, por_("Bruno Costa").faltas], [2, 2], "duas disciplinas abaixo de 50 e as faltas somam-se");
  assert.strictEqual(por_("Carla Mendes").celulas[dP], undefined, "não está na turma de Português");
  assert.strictEqual(por_("Diogo Lopes").celulas[dI], undefined);
  assert.deepStrictEqual([por_("Diogo Lopes").media, por_("Diogo Lopes").comNota], [90, 1]);
  assert.ok(c.periodos.includes("1.º período"));
  // Só leitura e fica registado
  assert.strictEqual((await dt.chamar("PUT", `/api/avaliacoes/1/notas`, { linhas: [] })).estado, 404);
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE acao = 'Vista do diretor de turma' AND quem = 'dt@escola.pt'").get().n >= 1);
  // O administrador vê qualquer turma; retirar o diretor tira-lhe o acesso
  assert.strictEqual((await adm.chamar("GET", url())).estado, 200);
  await adm.chamar("PUT", "/api/admin/direcoes", { ano_letivo: "2026/2027", turma: "7.º B", prof_id: null });
  assert.strictEqual((await dt.chamar("GET", url())).estado, 403);
  void tX;
});

test("API: imagens nas perguntas dos quizzes e sondagem aberta com nuvem de palavras", async (t) => {
  const { base, servidor, entrar } = await arrancar();
  t.after(() => servidor.close());
  const adm = await entrar("admin@escola.pt");
  await adm.chamar("POST", "/api/admin/professores", { upn: "ana@escola.pt" });
  await adm.chamar("POST", "/api/admin/professores", { upn: "rui@escola.pt" });
  const ana = await entrar("ana@escola.pt"), rui = await entrar("rui@escola.pt");
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

  const perg = [{ texto: "O que é isto?", opcoes: ["Um gato", "Um pixel"], certa: 1 }];
  const qid = (await ana.chamar("POST", "/api/quizzes", { titulo: "Imagens", perguntas: perg })).d.id;
  assert.strictEqual((await rui.chamar("POST", `/api/quizzes/${qid}/imagens`, { base64: PNG.toString("base64") })).estado, 404);
  assert.strictEqual((await ana.chamar("POST", `/api/quizzes/${qid}/imagens`, { base64: Buffer.from("isto não é uma imagem").toString("base64") })).estado, 400, "confere o conteúdo");
  assert.strictEqual((await ana.chamar("POST", `/api/quizzes/${qid}/imagens`, { base64: Buffer.concat([PNG, Buffer.alloc(420 * 1024)]).toString("base64") })).estado, 400, "demasiado grande");
  const img = (await ana.chamar("POST", `/api/quizzes/${qid}/imagens`, { base64: PNG.toString("base64") })).d.id;
  // Guardar a pergunta com a imagem; um número de imagem que não é deste quiz é ignorado.
  await ana.chamar("PUT", `/api/quizzes/${qid}`, { titulo: "Imagens", perguntas: [{ ...perg[0], imagem: img }, { texto: "Outra?", opcoes: ["a", "b"], certa: 0, imagem: 9999 }] });
  const q = (await ana.chamar("GET", `/api/quizzes/${qid}`)).d;
  assert.strictEqual(q.perguntas[0].imagem, img);
  assert.strictEqual(q.perguntas[1].imagem, undefined);
  const propria = await fetch(`${base}/api/quizzes/${qid}/imagens/${img}`, { headers: { cookie: ana.ck } });
  assert.deepStrictEqual([propria.status, propria.headers.get("content-type")], [200, "image/png"]);
  assert.strictEqual((await fetch(`${base}/api/quizzes/${qid}/imagens/${img}`, { headers: { cookie: rui.ck } })).status, 404, "só o dono vê");
  assert.strictEqual((await fetch(`${base}/api/quizzes/${qid}/imagens/${img}`)).status, 401);

  // Num jogo, os alunos só veem as imagens que o jogo usa, e só enquanto a sala existe.
  const { d: { pin } } = await ana.chamar("POST", `/api/quizzes/${qid}/vivo`, {});
  const publica = await fetch(`${base}/j/img/${pin}/${img}`);
  assert.deepStrictEqual([publica.status, publica.headers.get("content-type")], [200, "image/png"]);
  assert.strictEqual((await fetch(`${base}/j/img/${pin}/${img + 1}`)).status, 404);
  await fetch(`${base}/j/api/${pin}/entrar`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ alcunha: "Gato" }) });
  await ana.chamar("POST", `/api/vivo/${pin}/acao`, { acao: "comecar" }).catch(() => {});
  const vp = (await ana.chamar("GET", `/api/vivo/${pin}`)).d;
  assert.strictEqual(vp.pergunta.imagem, img);
  await ana.chamar("POST", `/api/vivo/${pin}/acao`, { acao: "fechar" });
  assert.strictEqual((await fetch(`${base}/j/img/${pin}/${img}`)).status, 404, "sala fechada");

  // Duplicar copia as imagens (com números novos); apagar a imagem tira-a da pergunta.
  const dup = (await ana.chamar("POST", `/api/quizzes/${qid}/duplicar`, {})).d.id;
  const qd = (await ana.chamar("GET", `/api/quizzes/${dup}`)).d;
  assert.ok(qd.perguntas[0].imagem && qd.perguntas[0].imagem !== img);
  assert.strictEqual((await fetch(`${base}/api/quizzes/${dup}/imagens/${qd.perguntas[0].imagem}`, { headers: { cookie: ana.ck } })).status, 200);
  await ana.chamar("DELETE", `/api/quizzes/${qid}/imagens/${img}`);
  assert.strictEqual((await ana.chamar("GET", `/api/quizzes/${qid}`)).d.perguntas[0].imagem, undefined);
  assert.strictEqual((await fetch(`${base}/api/quizzes/${dup}/imagens/${qd.perguntas[0].imagem}`, { headers: { cookie: ana.ck } })).status, 200, "a cópia mantém a sua");

  // Sondagem aberta
  const s = (await ana.chamar("POST", "/api/sondagens", { pergunta: "Uma palavra sobre o teste de hoje", tipo: "aberta" })).d;
  const info = await (await fetch(`${base}/s/api/${s.codigo}`)).json();
  assert.deepStrictEqual([info.tipo, info.restantes, info.opcoes.length], ["aberta", 3, 0]);
  const enviar = (texto, cookie) => fetch(`${base}/s/api/${s.codigo}/votar`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ texto }) });
  const r1 = await enviar("Difícil");
  assert.strictEqual(r1.status, 200);
  let ck = (r1.headers.getSetCookie()[0] || "").split(";")[0];
  assert.strictEqual((await enviar("a", ck)).status, 400, "demasiado curta");
  assert.strictEqual((await enviar("que merda", ck)).status, 400, "o filtro bloqueia");
  for (const x of ["difícil de mais", "Fácil"]) { const r = await enviar(x, ck); assert.strictEqual(r.status, 200); ck = (r.headers.getSetCookie()[0] || ck).split(";")[0]; }
  assert.strictEqual((await enviar("quarta", ck)).status, 409, "só 3 por navegador");
  await enviar("Difícil"); await enviar("fácil, <b>pois</b>"); await enviar("O teste foi difícil");
  const t2 = (await ana.chamar("GET", `/api/sondagens/${s.id}`)).d;
  assert.strictEqual(t2.tipo, "aberta");
  assert.strictEqual(t2.total, 6);
  assert.deepStrictEqual(t2.palavras.slice(0, 2).map((p) => [p.palavra, p.n]), [["difícil", 4], ["fácil", 2]]);
  assert.ok(!t2.palavras.some((p) => ["de", "foi", "mais", "pois", "teste"].includes(p.palavra) && p.palavra !== "teste"), "palavras vazias ficam de fora");
  assert.ok(!JSON.stringify(t2.respostas).includes("<b>"), "sem marcas HTML");
  await ana.chamar("DELETE", `/api/sondagens/${s.id}/respostas/${t2.respostas[0].id}`);
  assert.strictEqual((await ana.chamar("GET", `/api/sondagens/${s.id}`)).d.total, 5);
  assert.strictEqual((await rui.chamar("DELETE", `/api/sondagens/${s.id}/respostas/${t2.respostas[1].id}`)).estado, 404);
  await ana.chamar("POST", `/api/sondagens/${s.id}/estado`, { aberta: false });
  assert.strictEqual((await enviar("tarde")).status, 409);
});

test("API: contas locais (criar, entrar, mudar a palavra-passe, repor) e conta Office separada", async (t) => {
  const { base, servidor, entrar } = await arrancar();
  t.after(() => servidor.close());
  const adm = await entrar("admin@escola.pt");
  const outro = await entrar("ana@escola.pt"); // não é administradora (sem grupo, mas entra por ser administrador? não): ver abaixo
  void outro;

  const c = await adm.chamar("POST", "/api/admin/professores/locais", { utilizador: "ana.silva", nome: "Ana Silva" });
  assert.strictEqual(c.estado, 200);
  assert.match(c.d.senha, /^[A-Za-z0-9]{14}$/);
  assert.strictEqual((await adm.chamar("POST", "/api/admin/professores/locais", { utilizador: "ana.silva" })).estado, 409, "utilizador repetido");
  assert.strictEqual((await adm.chamar("POST", "/api/admin/professores/locais", { utilizador: "A b" })).estado, 400, "utilizador inválido");

  const login = (utilizador, senha) => fetch(base + "/auth/local", { method: "POST", headers: { "content-type": "application/json", "x-requested-with": "eink" }, body: JSON.stringify({ utilizador, senha }) });
  assert.strictEqual((await login("ana.silva", "errada")).status, 401);
  assert.strictEqual((await login("nao.existe", "qualquer")).status, 401, "mesma resposta para utilizador inexistente");
  assert.strictEqual((await fetch(base + "/auth/local", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 403, "sem cabeçalho anti-CSRF");

  const r = await login("ana.silva", c.d.senha);
  assert.strictEqual(r.status, 200);
  const ck = r.headers.getSetCookie()[0].split(";")[0];
  const como = async (m, u, b) => { const r2 = await fetch(base + u, { method: m, headers: { cookie: ck, "x-requested-with": "eink", "content-type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) }); return { estado: r2.status, d: await r2.json().catch(() => null) }; };
  const eu = await como("GET", "/api/eu");
  assert.ok(eu.d.local && eu.d.trocar, "conta local que tem de mudar a palavra-passe");
  assert.strictEqual((await como("GET", "/api/turmas")).estado, 403, "bloqueada até mudar a palavra-passe");
  assert.strictEqual((await como("POST", "/api/eu/senha", { atual: "errada", nova: "umaSenhaNova123" })).estado, 403);
  assert.strictEqual((await como("POST", "/api/eu/senha", { atual: c.d.senha, nova: "curta" })).estado, 400);
  assert.strictEqual((await como("POST", "/api/eu/senha", { atual: c.d.senha, nova: "umaSenhaNova123" })).estado, 200);
  assert.strictEqual((await como("GET", "/api/turmas")).estado, 200, "livre depois de mudar");
  assert.strictEqual((await como("GET", "/api/admin/professores")).estado, 403, "não é administradora");
  assert.strictEqual((await login("ana.silva", c.d.senha)).status, 401, "a palavra-passe antiga deixou de servir");
  assert.strictEqual((await login("ana.silva", "umaSenhaNova123")).status, 200);

  // A conta local não se abre pela entrada Office, mesmo com o mesmo upn.
  assert.strictEqual((await entrar("ana.silva@local")).status, 403);

  // Nova palavra-passe pelo administrador e desativação.
  const lista = (await adm.chamar("GET", "/api/admin/professores")).d;
  const ana = lista.find((p) => p.upn === "ana.silva@local");
  assert.ok(ana.local && !ana.trocar);
  const nova = await adm.chamar("POST", `/api/admin/professores/${ana.id}/senha`, {});
  assert.strictEqual(nova.estado, 200);
  assert.strictEqual((await login("ana.silva", "umaSenhaNova123")).status, 401);
  assert.strictEqual((await login("ana.silva", nova.d.senha)).status, 200);
  assert.strictEqual((await adm.chamar("POST", `/api/admin/professores/${lista.find((p) => p.upn === "admin@escola.pt").id}/senha`, {})).estado, 400, "contas Office não têm palavra-passe aqui");
  await adm.chamar("DELETE", `/api/admin/professores/${ana.id}`);
  assert.strictEqual((await login("ana.silva", nova.d.senha)).status, 401, "conta desativada não entra");
  await adm.chamar("POST", `/api/admin/professores/${ana.id}/reativar`, {});
  assert.strictEqual((await login("ana.silva", nova.d.senha)).status, 200);

  // Limite de tentativas por utilizador.
  let ultimo = 0; for (let i = 0; i < 12; i++) ultimo = (await login("alvo.teste", "x" + i)).status;
  assert.strictEqual(ultimo, 429, "demasiadas tentativas são travadas");
});

test("Correio: avisos de expiração do segredo pelo Graph (limiares, token cifrado, falhas)", async () => {
  const { abrir } = require("../lib/db");
  const criarCorreio = require("../lib/correio");
  const db = abrir(":memory:");
  db.prepare("INSERT INTO professores (upn, nome, admin) VALUES ('adm@escola.pt', 'Adm', 1)").run();
  db.prepare("INSERT INTO professores (upn, nome, admin, local, senha) VALUES ('loc@local', 'Loc', 1, 1, 'x')").run();
  db.prepare("INSERT INTO professores (upn, nome, admin) VALUES ('doc@escola.pt', 'Doc', 0)").run();
  let t = Date.parse("2026-11-02T12:00:00Z"), enviados = [], falha = false;
  const env = { CLIENT_SECRET_EXPIRA: "2026-12-20" };
  const auth = { renovar: async () => ({ access_token: "AT", refresh_token: "RT2" }) };
  const fetchFn = async (url, o) => { enviados.push({ url, o, corpo: JSON.parse(o.body) }); return falha ? { status: 403, json: async () => ({ error: { message: "Mail.Send em falta" } }) } : { status: 202, json: async () => ({}) }; };
  const cor = criarCorreio({ db, auth, segredo: "s", graphUrl: "https://g/v1.0", env, baseUrl: "https://avaliar.techpro.pt", fetchFn, agora: () => t });

  assert.deepStrictEqual((await cor.verificar()).enviado, false, "sem ligação não envia");
  cor.ligar({ conta: "adm@escola.pt", nome: "Adm", refresh: "RT1-segredo", por: "adm@escola.pt" });
  assert.ok(!JSON.stringify(db.prepare("SELECT * FROM config").all()).includes("RT1-segredo"), "o token está cifrado");

  let r = await cor.verificar();           // faltam 48 dias: o limiar de 60 já foi atingido
  assert.ok(r.enviado && r.limiar === 60);
  assert.strictEqual(enviados.length, 1);
  assert.strictEqual(enviados[0].url, "https://g/v1.0/me/sendMail");
  assert.strictEqual(enviados[0].o.headers.Authorization, "Bearer AT");
  assert.deepStrictEqual(enviados[0].corpo.message.toRecipients.map((x) => x.emailAddress.address), ["adm@escola.pt"], "só administradores Office, sem repetidos nem contas locais");
  assert.match(enviados[0].corpo.message.subject, /20\/12\/2026/);
  assert.ok(!/[–—]/.test(enviados[0].corpo.message.body.content), "sem travessões");

  assert.strictEqual((await cor.verificar()).enviado, false, "não repete no mesmo limiar");
  t += 20 * 86400000;                       // faltam 28 dias
  r = await cor.verificar(); assert.ok(r.enviado && r.limiar === 30);
  assert.deepStrictEqual(cor.estado().avisosEnviados.sort((a, b) => a - b), [30, 60]);

  env.CLIENT_SECRET_EXPIRA = "2027-12-20";  // segredo renovado: recomeça
  assert.strictEqual((await cor.verificar()).enviado, false);
  assert.deepStrictEqual(cor.estado().avisosEnviados, []);

  env.CLIENT_SECRET_EXPIRA = "2026-12-01"; falha = true;
  await assert.rejects(() => cor.verificar(), /Mail.Send em falta/);
  assert.match(cor.estado().erro, /Mail.Send/);
  falha = false; r = await cor.verificar(); assert.ok(r.enviado, "tenta outra vez depois de uma falha");
  assert.strictEqual(cor.estado().erro, null);
  cor.desligar(); assert.strictEqual(cor.estado().ligado, false);
});

test("Versões: a primeira entrada é a versão do package.json, com data e hora, mais recente primeiro", async (t) => {
  const { base, servidor, entrar } = await arrancar();
  t.after(() => servidor.close());
  const pkg = require("../package.json"), adm = await entrar("admin@escola.pt");
  const v = (await adm.chamar("GET", "/api/versoes")).d;
  assert.strictEqual(v.atual, pkg.version);
  assert.strictEqual(v.lista[0].versao, pkg.version, "ao subir a versão, acrescenta a entrada no topo de lib/versoes.js");
  assert.strictEqual((await adm.chamar("GET", "/api/eu")).d.versao, pkg.version);
  for (const x of v.lista) { assert.match(x.data, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/); assert.ok(x.itens.length && ["novidade", "melhoria", "correção"].includes(x.tipo)); assert.ok(!/[–—]/.test(x.itens.join(" ")), "sem travessões"); }
  const datas = v.lista.map((x) => x.data); assert.deepStrictEqual(datas, [...datas].sort().reverse(), "mais recente primeiro");
  assert.strictEqual((await fetch(base + "/api/versoes")).status, 401, "só com sessão");
});

test("Atalhos: turmas ativas com os períodos, só as do docente", async (t) => {
  const { servidor, entrar } = await arrancar();
  t.after(() => servidor.close());
  const adm = await entrar("admin@escola.pt");
  await adm.chamar("POST", "/api/admin/professores", { upn: "ana@escola.pt", nome: "Ana" });
  const outro = await entrar("ana@escola.pt");
  const grupos = (await adm.chamar("GET", "/api/grupos")).d;
  await adm.chamar("POST", "/api/turmas", { nome: "7.º A", ano_letivo: "2026/2027", ano: 7, grupo_id: grupos[0].id });
  const l = (await adm.chamar("GET", "/api/atalhos")).d;
  assert.strictEqual(l.length, 1);
  assert.ok(l[0].periodos.length >= 1 && l[0].periodos[0].id && l[0].periodos[0].nome);
  assert.strictEqual((await outro.chamar("GET", "/api/atalhos")).d.length, 0, "cada docente só vê as suas turmas");
});

test("Início: resumo por turma com média, níveis e progresso das notas", async (t) => {
  const { servidor, entrar } = await arrancar();
  t.after(() => servidor.close());
  const adm = await entrar("admin@escola.pt");
  const grupos = (await adm.chamar("GET", "/api/grupos")).d;
  const tu = (await adm.chamar("POST", "/api/turmas", { nome: "8.º B", ano_letivo: "2026/2027", ano: 8, grupo_id: grupos[0].id })).d;
  await adm.chamar("POST", `/api/turmas/${tu.id}/alunos`, { texto: "1 Ana\n2 Rui" });
  let r = (await adm.chamar("GET", "/api/inicio")).d;
  assert.strictEqual(r.totais.turmas, 1); assert.strictEqual(r.totais.alunos, 2);
  assert.strictEqual(r.turmas[0].media, null); assert.deepStrictEqual(r.turmas[0].niveis, [0, 0, 0, 0, 0]);
  const per = (await adm.chamar("GET", "/api/atalhos")).d[0].periodos[0].id;
  const crit = (await adm.chamar("GET", `/api/periodos/${per}/pauta`)).d.criterios.find((k) => k.tipo === "testes");
  const av = (await adm.chamar("POST", `/api/periodos/${per}/avaliacoes`, { titulo: "Teste 1", criterio: crit.id, tipo: "teste", peso: 1, maximo: 20 })).d;
  const alunos = (await adm.chamar("GET", `/api/periodos/${per}/pauta`)).d.alunos;
  await adm.chamar("PUT", `/api/avaliacoes/${av.id}/notas`, { linhas: [{ aluno: alunos[0].id, nota: "20" }] });
  r = (await adm.chamar("GET", "/api/inicio")).d;
  assert.strictEqual(r.turmas[0].esperadas, 2); assert.strictEqual(r.turmas[0].notas, 1);
  assert.strictEqual(r.turmas[0].media, 100); assert.strictEqual(r.turmas[0].foco.id, per);
});

test("Fotografias dos alunos: guardar, ver só o próprio docente, limites e apagar com o aluno", async (t) => {
  const { base, servidor, entrar, db } = await arrancar();
  t.after(() => servidor.close());
  const adm = await entrar("admin@escola.pt");
  await adm.chamar("POST", "/api/admin/professores", { upn: "ana@escola.pt", nome: "Ana" });
  const outra = await entrar("ana@escola.pt");
  const g = (await adm.chamar("GET", "/api/grupos")).d.find((g) => g.nome === "Geral").id;
  const tu = (await adm.chamar("POST", "/api/turmas", { nome: "9.º C", ano_letivo: "2026/2027", ano: 9, grupo_id: g })).d;
  await adm.chamar("POST", `/api/turmas/${tu.id}/alunos`, { texto: "1 Rui" });
  const per = (await adm.chamar("GET", "/api/atalhos")).d[0].periodos[0].id;
  const al = (await adm.chamar("GET", `/api/periodos/${per}/pauta`)).d.alunos[0];
  assert.strictEqual(al.foto, null);
  const jpeg = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0]).toString("base64");
  assert.strictEqual((await adm.chamar("PUT", `/api/alunos/${al.id}/foto`, { imagem: jpeg })).estado, 200);
  assert.strictEqual((await adm.chamar("PUT", `/api/alunos/${al.id}/foto`, { imagem: "data:image/jpeg;base64," + Buffer.from("isto não é uma imagem").toString("base64") })).estado, 400, "o conteúdo tem de ser mesmo uma imagem");
  assert.strictEqual((await adm.chamar("PUT", `/api/alunos/${al.id}/foto`, { imagem: "data:text/html;base64,PGI+" })).estado, 400, "só imagens");
  assert.strictEqual((await adm.chamar("PUT", `/api/alunos/${al.id}/foto`, { imagem: "data:image/jpeg;base64," + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(310000)]).toString("base64") })).estado, 413, "máximo 300 KB");
  assert.ok((await adm.chamar("GET", `/api/periodos/${per}/pauta`)).d.alunos[0].foto, "a pauta indica que tem fotografia");
  const ver = (ck) => fetch(base + `/api/alunos/${al.id}/foto`, { headers: { cookie: ck } });
  const r = await ver(adm.ck); assert.strictEqual(r.status, 200); assert.strictEqual(r.headers.get("content-type"), "image/jpeg"); assert.strictEqual((await r.arrayBuffer()).byteLength, 11);
  assert.strictEqual((await ver(outra.ck)).status, 404, "outro docente não vê");
  assert.strictEqual((await outra.chamar("PUT", `/api/alunos/${al.id}/foto`, { imagem: jpeg })).estado, 404, "nem muda");
  assert.strictEqual((await fetch(base + `/api/alunos/${al.id}/foto`)).status, 401, "sem sessão");
  assert.strictEqual((await adm.chamar("DELETE", `/api/alunos/${al.id}/foto`)).estado, 200);
  assert.strictEqual((await ver(adm.ck)).status, 404);
  await adm.chamar("PUT", `/api/alunos/${al.id}/foto`, { imagem: jpeg });
  await adm.chamar("DELETE", "/api/alunos/" + al.id);
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM fotos").get().n, 0, "a fotografia apaga-se com o aluno");
});

test("Entrada: erro em página (não em ficheiro) e pedido recuperado noutro navegador só do mesmo IP", async (t) => {
  const { base, servidor } = await arrancar();
  t.after(() => servidor.close());
  const r = await fetch(base + "/auth/callback?code=x&state=y");
  assert.strictEqual(r.status, 400);
  assert.match(r.headers.get("content-type"), /text\/html/);
  assert.match(await r.text(), /Voltar e tentar outra vez/);

  // Fluxo com a Microsoft simulada: o cookie não chega (outro navegador), mas o pedido guardado no servidor serve.
  const criarAuth = require("../lib/auth");
  const falso = { authorization_endpoint: "https://m/auth", token_endpoint: "https://m/token", issuer: "https://m", jwks_uri: "https://m/keys" };
  const original = global.fetch; let trocas = 0;
  global.fetch = async (url) => (String(url).includes("openid-configuration") ? { ok: true, json: async () => falso } : (trocas++, { ok: false, json: async () => ({ error: "invalid_grant" }) }));
  t.after(() => { global.fetch = original; });
  const auth = criarAuth({ tenant: "t", clientId: "c", clientSecret: "s", baseUrl: "https://x.pt", issuerBase: "https://login.example", segredo: "seg", sessaoHoras: 1 });
  const res = () => { const h = {}; return { getHeader: (k) => h[k], setHeader: (k, v) => { h[k] = v; } }; };
  const sem = { headers: {} };
  const url = await auth.iniciar(res(), { ip: "10.0.0.5" });
  const state = new URL(url).searchParams.get("state");
  const volta = (st) => new URL(`https://x.pt/auth/callback?code=abc&state=${st}`);
  await assert.rejects(() => auth.concluir(sem, res(), volta(state), { ip: "10.9.9.9" }), /expirou/, "outro IP: recusado");
  const url2 = await auth.iniciar(res(), { ip: "10.0.0.5" }), state2 = new URL(url2).searchParams.get("state");
  await assert.rejects(() => auth.concluir(sem, res(), volta(state2), { ip: "10.0.0.5" }), /troca do código falhou/, "mesmo IP, sem cookie: passa à troca do código");
  assert.strictEqual(trocas, 1);
  await assert.rejects(() => auth.concluir(sem, res(), volta(state2), { ip: "10.0.0.5" }), /expirou/, "o pedido só serve uma vez");
});

test("Grupo do Entra: lido do nome, departamento ou cargo, ligado ao grupo disciplinar e mostrado no início", async (t) => {
  const { grupoDeTexto, semGrupo } = require("../lib/grupo");
  assert.deepStrictEqual(grupoDeTexto(["Docente-550 - Informática"]), { codigo: "550", nome: "Informática" });
  assert.deepStrictEqual(grupoDeTexto([null, "", "Pedro Sendas Docente-550 - Informática"]), { codigo: "550", nome: "Informática" });
  assert.deepStrictEqual(grupoDeTexto(["520 Biologia e Geologia"]), { codigo: "520", nome: "Biologia e Geologia" });
  assert.strictEqual(grupoDeTexto(["Ana Silva"]), null);
  assert.strictEqual(semGrupo("Pedro Sendas de Moura Pereira Docente-550 - Informática"), "Pedro Sendas de Moura Pereira");
  assert.strictEqual(semGrupo("Ana Silva"), "Ana Silva");

  const { servidor, entrar, db } = await arrancar();
  t.after(() => servidor.close());
  const adm = await entrar("admin@escola.pt", "&ad=" + encodeURIComponent("Docente-550 - Informática"));
  const eu = (await adm.chamar("GET", "/api/eu")).d;
  assert.strictEqual(eu.grupo_ad, "550 Informática");
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM grupos WHERE nome LIKE '550%'").get().n, 0, "o Entra já não cria grupos: as disciplinas escolhe-as o docente");
  let r = (await adm.chamar("GET", "/api/inicio")).d;
  assert.strictEqual(r.grupo, null); assert.deepStrictEqual(r.grupos, []);
  // Se já existir um grupo com esse código, o docente é ligado a ele ao entrar.
  const g = Number(db.prepare("INSERT INTO grupos (nome) VALUES ('550 Informática')").run().lastInsertRowid); require("../lib/db").criarEsquema(db, g, 0);
  const prof = db.prepare("SELECT id FROM professores WHERE upn = 'admin@escola.pt'").get(); db.prepare("UPDATE professores SET grupo_id = NULL WHERE id = ?").run(prof.id);
  await entrar("admin@escola.pt", "&ad=" + encodeURIComponent("Docente-550 - Informática"));
  r = (await adm.chamar("GET", "/api/inicio")).d;
  assert.strictEqual(r.grupo.nome, "550 Informática"); assert.strictEqual(r.grupo.ad, "550 Informática");
  assert.ok(r.grupo.esquemas[0].criterios.length >= 1 && r.grupo.esquemas[0].criterios[0].peso > 0);
});

test("Partilha do endereço: título sem «Entrar», imagem absoluta, tipos corretos e ícone", async (t) => {
  const { base, servidor } = await arrancar();
  t.after(() => servidor.close());
  const h = await (await fetch(base + "/entrar.html")).text();
  assert.match(h, /<title>Eça Avalia · /); assert.ok(!/<title>Entrar/.test(h), "o título não começa por Entrar");
  assert.match(h, /<meta property="og:title" content="Eça Avalia">/);
  assert.match(h, /<meta property="og:image" content="http:\/\/localhost\/img\/og\.jpg">/, "a imagem leva o endereço completo (BASE_URL)");
  assert.ok(!h.includes("__BASE__") && !h.includes("__V__"), "sem marcas por substituir");
  const img = await fetch(base + "/img/og.jpg"); assert.strictEqual(img.status, 200); assert.strictEqual(img.headers.get("content-type"), "image/jpeg");
  const fav = await fetch(base + "/favicon.ico"); assert.strictEqual(fav.status, 200); assert.match(fav.headers.get("content-type"), /image\/png/);
  assert.strictEqual((await fetch(base + "/apple-touch-icon.png")).status, 200);
  assert.strictEqual((await fetch(base + "/", { redirect: "manual" })).headers.get("location"), "/entrar.html", "a raiz sem sessão vai para a entrada");
});

test("Critérios: importar de todos os grupos de uma vez (pré-visualização, regras e confirmação) e exportar", async (t) => {
  const { servidor, entrar } = await arrancar();
  t.after(() => servidor.close());
  const adm = await entrar("admin@escola.pt");
  await adm.chamar("POST", "/api/admin/professores", { upn: "ana@escola.pt", nome: "Ana" });
  const ana = await entrar("ana@escola.pt");
  const linhas = (l) => l.map((x) => x.join("\t")).join("\n");
  const ok = linhas([["Grupo", "Ano", "Critério", "Tipo", "Peso", "Casas decimais"],
    ["550 Informática", "Todos", "Testes e trabalhos", "testes", "60", "2"], ["550 Informática", "Todos", "Comportamento", "nível", "20", "2"], ["550 Informática", "Todos", "Participação", "nível", "20", "2"],
    ["550 Informática", "7.º", "Testes", "testes", "80", "1"], ["550 Informática", "7.º", "Comportamento", "nível", "20", "1"],
    ["520 Biologia e Geologia", "Todos", "Testes", "testes", "70", ""], ["520 Biologia e Geologia", "Todos", "Atitudes", "nível", "30", ""]]);
  assert.strictEqual((await ana.chamar("POST", "/api/admin/criterios/importar", { texto: ok })).estado, 403, "só administradores");
  let r = (await adm.chamar("POST", "/api/admin/criterios/importar", { texto: ok })).d;
  assert.strictEqual(r.plano.length, 3); assert.strictEqual(r.aplicaveis, 3);
  assert.ok(r.plano.every((p) => !p.problemas.length));
  assert.strictEqual((await adm.chamar("GET", "/api/grupos")).d.some((g) => g.nome === "550 Informática"), false, "a pré-visualização não grava");

  // Pesos que não somam 100 e tipo inválido
  r = (await adm.chamar("POST", "/api/admin/criterios/importar", { texto: linhas([["X", "Todos", "A", "testes", "60"], ["X", "Todos", "B", "nível", "30"], ["Y", "Todos", "C", "estranho", "100"]]) })).d;
  assert.match(r.plano[0].problemas.join(" "), /somam 90/); assert.match(r.problemasGerais.join(" "), /tipo/);
  assert.strictEqual((await adm.chamar("POST", "/api/admin/criterios/importar", { texto: linhas([["X", "Todos", "A", "testes", "60"]]), aplicar: true })).estado, 400, "não grava com problemas");

  const g = (await adm.chamar("POST", "/api/admin/criterios/importar", { texto: ok, aplicar: true })).d;
  assert.strictEqual(g.criados, 3);
  const grupos = (await adm.chamar("GET", "/api/grupos")).d, inf = grupos.find((x) => x.nome === "550 Informática");
  assert.strictEqual(inf.esquemas.length, 2);
  const todos = inf.esquemas.find((e) => e.ano === 0);
  assert.strictEqual(todos.casas, 2); assert.deepStrictEqual(todos.criterios.map((k) => [k.nome, k.peso, k.tipo]), [["Testes e trabalhos", 60, "testes"], ["Comportamento", 20, "nivel"], ["Participação", 20, "nivel"]]);
  assert.strictEqual(inf.esquemas.find((e) => e.ano === 7).casas, 1);

  // Voltar a importar o mesmo: sem alterações. Mudar um peso: substitui.
  r = (await adm.chamar("POST", "/api/admin/criterios/importar", { texto: ok })).d;
  assert.ok(r.plano.every((p) => p.acao === "igual")); assert.strictEqual(r.aplicaveis, 0);
  r = (await adm.chamar("POST", "/api/admin/criterios/importar", { texto: ok.replace("\t60\t2", "\t50\t2").replace("Comportamento\tnível\t20\t2", "Comportamento\tnível\t30\t2") })).d;
  assert.strictEqual(r.plano.find((p) => p.grupo === "550 Informática" && p.ano === 0).acao, "substituir");

  // Critério com avaliações lançadas não se retira
  const tu = (await ana.chamar("POST", "/api/turmas", { nome: "7.º A", ano_letivo: "2026/2027", ano: 7, grupo_id: inf.id })).d;
  const per = (await ana.chamar("GET", "/api/atalhos")).d[0].periodos[0].id;
  const crit = (await ana.chamar("GET", `/api/periodos/${per}/pauta`)).d.criterios.find((k) => k.tipo === "testes");
  await ana.chamar("POST", `/api/periodos/${per}/avaliacoes`, { titulo: "T1", criterio: crit.id, tipo: "teste", peso: 1, maximo: 20 });
  r = (await adm.chamar("POST", "/api/admin/criterios/importar", { texto: linhas([["550 Informática", "7", "Outro", "testes", "100", "1"]]) })).d;
  assert.strictEqual(r.plano[0].acao, "bloqueado"); assert.match(r.plano[0].problemas.join(" "), /avaliações lançadas/);

  const ex = (await adm.chamar("GET", "/api/admin/criterios/exportar")).d.csv;
  assert.ok(ex.startsWith("﻿Grupo;Ano;Critério;Tipo;Peso;Casas decimais")); assert.match(ex, /550 Informática;Todos;Testes e trabalhos;testes;60;2/);
  assert.match(ex, /520 Biologia e Geologia;Todos;Atitudes;nível;30;1/);
});

test("Disciplinas: cada docente escolhe as suas; PDFs dos critérios por grupo (só o administrador carrega)", async (t) => {
  const { base, servidor, entrar } = await arrancar();
  t.after(() => servidor.close());
  const adm = await entrar("admin@escola.pt");
  await adm.chamar("POST", "/api/admin/professores", { upn: "ana@escola.pt", nome: "Ana" });
  const ana = await entrar("ana@escola.pt");
  const csv = ["Grupo;Ano;Critério;Tipo;Peso;Casas decimais;Nível", "Informática;7;Testes;testes;70;;3.º ciclo", "Informática;7;Atitudes;nível;30;;3.º ciclo", "Multimédia;10;Testes;testes;80;;Profissional", "Multimédia;10;Atitudes;nível;20;;Profissional"].join("\n");
  assert.strictEqual((await adm.chamar("POST", "/api/admin/criterios/importar", { texto: csv, aplicar: true })).estado, 200);
  let d = (await ana.chamar("GET", "/api/disciplinas")).d;
  const inf = d.find((x) => x.nome === "Informática"), mul = d.find((x) => x.nome === "Multimédia");
  assert.deepStrictEqual(inf.anos, [7]); assert.strictEqual(inf.profissional, false); assert.strictEqual(mul.profissional, true); assert.ok(d.every((x) => !x.escolhida));
  assert.strictEqual((await ana.chamar("PUT", "/api/eu/disciplinas", { ids: [99999] })).estado, 400, "disciplina inexistente");
  assert.strictEqual((await ana.chamar("PUT", "/api/eu/disciplinas", { ids: [inf.id, mul.id] })).estado, 200);
  d = (await ana.chamar("GET", "/api/disciplinas")).d; assert.deepStrictEqual(d.filter((x) => x.escolhida).map((x) => x.nome).sort(), ["Informática", "Multimédia"]);
  let r = (await ana.chamar("GET", "/api/inicio")).d;
  assert.deepStrictEqual(r.grupos.map((g) => g.nome).sort(), ["Informática", "Multimédia"]); assert.strictEqual(r.grupo.id, inf.id, "a primeira escolha é a disciplina por defeito");

  // PDFs: corpo cru, só administradores
  const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("conteúdo de teste"), Buffer.from("\n%%EOF")]);
  const enviar = (ck, corpo, q = "") => fetch(`${base}/api/admin/documentos?grupo=${inf.id}&titulo=${encodeURIComponent("Critérios 7.º ano")}&nome=criterios.pdf${q}`, { method: "POST", headers: { cookie: ck, "x-requested-with": "eink" }, body: corpo });
  assert.strictEqual((await enviar(ana.ck, pdf)).status, 403, "só administradores");
  assert.strictEqual((await enviar(adm.ck, Buffer.from("isto não é um pdf"))).status, 400, "tem de ser PDF");
  assert.strictEqual((await enviar(adm.ck, Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(13 * 1048576)]))).status, 413, "máximo 12 MB");
  const ok = await enviar(adm.ck, pdf); assert.strictEqual(ok.status, 200); const { id } = await ok.json();
  const lista = (await ana.chamar("GET", `/api/documentos?grupo=${inf.id}`)).d;
  assert.strictEqual(lista.length, 1); assert.strictEqual(lista[0].titulo, "Critérios 7.º ano"); assert.strictEqual(lista[0].tamanho, pdf.length);
  const f = await fetch(`${base}/api/documentos/${id}/ficheiro`, { headers: { cookie: ana.ck } });
  assert.strictEqual(f.status, 200); assert.strictEqual(f.headers.get("content-type"), "application/pdf"); assert.match(f.headers.get("content-security-policy"), /sandbox/);
  assert.ok(Buffer.from(await f.arrayBuffer()).equals(pdf), "o ficheiro volta igual");
  assert.strictEqual((await fetch(`${base}/api/documentos/${id}/ficheiro`)).status, 401, "só com sessão");
  r = (await ana.chamar("GET", "/api/inicio")).d; assert.strictEqual(r.grupos.find((g) => g.id === inf.id).documentos.length, 1);
  assert.strictEqual((await ana.chamar("DELETE", `/api/admin/documentos/${id}`)).estado, 403);
  assert.strictEqual((await adm.chamar("DELETE", `/api/admin/documentos/${id}`)).estado, 200);
  assert.strictEqual((await ana.chamar("GET", `/api/documentos?grupo=${inf.id}`)).d.length, 0);
});
