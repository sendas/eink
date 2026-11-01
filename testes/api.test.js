"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { criarServidor } = require("../server");

async function arrancar() {
  const { servidor } = criarServidor({ DB_FILE: ":memory:", DATA_DIR: require("node:os").tmpdir() + "/eink-teste", SEGREDO: "teste", DEV_LOGIN: "1", ADMIN_USERS: "admin@escola.pt", DOMINIOS_PERMITIDOS: "escola.pt", BASE_URL: "http://localhost" });
  await new Promise((r) => servidor.listen(0, r));
  const base = "http://127.0.0.1:" + servidor.address().port;
  const entrar = async (upn) => {
    const r = await fetch(base + "/auth/entrar?dev=" + upn, { redirect: "manual" });
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
  assert.strictEqual(p.alunos[1].final, 43);
  assert.strictEqual(p.alunos[1].nivel, 2);

  const gerais = (await ana.chamar("GET", "/api/grupos")).d[0].criterios; // grupo «Geral»: testes e trabalhos 70 %, comportamento 30 %
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
  const cri = (await adm.chamar("GET", "/api/grupos")).d.find((g) => g.id === gid).criterios;

  // Os pesos têm de somar 100 %.
  const lista = (extra) => ({ criterios: [{ id: cri[0].id, nome: "Testes", peso: 60, tipo: "testes" }, { nome: "Trabalhos", peso: 20, tipo: "testes" }, { id: cri[1].id, nome: "Atitudes", peso: 20 + extra, tipo: "nivel" }] });
  const mau = await adm.chamar("PUT", "/api/admin/grupos/" + gid, lista(5));
  assert.strictEqual(mau.estado, 400);
  assert.match(mau.d.erro, /100 %/);
  const bom = await adm.chamar("PUT", "/api/admin/grupos/" + gid, lista(0));
  assert.strictEqual(bom.estado, 200);
  const [kTestes, kTrab, kAtit] = bom.d.criterios;
  assert.deepStrictEqual(bom.d.criterios.map((k) => k.peso), [60, 20, 20]);

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
  assert.strictEqual(r2.final, Math.round((60 * 0.6 + 50 * 0.2) / 0.8)); // sem atitudes: renormaliza (57,5 → 58)
  assert.strictEqual(r2.parcial, true);

  // Um critério com avaliações lançadas não se retira; o administrador altera os pesos e a pauta acompanha.
  const semTrab = await adm.chamar("PUT", "/api/admin/grupos/" + gid, { criterios: [{ id: kTestes.id, nome: "Testes", peso: 80, tipo: "testes" }, { id: kAtit.id, nome: "Atitudes", peso: 20, tipo: "nivel" }] });
  assert.strictEqual(semTrab.estado, 409);
  await adm.chamar("PUT", "/api/admin/grupos/" + gid, { criterios: [{ id: kTestes.id, nome: "Testes", peso: 40, tipo: "testes" }, { id: kTrab.id, nome: "Trabalhos", peso: 40, tipo: "testes" }, { id: kAtit.id, nome: "Atitudes", peso: 20, tipo: "nivel" }] });
  assert.strictEqual((await ana.chamar("GET", `/api/periodos/${per}/pauta`)).d.alunos[0].final, Math.round(60 * 0.4 + 90 * 0.4 + 80 * 0.2)); // 76
  assert.strictEqual((await adm.chamar("PUT", "/api/admin/grupos/" + gid, { criterios: [{ id: kAtit.id, nome: "Atitudes", peso: 100, tipo: "testes" }] })).estado, 409, "não muda o tipo");

  // Um docente não usa critérios de outro grupo, e o grupo com turmas não se apaga.
  const outro = (await adm.chamar("GET", "/api/grupos")).d.find((g) => g.nome === "Geral").criterios[0].id;
  assert.strictEqual((await ana.chamar("POST", `/api/periodos/${per}/avaliacoes`, { titulo: "Y", criterio: outro })).estado, 400);
  assert.strictEqual((await adm.chamar("DELETE", "/api/admin/grupos/" + gid)).estado, 409);

  // CSV com a média de cada critério
  const csv = await (await fetch(`http://127.0.0.1:${servidor.address().port}/api/periodos/${per}/pauta.csv`, { headers: { cookie: ana.ck } })).text();
  assert.match(csv, /Média Testes \(40 %\)/);
  assert.match(csv, /Média Trabalhos \(40 %\)/);
});
