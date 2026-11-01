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
  const { d: { id: aid } } = await ana.chamar("POST", `/api/periodos/${per}/avaliacoes`, { titulo: "Teste 1", tipo: "teste", peso: 100, maximo: 20 });
  const [a1, a2] = turma.alunos;
  assert.strictEqual((await ana.chamar("PUT", `/api/avaliacoes/${aid}/notas`, { linhas: [{ aluno: a1.id, nota: "15" }, { aluno: a2.id, nota: "8,5" }] })).estado, 200);
  assert.strictEqual((await ana.chamar("PUT", `/api/avaliacoes/${aid}/notas`, { linhas: [{ aluno: a1.id, nota: "25" }] })).estado, 400, "acima do máximo");

  const p = (await ana.chamar("GET", `/api/periodos/${per}/pauta`)).d;
  assert.strictEqual(p.alunos[0].final, 75);
  assert.strictEqual(p.alunos[0].nivel, 4);
  assert.strictEqual(p.alunos[1].final, 43);
  assert.strictEqual(p.alunos[1].nivel, 2);

  await ana.chamar("PUT", `/api/periodos/${per}/comportamento`, { aluno: a1.id, nivel: 5 });
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
