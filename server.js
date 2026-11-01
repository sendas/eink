"use strict";
// Servidor: ficheiros estáticos, entrada por Microsoft Entra ID e API JSON para docentes.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const criarAuth = require("./lib/auth");
const { abrir } = require("./lib/db");
const { pauta, lerNota, NIVEIS } = require("./lib/avaliacao");

function criarServidor(env = process.env) {
  const DATA_DIR = env.DATA_DIR || path.join(__dirname, "data");
  const BASE_URL = (env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const lista = (s) => String(s || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const ADMINS = lista(env.ADMIN_USERS);
  const DOMINIOS = lista(env.DOMINIOS_PERMITIDOS);
  // Entrada de teste sem Microsoft: só em http (nunca em produção com HTTPS).
  const DEV = env.DEV_LOGIN === "1" && !BASE_URL.startsWith("https://");
  const PUBLIC = path.join(__dirname, "public");

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = abrir(env.DB_FILE || path.join(DATA_DIR, "eink.db"));

  // O segredo das sessões fica no volume de dados, para sobreviver a reinícios.
  let segredo = env.SEGREDO;
  if (!segredo) {
    const f = path.join(DATA_DIR, "segredo.txt");
    try { segredo = fs.readFileSync(f, "utf8").trim(); } catch { /* ainda não existe */ }
    if (!segredo) { segredo = crypto.randomBytes(32).toString("hex"); fs.writeFileSync(f, segredo, { mode: 0o600 }); }
  }
  const auth = criarAuth({
    tenant: env.TENANT_ID, clientId: env.CLIENT_ID, clientSecret: env.CLIENT_SECRET, baseUrl: BASE_URL,
    issuerBase: "https://login.microsoftonline.com", segredo, sessaoHoras: Number(env.SESSAO_HORAS) || 8, prompt: env.OIDC_PROMPT || "select_account",
  });

  // ---------- utilitários ----------
  const erro = (codigo, msg) => Object.assign(new Error(msg), { codigo });
  const json = (res, codigo, obj) => {
    const t = JSON.stringify(obj);
    res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(t);
  };
  async function corpo(req) {
    let n = 0; const partes = [];
    for await (const p of req) { n += p.length; if (n > 1e6) throw erro(413, "Pedido demasiado grande."); partes.push(p); }
    if (!partes.length) return {};
    try { return JSON.parse(Buffer.concat(partes).toString("utf8")); } catch { throw erro(400, "JSON inválido."); }
  }
  const texto = (v, max = 120) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
  const inteiro = (v) => { const n = Number(v); return Number.isInteger(n) ? n : null; };

  // Um docente só entra se estiver na lista (ou for administrador). O domínio escolar também inclui alunos,
  // por isso o domínio, sozinho, nunca chega.
  function professorDe(upn, nome) {
    let p = db.prepare("SELECT * FROM professores WHERE upn = ?").get(upn);
    if (!p && ADMINS.includes(upn)) {
      db.prepare("INSERT INTO professores (upn, nome, admin) VALUES (?, ?, 1)").run(upn, nome);
      p = db.prepare("SELECT * FROM professores WHERE upn = ?").get(upn);
    }
    if (p && ADMINS.includes(upn) && !p.admin) { db.prepare("UPDATE professores SET admin = 1 WHERE id = ?").run(p.id); p.admin = 1; }
    return p && p.ativo ? p : null;
  }
  function sessaoDe(req) {
    const s = auth.sessao(req);
    if (!s) return null;
    const p = db.prepare("SELECT * FROM professores WHERE upn = ? AND ativo = 1").get(s.user);
    return p || null;
  }

  // Cada função devolve a linha só se pertencer ao docente.
  const turmaDe = (p, id) => db.prepare("SELECT * FROM turmas WHERE id = ? AND prof_id = ?").get(id, p.id);
  const periodoDe = (p, id) => db.prepare("SELECT d.* FROM periodos d JOIN turmas t ON t.id = d.turma_id WHERE d.id = ? AND t.prof_id = ?").get(id, p.id);
  const avalDe = (p, id) => db.prepare("SELECT a.*, d.turma_id FROM avaliacoes a JOIN periodos d ON d.id = a.periodo_id JOIN turmas t ON t.id = d.turma_id WHERE a.id = ? AND t.prof_id = ?").get(id, p.id);
  const alunoDe = (p, id) => db.prepare("SELECT a.* FROM alunos a JOIN turmas t ON t.id = a.turma_id WHERE a.id = ? AND t.prof_id = ?").get(id, p.id);
  const existe = (x, msg = "Não encontrado.") => { if (!x) throw erro(404, msg); return x; };
  const transacao = (fn) => { db.exec("BEGIN"); try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; } };

  const criteriosDe = (grupoId) => db.prepare("SELECT id, nome, peso, tipo, ordem FROM criterios WHERE grupo_id = ? ORDER BY ordem, id").all(grupoId);
  const grupoCom = (id) => { const g = db.prepare("SELECT id, nome FROM grupos WHERE id = ?").get(id); return g && { ...g, criterios: criteriosDe(g.id) }; };

  function dadosPauta(per) {
    const turma = db.prepare("SELECT * FROM turmas WHERE id = ?").get(per.turma_id);
    const grupo = grupoCom(turma.grupo_id);
    const alunos = db.prepare("SELECT id, numero, nome FROM alunos WHERE turma_id = ? ORDER BY COALESCE(numero, 9999), nome").all(per.turma_id);
    const avaliacoes = db.prepare("SELECT * FROM avaliacoes WHERE periodo_id = ? ORDER BY ordem, id").all(per.id);
    const notas = new Map();
    for (const n of db.prepare("SELECT n.avaliacao_id a, n.aluno_id l, n.valor v FROM notas n JOIN avaliacoes av ON av.id = n.avaliacao_id WHERE av.periodo_id = ?").all(per.id)) notas.set(n.a + ":" + n.l, n.v);
    const niveis = new Map(db.prepare("SELECT criterio_id c, aluno_id l, nivel n FROM niveis WHERE periodo_id = ? AND nivel IS NOT NULL").all(per.id).map((r) => [r.c + ":" + r.l, r.n]));
    const linhas = pauta({ alunos, criterios: grupo.criterios, avaliacoes, notas, niveis });
    return { periodo: per, grupo, criterios: grupo.criterios, avaliacoes, limites: NIVEIS, notas: Object.fromEntries(notas), alunos: alunos.map((a, i) => ({ ...a, ...linhas[i] })) };
  }
  const csv = (d) => {
    const c = (v) => { let s = v === null || v === undefined ? "" : String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const n1 = (v) => (v === null || v === undefined ? "" : String(Math.round(v * 10) / 10).replace(".", ","));
    const cab = ["N.º", "Nome"];
    for (const k of d.criterios) {
      if (k.tipo === "nivel") cab.push(`${k.nome} (${k.peso} %, nível)`);
      else { for (const a of d.avaliacoes.filter((x) => x.criterio_id === k.id)) cab.push(`${a.titulo} (peso ${a.peso})`); cab.push(`Média ${k.nome} (${k.peso} %)`); }
    }
    cab.push("Nota final (%)", "Nível", "Menção", "Parcial");
    const l = d.alunos.map((a) => {
      const r = [a.numero, a.nome];
      for (const k of d.criterios) {
        if (k.tipo === "nivel") r.push(a.niveis[k.id] ?? "");
        else { for (const x of d.avaliacoes.filter((y) => y.criterio_id === k.id)) r.push(n1(a.pcts[x.id])); r.push(n1(a.criterios[k.id])); }
      }
      r.push(a.final, a.nivel, a.mencao, a.parcial ? "sim" : "");
      return r;
    });
    return "\ufeff" + [cab, ...l].map((r) => r.map(c).join(";")).join("\r\n") + "\r\n";
  };


  // ---------- rotas da API ----------
  const rotas = [];
  const rota = (metodo, padrao, fn) => rotas.push({ metodo, re: new RegExp("^" + padrao.replace(/:[a-z]+/g, "(\\d+)") + "$"), fn });


  // Turmas e alunos
  rota("GET", "/api/eu", (c) => ({ upn: c.p.upn, nome: c.p.nome, admin: !!c.p.admin, grupo_id: c.p.grupo_id, dev: DEV }));
  rota("GET", "/api/turmas", (c) => db.prepare("SELECT t.*, g.nome AS grupo, (SELECT COUNT(*) FROM alunos WHERE turma_id = t.id) AS alunos FROM turmas t JOIN grupos g ON g.id = t.grupo_id WHERE prof_id = ? ORDER BY t.nome").all(c.p.id));
  // Grupos disciplinares e critérios (leitura para todos os docentes; só o administrador os altera).
  rota("GET", "/api/grupos", () => db.prepare("SELECT id FROM grupos ORDER BY nome").all().map((g) => grupoCom(g.id)));
  rota("POST", "/api/turmas", (c) => {
    const nome = texto(c.b.nome, 60);
    if (!nome) throw erro(400, "Indica o nome da turma.");
    const gid = inteiro(c.b.grupo_id) ?? c.p.grupo_id ?? db.prepare("SELECT id FROM grupos ORDER BY id LIMIT 1").get().id;
    if (!db.prepare("SELECT 1 FROM grupos WHERE id = ?").get(gid)) throw erro(400, "Grupo disciplinar inexistente.");
    const r = db.prepare("INSERT INTO turmas (prof_id, grupo_id, nome, ano_letivo) VALUES (?, ?, ?, ?)").run(c.p.id, gid, nome, texto(c.b.ano_letivo, 20));
    const id = Number(r.lastInsertRowid);
    const ins = db.prepare("INSERT INTO periodos (turma_id, nome, ordem) VALUES (?, ?, ?)");
    ["1.º período", "2.º período", "3.º período"].forEach((n, i) => ins.run(id, n, i));
    return { id };
  });
  rota("DELETE", "/api/turmas/:id", (c) => { existe(turmaDe(c.p, c.id[0])); db.prepare("DELETE FROM turmas WHERE id = ?").run(c.id[0]); return { ok: true }; });
  rota("GET", "/api/turmas/:id", (c) => {
    const t = existe(turmaDe(c.p, c.id[0]));
    return {
      ...t,
      grupo: grupoCom(t.grupo_id),
      alunos: db.prepare("SELECT id, numero, nome FROM alunos WHERE turma_id = ? ORDER BY COALESCE(numero, 9999), nome").all(t.id),
      periodos: db.prepare("SELECT * FROM periodos WHERE turma_id = ? ORDER BY ordem, id").all(t.id),
    };
  });
  // Um aluno por linha, com número opcional à frente («12 Ana Silva»). Máximo de 60 de cada vez.
  rota("POST", "/api/turmas/:id/alunos", (c) => {
    const t = existe(turmaDe(c.p, c.id[0]));
    const linhas = String(c.b.texto || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 60);
    if (!linhas.length) throw erro(400, "Escreve pelo menos um nome.");
    const ins = db.prepare("INSERT INTO alunos (turma_id, numero, nome) VALUES (?, ?, ?)");
    transacao(() => { for (const l of linhas) { const m = /^(\d{1,3})[\s.\-;,]+(.+)$/.exec(l); ins.run(t.id, m ? Number(m[1]) : null, texto(m ? m[2] : l, 120)); } });
    return { adicionados: linhas.length };
  });
  rota("DELETE", "/api/alunos/:id", (c) => { existe(alunoDe(c.p, c.id[0])); db.prepare("DELETE FROM alunos WHERE id = ?").run(c.id[0]); return { ok: true }; });

  // Períodos e avaliações
  rota("POST", "/api/turmas/:id/periodos", (c) => {
    const t = existe(turmaDe(c.p, c.id[0]));
    const nome = texto(c.b.nome, 60);
    if (!nome) throw erro(400, "Indica o nome do período.");
    const ordem = db.prepare("SELECT COALESCE(MAX(ordem), -1) + 1 AS o FROM periodos WHERE turma_id = ?").get(t.id).o;
    return { id: Number(db.prepare("INSERT INTO periodos (turma_id, nome, ordem) VALUES (?, ?, ?)").run(t.id, nome, ordem).lastInsertRowid) };
  });
  rota("GET", "/api/periodos/:id/pauta", (c) => dadosPauta(existe(periodoDe(c.p, c.id[0]))));
  // O critério tem de ser do tipo «testes» e do grupo disciplinar da turma; sem critério, usa o primeiro desse tipo.
  const criterioDeTestes = (turmaId, id) => {
    const t = db.prepare("SELECT grupo_id FROM turmas WHERE id = ?").get(turmaId);
    const lista = criteriosDe(t.grupo_id).filter((k) => k.tipo === "testes");
    const k = id === null || id === undefined ? lista[0] : lista.find((x) => x.id === inteiro(id));
    if (!k) throw erro(400, "Critério inválido para esta turma.");
    return k;
  };
  rota("POST", "/api/periodos/:id/avaliacoes", (c) => {
    const per = existe(periodoDe(c.p, c.id[0]));
    const titulo = texto(c.b.titulo, 80);
    if (!titulo) throw erro(400, "Indica o título.");
    const tipo = ["teste", "trabalho", "ficha", "oral", "outro"].includes(c.b.tipo) ? c.b.tipo : "teste";
    const peso = Number(c.b.peso ?? 1), maximo = Number(c.b.maximo ?? 100);
    if (!(peso >= 0 && peso <= 100)) throw erro(400, "O peso vai de 0 a 100.");
    if (!(maximo > 0 && maximo <= 1000)) throw erro(400, "O máximo tem de ser maior que 0.");
    const crit = criterioDeTestes(per.turma_id, c.b.criterio);
    const ordem = db.prepare("SELECT COALESCE(MAX(ordem), -1) + 1 AS o FROM avaliacoes WHERE periodo_id = ?").get(per.id).o;
    return { id: Number(db.prepare("INSERT INTO avaliacoes (periodo_id, criterio_id, titulo, tipo, peso, maximo, data, ordem) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(per.id, crit.id, titulo, tipo, peso, maximo, /^\d{4}-\d{2}-\d{2}$/.test(c.b.data || "") ? c.b.data : null, ordem).lastInsertRowid) };
  });
  rota("PATCH", "/api/avaliacoes/:id", (c) => {
    const a = existe(avalDe(c.p, c.id[0]));
    const titulo = c.b.titulo === undefined ? a.titulo : texto(c.b.titulo, 80);
    const peso = c.b.peso === undefined ? a.peso : Number(c.b.peso);
    if (!titulo) throw erro(400, "Indica o título.");
    if (!(peso >= 0 && peso <= 100)) throw erro(400, "O peso vai de 0 a 100.");
    const crit = c.b.criterio === undefined ? a.criterio_id : criterioDeTestes(a.turma_id, c.b.criterio).id;
    db.prepare("UPDATE avaliacoes SET titulo = ?, peso = ?, criterio_id = ? WHERE id = ?").run(titulo, peso, crit, a.id);
    return { ok: true };
  });
  rota("DELETE", "/api/avaliacoes/:id", (c) => { existe(avalDe(c.p, c.id[0])); db.prepare("DELETE FROM avaliacoes WHERE id = ?").run(c.id[0]); return { ok: true }; });
  // linhas: [{ aluno, nota }], nota em texto («15», «15,5», «15/20»); vazio apaga.
  rota("PUT", "/api/avaliacoes/:id/notas", (c) => {
    const a = existe(avalDe(c.p, c.id[0]));
    const linhas = Array.isArray(c.b.linhas) ? c.b.linhas.slice(0, 200) : [];
    const doTurma = new Set(db.prepare("SELECT id FROM alunos WHERE turma_id = ?").all(a.turma_id).map((x) => x.id));
    const ups = db.prepare("INSERT INTO notas (avaliacao_id, aluno_id, valor) VALUES (?, ?, ?) ON CONFLICT (avaliacao_id, aluno_id) DO UPDATE SET valor = excluded.valor");
    const del = db.prepare("DELETE FROM notas WHERE avaliacao_id = ? AND aluno_id = ?");
    transacao(() => {
      for (const l of linhas) {
        const al = inteiro(l.aluno);
        if (!doTurma.has(al)) throw erro(400, "Aluno que não pertence à turma.");
        const v = lerNota(l.nota, a.maximo);
        if (Number.isNaN(v)) throw erro(400, `Nota inválida (0 a ${a.maximo}).`);
        if (v === null) del.run(a.id, al); else ups.run(a.id, al, v);
      }
    });
    return { ok: true };
  });
  // Nível 1 a 5 de um critério do tipo «nivel» (por exemplo, comportamento) para um aluno e período.
  rota("PUT", "/api/periodos/:id/niveis", (c) => {
    const per = existe(periodoDe(c.p, c.id[0]));
    const a = existe(alunoDe(c.p, inteiro(c.b.aluno)));
    if (a.turma_id !== per.turma_id) throw erro(400, "Aluno que não pertence à turma.");
    const t = db.prepare("SELECT grupo_id FROM turmas WHERE id = ?").get(per.turma_id);
    const k = criteriosDe(t.grupo_id).find((x) => x.tipo === "nivel" && x.id === inteiro(c.b.criterio));
    if (!k) throw erro(400, "Critério inválido para esta turma.");
    const n = c.b.nivel === null || c.b.nivel === "" ? null : inteiro(c.b.nivel);
    if (n !== null && (n < 1 || n > 5)) throw erro(400, "O nível vai de 1 a 5.");
    db.prepare("INSERT INTO niveis (criterio_id, periodo_id, aluno_id, nivel) VALUES (?, ?, ?, ?) ON CONFLICT (criterio_id, periodo_id, aluno_id) DO UPDATE SET nivel = excluded.nivel").run(k.id, per.id, a.id, n);
    return { ok: true };
  });

  // Presenças
  rota("GET", "/api/turmas/:id/presencas", (c, u) => {
    const t = existe(turmaDe(c.p, c.id[0]));
    const data = u.searchParams.get("data") || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw erro(400, "Data inválida.");
    return Object.fromEntries(db.prepare("SELECT p.aluno_id a, p.estado e FROM presencas p JOIN alunos l ON l.id = p.aluno_id WHERE l.turma_id = ? AND p.data = ?").all(t.id, data).map((r) => [r.a, r.e]));
  });
  rota("PUT", "/api/turmas/:id/presencas", (c) => {
    const t = existe(turmaDe(c.p, c.id[0]));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.b.data || "")) throw erro(400, "Data inválida.");
    const doTurma = new Set(db.prepare("SELECT id FROM alunos WHERE turma_id = ?").all(t.id).map((x) => x.id));
    const ups = db.prepare("INSERT INTO presencas (aluno_id, data, estado) VALUES (?, ?, ?) ON CONFLICT (aluno_id, data) DO UPDATE SET estado = excluded.estado");
    transacao(() => {
      for (const [al, e] of Object.entries(c.b.estados || {})) {
        if (!doTurma.has(Number(al)) || !["P", "F", "A"].includes(e)) throw erro(400, "Presença inválida.");
        ups.run(Number(al), c.b.data, e);
      }
    });
    return { ok: true };
  });

  // Administração: quem pode entrar
  const soAdmin = (c) => { if (!c.p.admin) throw erro(403, "Só para administradores."); };
  rota("POST", "/api/admin/grupos", (c) => {
    soAdmin(c);
    const nome = texto(c.b.nome, 60);
    if (!nome) throw erro(400, "Indica o nome do grupo.");
    if (db.prepare("SELECT 1 FROM grupos WHERE nome = ?").get(nome)) throw erro(400, "Já existe um grupo com esse nome.");
    const g = Number(db.prepare("INSERT INTO grupos (nome) VALUES (?)").run(nome).lastInsertRowid);
    const ins = db.prepare("INSERT INTO criterios (grupo_id, nome, peso, tipo, ordem) VALUES (?, ?, ?, ?, ?)");
    ins.run(g, "Testes e trabalhos", 70, "testes", 0);
    ins.run(g, "Comportamento", 30, "nivel", 1);
    return { id: g };
  });
  // Substitui o nome e os critérios do grupo. Os pesos têm de somar 100 %. Um critério com avaliações lançadas não se pode retirar nem mudar de tipo.
  rota("PUT", "/api/admin/grupos/:id", (c) => {
    soAdmin(c);
    const g = existe(db.prepare("SELECT * FROM grupos WHERE id = ?").get(c.id[0]));
    const nome = c.b.nome === undefined ? g.nome : texto(c.b.nome, 60);
    if (!nome) throw erro(400, "Indica o nome do grupo.");
    const outro = db.prepare("SELECT id FROM grupos WHERE nome = ?").get(nome);
    if (outro && outro.id !== g.id) throw erro(400, "Já existe um grupo com esse nome.");
    const lista = Array.isArray(c.b.criterios) ? c.b.criterios : null;
    if (!lista || lista.length < 1 || lista.length > 8) throw erro(400, "Define de 1 a 8 critérios.");
    const atuais = new Map(criteriosDe(g.id).map((k) => [k.id, k]));
    const vistos = new Set(), nomes = new Set();
    const novos = lista.map((k, i) => {
      const n = texto(k.nome, 60), peso = Number(k.peso), tipo = k.tipo === "nivel" ? "nivel" : "testes";
      if (!n) throw erro(400, "Todos os critérios precisam de nome.");
      if (nomes.has(n.toLowerCase())) throw erro(400, `Critério repetido: ${n}.`);
      nomes.add(n.toLowerCase());
      if (!(peso > 0 && peso <= 100)) throw erro(400, `O peso de «${n}» tem de ser maior que 0 e no máximo 100 %.`);
      const id = k.id === undefined || k.id === null ? null : inteiro(k.id);
      if (id !== null) {
        const a = atuais.get(id);
        if (!a || vistos.has(id)) throw erro(400, "Critério que não pertence a este grupo.");
        if (a.tipo !== tipo) throw erro(409, `Não se pode mudar o tipo de «${a.nome}»: apaga-o e cria outro.`);
        vistos.add(id);
      }
      return { id, nome: n, peso, tipo, ordem: i };
    });
    const soma = novos.reduce((z, k) => z + k.peso, 0);
    if (Math.abs(soma - 100) > 0.01) throw erro(400, `Os pesos somam ${Math.round(soma * 100) / 100} %: têm de somar 100 %.`);
    if (!novos.some((k) => k.tipo === "testes")) throw erro(400, "É preciso pelo menos um critério de testes.");
    transacao(() => {
      for (const [id, a] of atuais) {
        if (vistos.has(id)) continue;
        if (db.prepare("SELECT COUNT(*) AS n FROM avaliacoes WHERE criterio_id = ?").get(id).n) throw erro(409, `«${a.nome}» já tem avaliações lançadas por docentes e não se pode retirar.`);
        db.prepare("DELETE FROM criterios WHERE id = ?").run(id);
      }
      for (const k of novos) {
        if (k.id === null) db.prepare("INSERT INTO criterios (grupo_id, nome, peso, tipo, ordem) VALUES (?, ?, ?, ?, ?)").run(g.id, k.nome, k.peso, k.tipo, k.ordem);
        else db.prepare("UPDATE criterios SET nome = ?, peso = ?, ordem = ? WHERE id = ?").run(k.nome, k.peso, k.ordem, k.id);
      }
      db.prepare("UPDATE grupos SET nome = ? WHERE id = ?").run(nome, g.id);
    });
    return grupoCom(g.id);
  });
  rota("DELETE", "/api/admin/grupos/:id", (c) => {
    soAdmin(c);
    const g = existe(db.prepare("SELECT * FROM grupos WHERE id = ?").get(c.id[0]));
    if (db.prepare("SELECT COUNT(*) AS n FROM turmas WHERE grupo_id = ?").get(g.id).n) throw erro(409, "Há turmas deste grupo: não se pode apagar.");
    if (db.prepare("SELECT COUNT(*) AS n FROM grupos").get().n < 2) throw erro(409, "Tem de existir pelo menos um grupo.");
    db.prepare("DELETE FROM grupos WHERE id = ?").run(g.id);
    return { ok: true };
  });
  // Grupo disciplinar do docente: é o que as turmas novas dele usam por defeito.
  rota("PUT", "/api/admin/professores/:id/grupo", (c) => {
    soAdmin(c);
    const gid = c.b.grupo_id === null ? null : inteiro(c.b.grupo_id);
    if (gid !== null && !db.prepare("SELECT 1 FROM grupos WHERE id = ?").get(gid)) throw erro(400, "Grupo inexistente.");
    existe(db.prepare("SELECT 1 FROM professores WHERE id = ?").get(c.id[0]));
    db.prepare("UPDATE professores SET grupo_id = ? WHERE id = ?").run(gid, c.id[0]);
    return { ok: true };
  });

  rota("GET", "/api/admin/professores", (c) => { soAdmin(c); return db.prepare("SELECT id, upn, nome, admin, ativo, grupo_id, ultimo_acesso FROM professores ORDER BY upn").all(); });
  rota("POST", "/api/admin/professores", (c) => {
    soAdmin(c);
    const upn = texto(c.b.upn, 120).toLowerCase();
    if (!/^[a-z0-9._'+-]+@[a-z0-9.-]+$/.test(upn)) throw erro(400, "Email inválido.");
    if (DOMINIOS.length && !DOMINIOS.includes(upn.split("@")[1])) throw erro(400, "Domínio não permitido.");
    db.prepare("INSERT INTO professores (upn, nome) VALUES (?, ?) ON CONFLICT (upn) DO UPDATE SET ativo = 1").run(upn, texto(c.b.nome, 120));
    return { ok: true };
  });
  rota("DELETE", "/api/admin/professores/:id", (c) => {
    soAdmin(c);
    if (c.id[0] === c.p.id) throw erro(400, "Não podes desativar a tua conta.");
    db.prepare("UPDATE professores SET ativo = 0 WHERE id = ?").run(c.id[0]);
    return { ok: true };
  });

  // ---------- estáticos ----------
  const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
  const CABECALHOS = {
    "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin",
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  };
  function estatico(res, caminho) {
    const rel = caminho === "/" ? "/index.html" : caminho;
    const f = path.normalize(path.join(PUBLIC, rel));
    if (!f.startsWith(PUBLIC + path.sep)) return false;
    let st; try { st = fs.statSync(f); } catch { return false; }
    if (!st.isFile()) return false;
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-cache" });
    fs.createReadStream(f).pipe(res);
    return true;
  }

  // ---------- pedidos ----------
  const servidor = http.createServer(async (req, res) => {
    for (const [k, v] of Object.entries(CABECALHOS)) res.setHeader(k, v);
    const u = new URL(req.url, BASE_URL);
    const p = u.pathname;
    try {
      if (p === "/healthz") return json(res, 200, { ok: true });

      if (p === "/auth/entrar") {
        if (DEV && u.searchParams.get("dev")) {
          const upn = texto(u.searchParams.get("dev"), 120).toLowerCase();
          const prof = professorDe(upn, upn.split("@")[0]);
          if (!prof) { res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Conta sem acesso."); }
          auth.criarSessao(res, upn, prof.nome);
          res.writeHead(302, { Location: "/" }); return res.end();
        }
        res.writeHead(302, { Location: await auth.iniciar(res) }); return res.end();
      }
      if (p === "/auth/callback") {
        const c = await auth.concluir(req, res, u);
        if (DOMINIOS.length && !DOMINIOS.includes(c.dominio)) throw Object.assign(erro(403, "Este domínio não tem acesso."), { publico: true });
        const prof = professorDe(c.upn, c.nome);
        if (!prof) throw Object.assign(erro(403, "A tua conta ainda não tem acesso. Pede a um administrador que a adicione."), { publico: true });
        db.prepare("UPDATE professores SET nome = ?, ultimo_acesso = datetime('now') WHERE id = ?").run(c.nome, prof.id);
        auth.criarSessao(res, c.upn, c.nome);
        res.writeHead(302, { Location: "/" }); return res.end();
      }
      if (p === "/auth/sair") { auth.terminar(res); res.writeHead(302, { Location: "/entrar.html" }); return res.end(); }

      if (p.startsWith("/api/")) {
        const prof = sessaoDe(req);
        if (!prof) return json(res, 401, { erro: "Sessão terminada. Entra outra vez." });
        const metodo = req.method;
        // Defesa contra pedidos de outros sites: as escritas têm de trazer este cabeçalho, que o navegador não deixa um site de fora pôr.
        if (metodo !== "GET" && req.headers["x-requested-with"] !== "eink") return json(res, 403, { erro: "Pedido recusado." });
        const csvPauta = /^\/api\/periodos\/(\d+)\/pauta\.csv$/.exec(p);
        if (metodo === "GET" && csvPauta) {
          const per = existe(periodoDe(prof, Number(csvPauta[1])));
          res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="pauta-${per.id}.csv"` });
          return res.end(csv(dadosPauta(per)));
        }
        for (const r of rotas) {
          if (r.metodo !== metodo) continue;
          const m = r.re.exec(p);
          if (!m) continue;
          const b = metodo === "GET" || metodo === "DELETE" ? {} : await corpo(req);
          return json(res, 200, await r.fn({ p: prof, b, id: m.slice(1).map(Number) }, u));
        }
        return json(res, 404, { erro: "Não encontrado." });
      }

      if (req.method === "GET" || req.method === "HEAD") {
        if (p !== "/entrar.html" && !p.startsWith("/estilo") && p !== "/manifest.webmanifest" && !sessaoDe(req) && (p === "/" || p.endsWith(".html"))) {
          res.writeHead(302, { Location: "/entrar.html" }); return res.end();
        }
        if (estatico(res, p)) return;
      }
      json(res, 404, { erro: "Não encontrado." });
    } catch (e) {
      const codigo = e.codigo || 500;
      if (codigo === 500) console.error(e);
      if (p.startsWith("/api/")) return json(res, codigo, { erro: codigo === 500 ? "Erro interno." : e.message });
      res.writeHead(codigo, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(e.publico || codigo < 500 ? e.message : "Erro interno.");
    }
  });
  servidor.on("close", () => db.close());
  return { servidor, db };
}

module.exports = { criarServidor };

if (require.main === module) {
  const { servidor } = criarServidor();
  const porta = Number(process.env.PORT) || 3000;
  servidor.listen(porta, () => console.log(`eink a ouvir na porta ${porta}`));
  for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => servidor.close(() => process.exit(0)));
}
