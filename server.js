"use strict";
// Servidor: ficheiros estáticos, entrada por Microsoft Entra ID e API JSON para docentes.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const criarAuth = require("./lib/auth");
const { abrir, criarEsquema } = require("./lib/db");
const { pauta, lerNota, NIVEIS, INTERCALAR, propostaInter } = require("./lib/avaliacao");
const { criarXlsx } = require("./lib/xlsx");
const { lerAlunos } = require("./lib/xlsx-ler");
const APR = require("./public/apreciacao.js");
const { criarCopias } = require("./lib/copias");
const registarAdmin = require("./lib/m-admin");
const registarContas = require("./lib/m-contas");
const registarCriterios = require("./lib/m-criterios");
const registarDisciplinas = require("./lib/m-disciplinas");
const CONTAS = require("./lib/contas");
const VERSOES = require("./lib/versoes");
const VERSAO = require("./package.json").version;
const criarCorreio = require("./lib/correio");
const ferramentas = require("./lib/m-ferramentas");
const registarQuiz = require("./lib/m-quiz");
const registarNotas = require("./lib/m-notas");
const registarDT = require("./lib/m-dt");
const registarPartilhas = require("./lib/m-partilhas");
const estatisticas = require("./lib/m-estatisticas");
const criarPublico = require("./lib/m-publico");
const VIVO = require("./lib/vivo");
const { ehMembro, perfil, grupoDeTexto, semGrupo } = require("./lib/grupo");

function criarServidor(env = process.env) {
  const DATA_DIR = env.DATA_DIR || path.join(__dirname, "data");
  const BASE_URL = (env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const lista = (s) => String(s || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const ADMINS = lista(env.ADMIN_USERS);
  const DOMINIOS = lista(env.DOMINIOS_PERMITIDOS);
  // Como no helpdesk-escolar: quem entra é quem pertence ao grupo «docentes» do Entra ID (ID do grupo); sem esta variável, vale a lista de docentes do administrador.
  const GRUPO_DOCENTES = String(env.GRUPO_DOCENTES_ID || "").trim();
  const GRUPO_ADMIN = String(env.GRUPO_ADMIN_ID || "").trim();
  const GRAPH_URL = env.GRAPH_URL || "https://graph.microsoft.com/v1.0";
  // Entrada de teste sem Microsoft: só em http (nunca em produção com HTTPS).
  const DEV = env.DEV_LOGIN === "1" && !BASE_URL.startsWith("https://");
  const PUBLIC = path.join(__dirname, "public");

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = abrir(env.DB_FILE || path.join(DATA_DIR, "eink.db"));

  const est = estatisticas.criar(db);
  const copias = criarCopias(db, path.join(DATA_DIR, "copias"));
  let relogioCopias = null;
  // Cópia automática: uma ao arrancar (se a última tiver mais de 24 h) e verificação de hora a hora. Não corre nos testes (base em memória).
  if ((env.DB_FILE || "x") !== ":memory:" && env.COPIAS !== "0") {
    const tentar = () => { try { copias.seNecessario(24); est.limpar(); } catch (e) { console.error("Manutenção falhou:", e.message); } };
    setTimeout(tentar, 5000).unref();
    relogioCopias = setInterval(tentar, 3600000); relogioCopias.unref();
  }

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
  // `grupo`: undefined = modo lista; true/false = pertence (ou não) ao grupo «docentes» no Entra ID. `adminGrupo`: pertence ao grupo de administradores.
  function professorDe(upn, nome, grupo, adminGrupo) {
    const admin = ADMINS.includes(upn) || adminGrupo === true;
    let p = db.prepare("SELECT * FROM professores WHERE upn = ?").get(upn);
    if (p && p.local) return null; // uma conta local nunca se abre pela entrada Office
    if (grupo !== undefined) {
      // Modo grupo: a pertença ao grupo manda. Quem sai do grupo fica desativado e deixa de ter sessão válida.
      if (!grupo && !admin) { if (p && p.ativo) db.prepare("UPDATE professores SET ativo = 0 WHERE id = ?").run(p.id); return null; }
      if (!p) { db.prepare("INSERT INTO professores (upn, nome, admin) VALUES (?, ?, ?)").run(upn, nome, admin ? 1 : 0); p = db.prepare("SELECT * FROM professores WHERE upn = ?").get(upn); }
      else if (!p.ativo) { db.prepare("UPDATE professores SET ativo = 1 WHERE id = ?").run(p.id); p.ativo = 1; }
      if (GRUPO_ADMIN && !!p.admin !== admin) { db.prepare("UPDATE professores SET admin = ? WHERE id = ?").run(admin ? 1 : 0, p.id); p.admin = admin ? 1 : 0; }
    } else if (!p && admin) {
      db.prepare("INSERT INTO professores (upn, nome, admin) VALUES (?, ?, 1)").run(upn, nome);
      p = db.prepare("SELECT * FROM professores WHERE upn = ?").get(upn);
    }
    if (p && ADMINS.includes(upn) && !p.admin) { db.prepare("UPDATE professores SET admin = 1 WHERE id = ?").run(p.id); p.admin = 1; }
    return p && p.ativo ? p : null;
  }
  // O grupo de recrutamento vem do Entra (departamento, cargo ou nome). Guarda-se em grupo_ad e, se o docente ainda não tem grupo disciplinar,
  // associa-se ao grupo com esse código (ou cria-se «550 Informática» com os critérios por defeito, para o administrador acertar).
  function aplicarGrupoAd(prof, textos) {
    try {
      const g = grupoDeTexto(textos); if (!g) return;
      const ad = `${g.codigo} ${g.nome}`;
      if (prof.grupo_ad !== ad) { db.prepare("UPDATE professores SET grupo_ad = ? WHERE id = ?").run(ad, prof.id); prof.grupo_ad = ad; }
      if (!prof.grupo_id) { // só se já existir um grupo com esse código; as disciplinas escolhe-as o docente
        const gr = db.prepare("SELECT id FROM grupos WHERE nome LIKE ? ORDER BY id LIMIT 1").get(g.codigo + " %");
        if (gr) { db.prepare("UPDATE professores SET grupo_id = ? WHERE id = ?").run(gr.id, prof.id); prof.grupo_id = gr.id; }
      }
    } catch (e) { console.error("Grupo do Entra:", e.message); }
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

  // Período fechado (pelo administrador): ninguém muda notas, avaliações, níveis ou intercalares.
  const dadosPeriodo = (id) => db.prepare("SELECT d.*, t.nome AS turma_nome FROM periodos d JOIN turmas t ON t.id = d.turma_id WHERE d.id = ?").get(id);
  const abertoOuErro = (periodoId) => { const d = dadosPeriodo(periodoId); if (d && d.fechado) throw erro(423, `O ${d.nome} desta turma está fechado: as notas estão bloqueadas. Pede ao administrador que o reabra.`); return d; };
  // Registo de alterações: quem, quando, o quê, e o valor antes e depois.
  const auditar = (c, periodoId, aluno, acao, detalhe = "", antes = "", depois = "") => {
    const d = dadosPeriodo(periodoId);
    db.prepare("INSERT INTO auditoria (quem, turma_id, turma, periodo_id, periodo, aluno, acao, detalhe, antes, depois) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(c.p.upn, d ? d.turma_id : null, d ? d.turma_nome : "", periodoId, d ? d.nome : "", aluno || "", acao, String(detalhe || "").slice(0, 200), String(antes ?? "").slice(0, 300), String(depois ?? "").slice(0, 300));
  };
  const nomeAluno = (id) => (db.prepare("SELECT nome FROM alunos WHERE id = ?").get(id) || { nome: "" }).nome;
  const criteriosDe = (esquemaId) => db.prepare("SELECT id, nome, peso, tipo, ordem FROM criterios WHERE esquema_id = ? ORDER BY ordem, id").all(esquemaId);
  const esquemaPorId = (id) => { const e = db.prepare("SELECT e.id, e.grupo_id, e.ano, e.casas, g.nome FROM esquemas e JOIN grupos g ON g.id = e.grupo_id WHERE e.id = ?").get(id); return e && { ...e, criterios: criteriosDe(e.id) }; };
  // O esquema de uma turma é o do seu grupo para o seu ano; sem esse, o do grupo para «todos os anos» (ano 0).
  const esquemaDaTurma = (t) => esquemaPorId(db.prepare("SELECT id FROM esquemas WHERE grupo_id = ? AND ano IN (?, 0) ORDER BY ano DESC LIMIT 1").get(t.grupo_id, t.ano).id);
  const grupoCompleto = (id) => { const g = db.prepare("SELECT id, nome FROM grupos WHERE id = ?").get(id); return g && { ...g, esquemas: db.prepare("SELECT id FROM esquemas WHERE grupo_id = ? ORDER BY ano").all(id).map((e) => { const x = esquemaPorId(e.id); return { id: x.id, ano: x.ano, casas: x.casas, criterios: x.criterios }; }) }; };
  // Turmas que dependem de um esquema, e se alguma já tem avaliações ou níveis lançados (então os critérios não podem mudar de esquema).
  const temDados = (turmaId) => !!(db.prepare("SELECT 1 FROM avaliacoes a JOIN periodos d ON d.id = a.periodo_id WHERE d.turma_id = ? LIMIT 1").get(turmaId) || db.prepare("SELECT 1 FROM niveis n JOIN periodos d ON d.id = n.periodo_id WHERE d.turma_id = ? LIMIT 1").get(turmaId));
  const turmasDoAno = (grupoId, ano) => db.prepare("SELECT id FROM turmas WHERE grupo_id = ? AND ano = ?").all(grupoId, ano);

  function dadosPauta(per) {
    const turma = db.prepare("SELECT * FROM turmas WHERE id = ?").get(per.turma_id);
    const grupo = esquemaDaTurma(turma);
    const alunos = db.prepare("SELECT id, numero, nome FROM alunos WHERE turma_id = ? ORDER BY COALESCE(numero, 9999), nome").all(per.turma_id);
    const avaliacoes = db.prepare("SELECT a.*, (SELECT COUNT(*) FROM itens WHERE avaliacao_id = a.id) AS n_itens FROM avaliacoes a WHERE periodo_id = ? ORDER BY ordem, id").all(per.id);
    const notas = new Map();
    for (const n of db.prepare("SELECT n.avaliacao_id a, n.aluno_id l, n.valor v FROM notas n JOIN avaliacoes av ON av.id = n.avaliacao_id WHERE av.periodo_id = ?").all(per.id)) notas.set(n.a + ":" + n.l, n.v);
    const niveis = new Map(db.prepare("SELECT criterio_id c, aluno_id l, nivel n FROM niveis WHERE periodo_id = ? AND nivel IS NOT NULL").all(per.id).map((r) => [r.c + ":" + r.l, r.n]));
    const linhas = pauta({ alunos, criterios: grupo.criterios, avaliacoes, notas, niveis, casas: grupo.casas });
    const fotos = new Map(db.prepare("SELECT f.aluno_id id, f.atualizada t FROM fotos f JOIN alunos a ON a.id = f.aluno_id WHERE a.turma_id = ?").all(per.turma_id).map((r) => [r.id, r.t]));
    for (const a of alunos) a.foto = fotos.get(a.id) || null;
    return { periodo: { ...per, turma_nome: turma.nome }, grupo, criterios: grupo.criterios, avaliacoes, limites: NIVEIS, notas: Object.fromEntries(notas), alunos: alunos.map((a, i) => ({ ...a, ...linhas[i] })) };
  }
  const csv = (d) => {
    const c = (v) => { let s = v === null || v === undefined ? "" : String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const n1 = (v) => (v === null || v === undefined ? "" : String(Math.round(v * 100) / 100).replace(".", ","));
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
  // Validade do segredo do Entra (CLIENT_SECRET_EXPIRA=aaaa-mm-dd): quando expira, ninguém consegue entrar. Só os administradores veem o aviso.
  const segredoExpira = () => {
    const d = String(env.CLIENT_SECRET_EXPIRA || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    return { expira: d, dias: Math.ceil((Date.parse(d + "T23:59:59Z") - Date.now()) / 86400000) };
  };
  rota("GET", "/api/eu", (c) => ({ upn: c.p.upn, nome: c.p.nome, admin: !!c.p.admin, grupo_id: c.p.grupo_id, grupoDocentes: !!GRUPO_DOCENTES, grupo_ad: c.p.grupo_ad || null, versao: VERSAO, local: !!c.p.local, trocar: !!c.p.trocar, dev: DEV, segredo: c.p.admin ? segredoExpira() : null, dt: c.p.admin || (XDT.nDirecoes ? XDT.nDirecoes(c.p.id) > 0 : false) }));
  rota("GET", "/api/turmas", (c, u) => db.prepare("SELECT t.*, g.nome AS grupo, (SELECT COUNT(*) FROM alunos WHERE turma_id = t.id) AS alunos FROM turmas t JOIN grupos g ON g.id = t.grupo_id WHERE prof_id = ? AND t.arquivada = ? ORDER BY t.nome").all(c.p.id, u.searchParams.get("arquivadas") === "1" ? 1 : 0));
  // Grupos disciplinares e critérios (leitura para todos os docentes; só o administrador os altera).
  rota("GET", "/api/grupos", () => db.prepare("SELECT id FROM grupos ORDER BY nome").all().map((g) => grupoCompleto(g.id)));
  rota("POST", "/api/turmas", (c) => {
    const nome = texto(c.b.nome, 60);
    if (!nome) throw erro(400, "Indica o nome da turma.");
    const gid = inteiro(c.b.grupo_id) ?? c.p.grupo_id ?? db.prepare("SELECT id FROM grupos ORDER BY id LIMIT 1").get().id;
    if (!db.prepare("SELECT 1 FROM grupos WHERE id = ?").get(gid)) throw erro(400, "Grupo disciplinar inexistente.");
    const ano = c.b.ano === undefined || c.b.ano === null || c.b.ano === "" ? 0 : inteiro(c.b.ano);
    if (ano === null || ano < 0 || ano > 12) throw erro(400, "Ano de escolaridade inválido.");
    const r = db.prepare("INSERT INTO turmas (prof_id, grupo_id, ano, nome, ano_letivo) VALUES (?, ?, ?, ?, ?)").run(c.p.id, gid, ano, nome, texto(c.b.ano_letivo, 20));
    const id = Number(r.lastInsertRowid);
    const ins = db.prepare("INSERT INTO periodos (turma_id, nome, ordem) VALUES (?, ?, ?)");
    ["1.º período", "2.º período", "3.º período"].forEach((n, i) => ins.run(id, n, i));
    return { id };
  });
  rota("DELETE", "/api/turmas/:id", (c) => { existe(turmaDe(c.p, c.id[0])); db.prepare("DELETE FROM auditoria WHERE turma_id = ?").run(c.id[0]); db.prepare("DELETE FROM turmas WHERE id = ?").run(c.id[0]); return { ok: true }; });
  rota("GET", "/api/turmas/:id", (c) => {
    const t = existe(turmaDe(c.p, c.id[0]));
    return {
      ...t,
      grupo: esquemaDaTurma(t),
      alunos: db.prepare("SELECT id, numero, nome FROM alunos WHERE turma_id = ? ORDER BY COALESCE(numero, 9999), nome").all(t.id),
      periodos: db.prepare("SELECT * FROM periodos WHERE turma_id = ? ORDER BY ordem, id").all(t.id),
    };
  });
  // Um aluno por linha, com número opcional à frente («12 Ana Silva»). Máximo de 60 de cada vez.
  // Alunos colados do Excel (colunas: número, nome, email, separadas por tabulações) ou um por linha com número opcional («12 Ana Silva»). Até 300 de cada vez.
  rota("POST", "/api/turmas/:id/alunos", (c) => {
    const t = existe(turmaDe(c.p, c.id[0]));
    const lista = lerAlunos(c.b.texto).slice(0, 300);
    if (!lista.length) throw erro(400, "Escreve pelo menos um nome.");
    const ins = db.prepare("INSERT INTO alunos (turma_id, numero, nome, email) VALUES (?, ?, ?, ?)");
    transacao(() => { for (const a of lista) ins.run(t.id, a.numero, texto(a.nome, 120), a.email); });
    return { adicionados: lista.length };
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
    const t = db.prepare("SELECT * FROM turmas WHERE id = ?").get(turmaId);
    const lista = esquemaDaTurma(t).criterios.filter((k) => k.tipo === "testes");
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
    abertoOuErro(per.id);
    const crit = criterioDeTestes(per.turma_id, c.b.criterio);
    const ordem = db.prepare("SELECT COALESCE(MAX(ordem), -1) + 1 AS o FROM avaliacoes WHERE periodo_id = ?").get(per.id).o;
    const id = Number(db.prepare("INSERT INTO avaliacoes (periodo_id, criterio_id, titulo, tipo, peso, maximo, data, ordem) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(per.id, crit.id, titulo, tipo, peso, maximo, /^\d{4}-\d{2}-\d{2}$/.test(c.b.data || "") ? c.b.data : null, ordem).lastInsertRowid);
    auditar(c, per.id, "", "Avaliação criada", `${titulo} (${crit.nome}, peso ${peso}, máx. ${maximo})`);
    return { id };
  });
  rota("PATCH", "/api/avaliacoes/:id", (c) => {
    const a = existe(avalDe(c.p, c.id[0]));
    const titulo = c.b.titulo === undefined ? a.titulo : texto(c.b.titulo, 80);
    const peso = c.b.peso === undefined ? a.peso : Number(c.b.peso);
    if (!titulo) throw erro(400, "Indica o título.");
    if (!(peso >= 0 && peso <= 100)) throw erro(400, "O peso vai de 0 a 100.");
    abertoOuErro(a.periodo_id);
    const crit = c.b.criterio === undefined ? a.criterio_id : criterioDeTestes(a.turma_id, c.b.criterio).id;
    db.prepare("UPDATE avaliacoes SET titulo = ?, peso = ?, criterio_id = ? WHERE id = ?").run(titulo, peso, crit, a.id);
    if (peso !== a.peso || titulo !== a.titulo || crit !== a.criterio_id) auditar(c, a.periodo_id, "", "Avaliação alterada", titulo, `${a.titulo}, peso ${a.peso}`, `${titulo}, peso ${peso}`);
    return { ok: true };
  });
  rota("DELETE", "/api/avaliacoes/:id", (c) => {
    const a = existe(avalDe(c.p, c.id[0]));
    abertoOuErro(a.periodo_id);
    const n = db.prepare("SELECT COUNT(*) AS n FROM notas WHERE avaliacao_id = ?").get(a.id).n;
    db.prepare("DELETE FROM avaliacoes WHERE id = ?").run(a.id);
    auditar(c, a.periodo_id, "", "Avaliação apagada", a.titulo, `${n} notas`, "");
    return { ok: true };
  });
  // linhas: [{ aluno, nota }], nota em texto («15», «15,5», «15/20»); vazio apaga.
  rota("PUT", "/api/avaliacoes/:id/notas", (c) => {
    const a = existe(avalDe(c.p, c.id[0]));
    abertoOuErro(a.periodo_id);
    if (db.prepare("SELECT 1 FROM itens WHERE avaliacao_id = ? LIMIT 1").get(a.id)) throw erro(409, "Este teste tem grelha: lança as pontuações na grelha.");
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
        const antes = (db.prepare("SELECT valor FROM notas WHERE avaliacao_id = ? AND aluno_id = ?").get(a.id, al) || {}).valor ?? "";
        if (v === null) del.run(a.id, al); else ups.run(a.id, al, v);
        if (String(antes) !== String(v ?? "")) auditar(c, a.periodo_id, nomeAluno(al), "Nota", a.titulo, antes, v ?? "");
      }
    });
    return { ok: true };
  });
  // ---------- grelha de um teste: itens com cotação e pontuação de cada aluno ----------
  const itensDe = (id) => db.prepare("SELECT id, grupo, nome, cotacao FROM itens WHERE avaliacao_id = ? ORDER BY ordem, id").all(id);
  // A nota de cada aluno no teste é a soma das suas pontuações; sem nenhuma pontuação, fica sem nota.
  function sincronizarGrelha(a) {
    const somas = db.prepare("SELECT ni.aluno_id l, SUM(ni.valor) v FROM notas_itens ni JOIN itens i ON i.id = ni.item_id WHERE i.avaliacao_id = ? AND ni.valor IS NOT NULL GROUP BY ni.aluno_id").all(a.id);
    db.prepare("DELETE FROM notas WHERE avaliacao_id = ?").run(a.id);
    const ins = db.prepare("INSERT INTO notas (avaliacao_id, aluno_id, valor) VALUES (?, ?, ?)");
    for (const x of somas) ins.run(a.id, x.l, Math.round(x.v * 10000) / 10000);
  }
  function dadosGrelha(a) {
    const itens = itensDe(a.id);
    const alunos = db.prepare("SELECT id, numero, nome FROM alunos WHERE turma_id = ? ORDER BY COALESCE(numero, 9999), nome").all(a.turma_id);
    const marcas = new Map(db.prepare("SELECT ni.item_id i, ni.aluno_id l, ni.valor v FROM notas_itens ni JOIN itens it ON it.id = ni.item_id WHERE it.avaliacao_id = ? AND ni.valor IS NOT NULL").all(a.id).map((r) => [r.i + ":" + r.l, r.v]));
    const totais = new Map(db.prepare("SELECT aluno_id l, valor v FROM notas WHERE avaliacao_id = ?").all(a.id).map((r) => [r.l, r.v]));
    return {
      avaliacao: { id: a.id, titulo: a.titulo, maximo: a.maximo, periodo_id: a.periodo_id, turma_id: a.turma_id },
      itens,
      alunos: alunos.map((al) => ({ ...al, marcas: Object.fromEntries(itens.filter((i) => marcas.has(i.id + ":" + al.id)).map((i) => [i.id, marcas.get(i.id + ":" + al.id)])), total: totais.has(al.id) ? totais.get(al.id) : null })),
    };
  }
  rota("GET", "/api/avaliacoes/:id/grelha", (c) => dadosGrelha(existe(avalDe(c.p, c.id[0]))));
  // Substitui os itens da grelha (lista vazia = sem grelha, as notas ficam como estão). O máximo do teste passa a ser a soma das cotações.
  // A ordem da lista é a ordem das questões. `substituir`: aceita apagar notas lançadas diretamente.
  function gravarGrelha(a, lista, substituir) {
    if (!lista || lista.length > 60) throw erro(400, "A grelha tem de 1 a 60 itens.");
    const atuais = new Map(itensDe(a.id).map((i) => [i.id, i]));
    const vistos = new Set();
    const novos = lista.map((x, i) => {
      const nome = texto(x.nome, 80), grupo = texto(x.grupo, 60), cotacao = Number(String(x.cotacao).replace(",", "."));
      if (!nome) throw erro(400, "Todos os itens precisam de nome.");
      if (!(cotacao > 0 && cotacao <= 1000)) throw erro(400, `A cotação de «${nome}» tem de ser maior que 0.`);
      const id = x.id === undefined || x.id === null ? null : inteiro(x.id);
      if (id !== null) { if (!atuais.has(id) || vistos.has(id)) throw erro(400, "Item que não pertence a este teste."); vistos.add(id); }
      return { id, nome, grupo, cotacao, ordem: i };
    });
    transacao(() => {
      if (!novos.length) { db.prepare("DELETE FROM itens WHERE avaliacao_id = ?").run(a.id); return; }
      if (!atuais.size && db.prepare("SELECT 1 FROM notas WHERE avaliacao_id = ? LIMIT 1").get(a.id) && substituir !== true) throw erro(409, "Este teste já tem notas lançadas diretamente: ao criar a grelha serão apagadas.");
      for (const k of novos) {
        if (k.id !== null && db.prepare("SELECT 1 FROM notas_itens WHERE item_id = ? AND valor > ? LIMIT 1").get(k.id, k.cotacao)) throw erro(409, `Há pontuações acima da nova cotação de «${k.nome}».`);
      }
      for (const [id] of atuais) if (!vistos.has(id)) db.prepare("DELETE FROM itens WHERE id = ?").run(id);
      for (const k of novos) {
        if (k.id === null) db.prepare("INSERT INTO itens (avaliacao_id, grupo, nome, cotacao, ordem) VALUES (?, ?, ?, ?, ?)").run(a.id, k.grupo, k.nome, k.cotacao, k.ordem);
        else db.prepare("UPDATE itens SET grupo = ?, nome = ?, cotacao = ?, ordem = ? WHERE id = ?").run(k.grupo, k.nome, k.cotacao, k.ordem, k.id);
      }
      const max = Math.round(novos.reduce((z, k) => z + k.cotacao, 0) * 10000) / 10000;
      db.prepare("UPDATE avaliacoes SET maximo = ? WHERE id = ?").run(max, a.id);
      sincronizarGrelha(a);
    });
  }
  rota("PUT", "/api/avaliacoes/:id/grelha", (c) => {
    const a = existe(avalDe(c.p, c.id[0]));
    abertoOuErro(a.periodo_id);
    gravarGrelha(a, Array.isArray(c.b.itens) ? c.b.itens : null, c.b.substituir);
    auditar(c, a.periodo_id, "", "Grelha alterada", a.titulo, "", `${(c.b.itens || []).length} questões`);
    return dadosGrelha(existe(avalDe(c.p, a.id)));
  });
  // Testes do docente que já têm grelha (para copiar a estrutura para outro teste).
  rota("GET", "/api/grelhas", (c) => db.prepare(`SELECT a.id, a.titulo, a.maximo, d.nome AS periodo, t.nome AS turma, t.ano_letivo, (SELECT COUNT(*) FROM itens WHERE avaliacao_id = a.id) AS n_itens
    FROM avaliacoes a JOIN periodos d ON d.id = a.periodo_id JOIN turmas t ON t.id = d.turma_id WHERE t.prof_id = ? AND EXISTS (SELECT 1 FROM itens WHERE avaliacao_id = a.id) ORDER BY t.nome, d.ordem, a.ordem`).all(c.p.id));
  // Copia só a estrutura (questões, grupos, cotações e ordem) de outro teste do mesmo docente; as pontuações dos alunos não se copiam.
  rota("POST", "/api/avaliacoes/:id/grelha/copiar", (c) => {
    const a = existe(avalDe(c.p, c.id[0]));
    abertoOuErro(a.periodo_id);
    let itens;
    if (c.b.partilha !== undefined) {
      const sh = existe(db.prepare("SELECT dados FROM partilhas WHERE id = ? AND tipo = 'grelha' AND grupo_id = ?").get(inteiro(c.b.partilha), c.p.grupo_id ?? -1), "Partilha inexistente.");
      itens = JSON.parse(sh.dados);
    } else {
      const origem = existe(avalDe(c.p, inteiro(c.b.de)), "Teste de origem inexistente.");
      if (origem.id === a.id) throw erro(400, "Escolhe outro teste.");
      itens = itensDe(origem.id);
    }
    if (!itens.length) throw erro(400, "O teste de origem não tem grelha.");
    const temPontos = db.prepare("SELECT 1 FROM notas_itens ni JOIN itens i ON i.id = ni.item_id WHERE i.avaliacao_id = ? LIMIT 1").get(a.id) || db.prepare("SELECT 1 FROM notas WHERE avaliacao_id = ? LIMIT 1").get(a.id);
    if (temPontos && c.b.substituir !== true) throw erro(409, "Este teste já tem pontuações ou notas lançadas: ao copiar a grelha serão apagadas.");
    // As questões atuais saem (ficam as copiadas), por isso passam sem id.
    gravarGrelha(a, itens.map((i) => ({ grupo: i.grupo, nome: i.nome, cotacao: i.cotacao })), true);
    return dadosGrelha(existe(avalDe(c.p, a.id)));
  });
  // linhas: [{ aluno, item, nota }]; nota em texto («1,5», «3/4»), vazio apaga. Cada pontuação vai de 0 à cotação do item.
  rota("PUT", "/api/avaliacoes/:id/grelha/notas", (c) => {
    const a = existe(avalDe(c.p, c.id[0]));
    const linhas = Array.isArray(c.b.linhas) ? c.b.linhas.slice(0, 2000) : [];
    abertoOuErro(a.periodo_id);
    const itens = new Map(itensDe(a.id).map((i) => [i.id, i]));
    if (!itens.size) throw erro(409, "Este teste ainda não tem grelha.");
    const doTurma = new Set(db.prepare("SELECT id FROM alunos WHERE turma_id = ?").all(a.turma_id).map((x) => x.id));
    const ups = db.prepare("INSERT INTO notas_itens (item_id, aluno_id, valor) VALUES (?, ?, ?) ON CONFLICT (item_id, aluno_id) DO UPDATE SET valor = excluded.valor");
    const del = db.prepare("DELETE FROM notas_itens WHERE item_id = ? AND aluno_id = ?");
    transacao(() => {
      for (const l of linhas) {
        const al = inteiro(l.aluno), it = itens.get(inteiro(l.item));
        if (!doTurma.has(al)) throw erro(400, "Aluno que não pertence à turma.");
        if (!it) throw erro(400, "Item que não pertence a este teste.");
        const v = lerNota(l.nota, it.cotacao);
        if (Number.isNaN(v)) throw erro(400, `Pontuação inválida em «${it.nome}» (0 a ${it.cotacao}).`);
        const antes = (db.prepare("SELECT valor FROM notas_itens WHERE item_id = ? AND aluno_id = ?").get(it.id, al) || {}).valor ?? "";
        if (v === null) del.run(it.id, al); else ups.run(it.id, al, v);
        if (String(antes) !== String(v ?? "")) auditar(c, a.periodo_id, nomeAluno(al), "Pontuação", `${a.titulo}, ${it.nome}`, antes, v ?? "");
      }
      sincronizarGrelha(a);
    });
    return dadosGrelha(a);
  });

  // Nível 1 a 5 de um critério do tipo «nivel» (por exemplo, comportamento) para um aluno e período.
  rota("PUT", "/api/periodos/:id/niveis", (c) => {
    const per = existe(periodoDe(c.p, c.id[0]));
    const a = existe(alunoDe(c.p, inteiro(c.b.aluno)));
    if (a.turma_id !== per.turma_id) throw erro(400, "Aluno que não pertence à turma.");
    const t = db.prepare("SELECT * FROM turmas WHERE id = ?").get(per.turma_id);
    const k = esquemaDaTurma(t).criterios.find((x) => x.tipo === "nivel" && x.id === inteiro(c.b.criterio));
    if (!k) throw erro(400, "Critério inválido para esta turma.");
    const n = c.b.nivel === null || c.b.nivel === "" ? null : inteiro(c.b.nivel);
    if (n !== null && (n < 1 || n > 5)) throw erro(400, "O nível vai de 1 a 5.");
    abertoOuErro(per.id);
    const nAntes = (db.prepare("SELECT nivel FROM niveis WHERE criterio_id = ? AND periodo_id = ? AND aluno_id = ?").get(k.id, per.id, a.id) || {}).nivel ?? "";
    if (String(nAntes) !== String(n ?? "")) auditar(c, per.id, a.nome, "Nível", k.nome, nAntes, n ?? "");
    db.prepare("INSERT INTO niveis (criterio_id, periodo_id, aluno_id, nivel) VALUES (?, ?, ?, ?) ON CONFLICT (criterio_id, periodo_id, aluno_id) DO UPDATE SET nivel = excluded.nivel").run(k.id, per.id, a.id, n);
    return { ok: true };
  });

  // ---------- avaliações intercalares: menção qualitativa e descritiva por aluno ----------
  const lerN = (v) => { const n = inteiro(v); if (n !== 1 && n !== 2) throw erro(400, "A intercalar é a 1.ª ou a 2.ª."); return n; };
  const NIVEIS_VALIDOS = new Set(APR.CRITERIOS.map((k) => k.id));
  function dadosInter(per, n) {
    const d = dadosPauta(per);
    const linhas = new Map(db.prepare("SELECT aluno_id l, mencao m, descritiva t, niveis v FROM intercalares WHERE periodo_id = ? AND n = ?").all(per.id, n).map((r) => [r.l, r]));
    const generos = new Map(db.prepare("SELECT id, genero FROM alunos WHERE turma_id = ?").all(per.turma_id).map((r) => [r.id, r.genero]));
    return {
      periodo: per, n, mencoes: INTERCALAR, casas: d.grupo.casas, criterios: APR.CRITERIOS.map((k) => ({ id: k.id, nome: k.nome })), etiquetas: APR.ETIQUETAS,
      alunos: d.alunos.map((a) => ({ id: a.id, numero: a.numero, nome: a.nome, genero: generos.get(a.id) || "", final: a.final, parcial: a.parcial, nivel: a.nivel, mencaoNota: a.mencao, proposta: propostaInter(a.final), mencao: linhas.get(a.id)?.m || null, descritiva: linhas.get(a.id)?.t || "", niveis: linhas.get(a.id)?.v ? JSON.parse(linhas.get(a.id).v) : {} })),
    };
  }
  rota("GET", "/api/periodos/:id/intercalares", (c, u) => dadosInter(existe(periodoDe(c.p, c.id[0])), lerN(u.searchParams.get("n") || 1)));
  // linhas: [{ aluno, mencao, descritiva, niveis }]; só se grava o que vier no pedido. Sem menção, descritiva nem níveis, apaga o registo.
  rota("PUT", "/api/periodos/:id/intercalares", (c) => {
    const per = existe(periodoDe(c.p, c.id[0])), n = lerN(c.b.n);
    abertoOuErro(per.id);
    const doTurma = new Set(db.prepare("SELECT id FROM alunos WHERE turma_id = ?").all(per.turma_id).map((x) => x.id));
    const ids = new Set(INTERCALAR.map((m) => m.id));
    const linhas = Array.isArray(c.b.linhas) ? c.b.linhas.slice(0, 200) : [];
    transacao(() => {
      for (const l of linhas) {
        const al = inteiro(l.aluno);
        if (!doTurma.has(al)) throw erro(400, "Aluno que não pertence à turma.");
        const atual = db.prepare("SELECT mencao, descritiva, niveis FROM intercalares WHERE periodo_id = ? AND aluno_id = ? AND n = ?").get(per.id, al, n) || { mencao: null, descritiva: "", niveis: "" };
        const mencao = l.mencao === undefined ? atual.mencao : (l.mencao || null);
        if (mencao !== null && !ids.has(mencao)) throw erro(400, "Menção inválida.");
        const descritiva = l.descritiva === undefined ? atual.descritiva : String(l.descritiva ?? "").replace(/\r\n/g, "\n").trim().slice(0, 2000);
        let niveis = atual.niveis;
        if (l.niveis !== undefined) {
          const o = {};
          for (const [k, v] of Object.entries(l.niveis || {})) { if (!NIVEIS_VALIDOS.has(k) || !Number.isInteger(v) || v < 1 || v > 5) throw erro(400, "Nível inválido."); o[k] = v; }
          niveis = Object.keys(o).length ? JSON.stringify(o) : "";
        }
        if (mencao === null && !descritiva && !niveis) db.prepare("DELETE FROM intercalares WHERE periodo_id = ? AND aluno_id = ? AND n = ?").run(per.id, al, n);
        else db.prepare("INSERT INTO intercalares (periodo_id, aluno_id, n, mencao, descritiva, niveis) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (periodo_id, aluno_id, n) DO UPDATE SET mencao = excluded.mencao, descritiva = excluded.descritiva, niveis = excluded.niveis").run(per.id, al, n, mencao, descritiva, niveis);
        if (mencao !== atual.mencao) auditar(c, per.id, nomeAluno(al), `Menção da ${n}.ª intercalar`, "", atual.mencao || "", mencao || "");
        if (descritiva !== atual.descritiva) auditar(c, per.id, nomeAluno(al), `Descritiva da ${n}.ª intercalar`, "texto alterado", `${atual.descritiva.length} caracteres`, `${descritiva.length} caracteres`);
      }
    });
    return dadosInter(per, n);
  });
  // Propõe a menção de cada aluno a partir da nota atual (só preenche os que ainda não têm menção, a menos que `substituir`).
  rota("POST", "/api/periodos/:id/intercalares/propor", (c) => {
    const per = existe(periodoDe(c.p, c.id[0])), n = lerN(c.b.n);
    abertoOuErro(per.id);
    const d = dadosInter(per, n);
    transacao(() => {
      for (const a of d.alunos) {
        if (!a.proposta || (a.mencao && c.b.substituir !== true)) continue;
        db.prepare("INSERT INTO intercalares (periodo_id, aluno_id, n, mencao, descritiva) VALUES (?, ?, ?, ?, '') ON CONFLICT (periodo_id, aluno_id, n) DO UPDATE SET mencao = excluded.mencao").run(per.id, a.id, n, a.proposta);
        auditar(c, per.id, a.nome, `Menção da ${n}.ª intercalar (proposta pela nota)`, "", a.mencao || "", a.proposta);
      }
    });
    return dadosInter(per, n);
  });
  // Género do aluno (só para os textos das apreciações): M, F ou vazio.
  rota("PATCH", "/api/alunos/:id", (c) => {
    const a = existe(alunoDe(c.p, c.id[0]));
    const g = c.b.genero === "M" || c.b.genero === "F" ? c.b.genero : "";
    db.prepare("UPDATE alunos SET genero = ? WHERE id = ?").run(g, a.id);
    return { ok: true };
  });

  // Folha de Excel (.xlsx): a pauta e, em folhas à parte, as avaliações intercalares com as descritivas.
  function xlsxPauta(per) {
    const d = dadosPauta(per), nomeM = Object.fromEntries(INTERCALAR.map((m) => [m.id, m.nome]));
    const cab = ["N.º", "Nome"], larg = [6, 28];
    for (const k of d.criterios) {
      if (k.tipo === "nivel") { cab.push(`${k.nome} (${k.peso} %, nível)`); larg.push(16); continue; }
      for (const a of d.avaliacoes.filter((x) => x.criterio_id === k.id)) { cab.push(`${a.titulo} (%)`); larg.push(14); }
      cab.push(`Média ${k.nome} (${k.peso} %)`); larg.push(18);
    }
    cab.push("Nota final (%)", "Nível", "Menção", "Parcial"); larg.push(14, 8, 20, 9);
    const linhas = [cab.map((v) => ({ v, e: "cab" }))];
    for (const a of d.alunos) {
      const r = [a.numero, a.nome];
      for (const k of d.criterios) {
        if (k.tipo === "nivel") { r.push(a.niveis[k.id] ?? null); continue; }
        for (const x of d.avaliacoes.filter((y) => y.criterio_id === k.id)) r.push(a.pcts[x.id] === null ? null : Math.round(a.pcts[x.id] * 100) / 100);
        r.push(a.criterios[k.id]);
      }
      r.push(a.final, a.nivel, a.mencao || null, a.parcial ? "sim" : null);
      linhas.push(r);
    }
    const folhas = [{ nome: "Pauta", larguras: larg, congelar: true, linhas }];
    for (const n of [1, 2]) {
      const i = dadosInter(per, n);
      if (!i.alunos.some((a) => a.mencao || a.descritiva)) continue;
      folhas.push({ nome: `${n}.ª intercalar`, larguras: [6, 28, 12, 16, 70], congelar: true, linhas: [["N.º", "Nome", "Nota atual (%)", "Menção", "Descritiva"].map((v) => ({ v, e: "cab" })), ...i.alunos.map((a) => [a.numero, a.nome, a.final, a.mencao ? nomeM[a.mencao] : null, { v: a.descritiva || null, e: "quebra" }])] });
    }
    return criarXlsx(folhas);
  }

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
  registarAdmin({ rota, db, erro, texto, inteiro, existe, transacao, soAdmin, turmaDe, periodoDe, dadosPauta, copias });
  const CORREIO = criarCorreio({ db, auth, segredo, graphUrl: GRAPH_URL, env, baseUrl: BASE_URL });
  rota("GET", "/api/admin/correio", (c) => { soAdmin(c); return CORREIO.estado(); });
  rota("POST", "/api/admin/correio/desligar", (c) => { soAdmin(c); CORREIO.desligar(); return CORREIO.estado(); });
  rota("POST", "/api/admin/correio/teste", async (c) => {
    soAdmin(c);
    const dest = c.p.local ? CORREIO.destinatarios() : [c.p.upn];
    const n = await CORREIO.enviar(dest, "Eça Avalia: email de teste", "O envio de email do Eça Avalia está a funcionar. Os avisos de expiração do segredo do Entra chegam a este endereço.");
    return { ok: true, enviados: n, para: dest };
  });
  if ((env.DB_FILE || "x") !== ":memory:" && env.CORREIO !== "0") {
    const avisar = () => CORREIO.verificar().then((r) => { if (r.enviado) console.log(`Aviso de expiração do segredo enviado a ${r.destinatarios} destinatário(s).`); }).catch((e) => console.error("Aviso por email falhou:", e.message));
    setTimeout(avisar, 60000).unref(); const relogioCorreio = setInterval(avisar, 6 * 3600000); relogioCorreio.unref();
  }
  // Turmas ativas com os seus períodos, para chegar às notas num só clique.
  // Resumo para a página inicial: por turma, o período em foco, a média, os níveis e o progresso das notas.
  rota("GET", "/api/inicio", (c) => {
    const ts = db.prepare("SELECT id, nome, ano_letivo, ano FROM turmas WHERE prof_id = ? AND arquivada = 0 ORDER BY ano, nome").all(c.p.id);
    const turmas = ts.map((t) => {
      const periodos = db.prepare("SELECT * FROM periodos WHERE turma_id = ? ORDER BY ordem, id").all(t.id);
      let foco = periodos[0] || null;
      for (const p of periodos) if (db.prepare("SELECT 1 FROM avaliacoes WHERE periodo_id = ? LIMIT 1").get(p.id)) foco = p;
      const alunos = db.prepare("SELECT COUNT(*) AS n FROM alunos WHERE turma_id = ?").get(t.id).n;
      const r = { ...t, alunos, periodos: periodos.map((d) => ({ id: d.id, nome: d.nome, fechado: !!d.fechado })), foco: foco ? { id: foco.id, nome: foco.nome } : null, media: null, niveis: [0, 0, 0, 0, 0], acompanhar: 0, avaliacoes: 0, notas: 0, esperadas: 0 };
      if (foco && alunos) {
        const d = dadosPauta(foco), fin = d.alunos.filter((a) => a.final !== null);
        r.media = fin.length ? Math.round((fin.reduce((z, a) => z + a.final, 0) / fin.length) * 10) / 10 : null;
        for (const a of d.alunos) if (a.nivel) r.niveis[a.nivel - 1]++;
        r.acompanhar = r.niveis[0] + r.niveis[1];
        r.avaliacoes = d.avaliacoes.length; r.notas = Object.keys(d.notas).length; r.esperadas = d.avaliacoes.length * d.alunos.length;
      }
      return r;
    });
    const comMedia = turmas.filter((t) => t.media !== null);
    const ids = db.prepare("SELECT grupo_id FROM prof_disciplinas WHERE prof_id = ? ORDER BY grupo_id").all(c.p.id).map((r) => r.grupo_id);
    if (!ids.length && c.p.grupo_id) ids.push(c.p.grupo_id);
    const anosTurmas = [...new Set(turmas.map((t) => t.ano))].sort();
    const grupos = ids.map((gid) => { const g = grupoCompleto(gid); return g && { id: g.id, nome: g.nome, ad: c.p.grupo_ad || null, esquemas: g.esquemas.map((e) => ({ ano: e.ano, casas: e.casas, criterios: e.criterios.map((k) => ({ nome: k.nome, peso: k.peso, tipo: k.tipo })) })), anosTurmas, documentos: db.prepare("SELECT id, titulo, nome, tamanho FROM documentos WHERE grupo_id = ? ORDER BY criado DESC, id DESC").all(gid) }; }).filter(Boolean);
    return { nome: c.p.nome, grupo: grupos[0] || null, grupos, turmas, totais: { turmas: turmas.length, alunos: turmas.reduce((z, t) => z + t.alunos, 0), acompanhar: turmas.reduce((z, t) => z + t.acompanhar, 0), media: comMedia.length ? Math.round((comMedia.reduce((z, t) => z + t.media, 0) / comMedia.length) * 10) / 10 : null } };
  });
  rota("GET", "/api/atalhos", (c) => db.prepare("SELECT id, nome, ano_letivo, ano FROM turmas WHERE prof_id = ? AND arquivada = 0 ORDER BY ano, nome").all(c.p.id)
    .map((t) => ({ ...t, periodos: db.prepare("SELECT id, nome, fechado FROM periodos WHERE turma_id = ? ORDER BY ordem, id").all(t.id).map((d) => ({ id: d.id, nome: d.nome, fechado: !!d.fechado })) })));
  // Fotografia do aluno: o navegador reduz a imagem (quadrada, 256 px) e envia-a como data URL; só o docente da turma a vê.
  const MAGIA = { "image/jpeg": [0xff, 0xd8, 0xff], "image/png": [0x89, 0x50, 0x4e, 0x47] };
  rota("PUT", "/api/alunos/:id/foto", (c) => {
    existe(alunoDe(c.p, c.id[0]));
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(c.b.imagem || ""));
    if (!m) throw erro(400, "A fotografia tem de ser uma imagem JPEG, PNG ou WebP.");
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > 300000) throw erro(413, "A fotografia é demasiado grande (máximo 300 KB). Escolhe uma mais pequena.");
    const ok = m[1] === "image/webp" ? buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP" : MAGIA[m[1]].every((b, i) => buf[i] === b);
    if (!ok) throw erro(400, "O ficheiro não é uma imagem válida.");
    db.prepare("INSERT INTO fotos (aluno_id, mime, dados, atualizada) VALUES (?, ?, ?, datetime('now')) ON CONFLICT (aluno_id) DO UPDATE SET mime = excluded.mime, dados = excluded.dados, atualizada = excluded.atualizada").run(c.id[0], m[1], buf);
    return { ok: true, foto: db.prepare("SELECT atualizada FROM fotos WHERE aluno_id = ?").get(c.id[0]).atualizada };
  });
  rota("DELETE", "/api/alunos/:id/foto", (c) => { existe(alunoDe(c.p, c.id[0])); db.prepare("DELETE FROM fotos WHERE aluno_id = ?").run(c.id[0]); return { ok: true }; });
  rota("GET", "/api/versoes", () => ({ atual: VERSAO, lista: VERSOES }));
  registarContas({ rota, db, erro, texto, inteiro, existe, soAdmin });
  registarDisciplinas({ rota, db, erro, inteiro, existe, soAdmin });
  registarCriterios({ rota, db, erro, texto, soAdmin, transacao, esquemaPorId, turmasDoAno, temDados, criarEsquema });
  const XF = { rota, db, erro, texto, inteiro, existe, turmaDe, DIR_MODELOS: path.join(__dirname, "modelos-quiz"), est };
  estatisticas.registar({ rota, db, erro, inteiro, soAdmin }, est);
  ferramentas.registar(XF);
  registarQuiz(XF);
  registarNotas({ rota, db, erro, existe, avalDe });
  const XDT = { rota, db, erro, texto, inteiro, soAdmin, dadosPauta };
  registarDT(XDT);
  registarPartilhas({ rota, db, erro, texto, inteiro, existe, avalDe, soAdmin });
  rota("POST", "/api/admin/grupos", (c) => {
    soAdmin(c);
    const nome = texto(c.b.nome, 60);
    if (!nome) throw erro(400, "Indica o nome do grupo.");
    if (db.prepare("SELECT 1 FROM grupos WHERE nome = ?").get(nome)) throw erro(400, "Já existe um grupo com esse nome.");
    return transacao(() => { const g = Number(db.prepare("INSERT INTO grupos (nome) VALUES (?)").run(nome).lastInsertRowid); criarEsquema(db, g, 0); return { id: g }; });
  });
  rota("PUT", "/api/admin/grupos/:id", (c) => {
    soAdmin(c);
    const g = existe(db.prepare("SELECT * FROM grupos WHERE id = ?").get(c.id[0]));
    const nome = texto(c.b.nome, 60);
    if (!nome) throw erro(400, "Indica o nome do grupo.");
    const outro = db.prepare("SELECT id FROM grupos WHERE nome = ?").get(nome);
    if (outro && outro.id !== g.id) throw erro(400, "Já existe um grupo com esse nome.");
    db.prepare("UPDATE grupos SET nome = ? WHERE id = ?").run(nome, g.id);
    return grupoCompleto(g.id);
  });
  // Esquema próprio de um ano de escolaridade (1 a 12): começa como cópia do esquema de «todos os anos».
  rota("POST", "/api/admin/grupos/:id/esquemas", (c) => {
    soAdmin(c);
    const g = existe(db.prepare("SELECT * FROM grupos WHERE id = ?").get(c.id[0]));
    const ano = inteiro(c.b.ano);
    if (ano === null || ano < 1 || ano > 12) throw erro(400, "Escolhe um ano de escolaridade de 1 a 12.");
    if (db.prepare("SELECT 1 FROM esquemas WHERE grupo_id = ? AND ano = ?").get(g.id, ano)) throw erro(400, `Já existe um esquema para o ${ano}.º ano.`);
    if (turmasDoAno(g.id, ano).some((t) => temDados(t.id))) throw erro(409, `Já há turmas do ${ano}.º ano deste grupo com avaliações lançadas pelos docentes: um esquema novo deixaria de se aplicar a elas.`);
    const base = db.prepare("SELECT id FROM esquemas WHERE grupo_id = ? AND ano = 0").get(g.id).id;
    return transacao(() => ({ id: criarEsquema(db, g.id, ano, base) }));
  });
  // Substitui as casas decimais e os critérios de um esquema. Os pesos têm de somar 100 %. Um critério com avaliações lançadas não se pode retirar nem mudar de tipo.
  rota("PUT", "/api/admin/esquemas/:id", (c) => {
    soAdmin(c);
    const e = existe(esquemaPorId(c.id[0]));
    const casas = c.b.casas === undefined ? e.casas : inteiro(c.b.casas);
    if (casas !== 1 && casas !== 2) throw erro(400, "A nota final leva 1 ou 2 casas decimais.");
    const lista = Array.isArray(c.b.criterios) ? c.b.criterios : null;
    if (!lista || lista.length < 1 || lista.length > 8) throw erro(400, "Define de 1 a 8 critérios.");
    const atuais = new Map(e.criterios.map((k) => [k.id, k]));
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
        if (!a || vistos.has(id)) throw erro(400, "Critério que não pertence a este esquema.");
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
        if (k.id === null) db.prepare("INSERT INTO criterios (esquema_id, nome, peso, tipo, ordem) VALUES (?, ?, ?, ?, ?)").run(e.id, k.nome, k.peso, k.tipo, k.ordem);
        else db.prepare("UPDATE criterios SET nome = ?, peso = ?, ordem = ? WHERE id = ?").run(k.nome, k.peso, k.ordem, k.id);
      }
      db.prepare("UPDATE esquemas SET casas = ? WHERE id = ?").run(casas, e.id);
    });
    return grupoCompleto(e.grupo_id);
  });
  rota("DELETE", "/api/admin/esquemas/:id", (c) => {
    soAdmin(c);
    const e = existe(esquemaPorId(c.id[0]));
    if (e.ano === 0) throw erro(400, "O esquema de «todos os anos» não se apaga.");
    if (turmasDoAno(e.grupo_id, e.ano).some((t) => temDados(t.id))) throw erro(409, "Há turmas deste ano com avaliações lançadas: o esquema não se pode apagar.");
    db.prepare("DELETE FROM esquemas WHERE id = ?").run(e.id);
    return grupoCompleto(e.grupo_id);
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

  rota("GET", "/api/admin/professores", (c) => { soAdmin(c); return db.prepare("SELECT id, upn, nome, admin, ativo, local, trocar, grupo_id, grupo_ad, ultimo_acesso FROM professores ORDER BY local, upn").all(); });
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
  const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
  const CABECALHOS = {
    "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin",
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  };
  function estatico(res, caminho) {
    const rel = caminho === "/" ? "/index.html" : caminho === "/favicon.ico" ? "/favicon-32.png" : caminho;
    const f = path.normalize(path.join(PUBLIC, rel));
    if (!f.startsWith(PUBLIC + path.sep)) return false;
    let st; try { st = fs.statSync(f); } catch { return false; }
    if (!st.isFile()) return false;
    const cab = { "Content-Type": TIPOS[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-cache" };
    // Nas páginas HTML, __V__ vira a versão: cada versão nova usa endereços novos para o CSS e o JS, e nem o navegador nem o Cloudflare servem cópias antigas.
    if (path.extname(f) === ".html") { res.writeHead(200, cab); res.end(fs.readFileSync(f, "utf8").replaceAll("__V__", VERSAO).replaceAll("__BASE__", BASE_URL)); return true; }
    res.writeHead(200, cab);
    fs.createReadStream(f).pipe(res);
    return true;
  }

  // ---------- pedidos ----------
  // Limite de pedidos por chave (IP) numa janela, para as páginas públicas (sondagens e quizzes).
  const contadores = new Map();
  const limitar = (chave, max, janelaMs) => {
    const t = Date.now(), l = (contadores.get(chave) || []).filter((x) => t - x < janelaMs);
    if (l.length >= max) { contadores.set(chave, l); return false; }
    l.push(t); contadores.set(chave, l);
    return true;
  };
  const limpezaContadores = setInterval(() => { const t = Date.now(); for (const [k, l] of contadores) if (!l.length || t - l[l.length - 1] > 120000) contadores.delete(k); VIVO.limparAntigas(); }, 60000);
  limpezaContadores.unref();
  const ip = (req) => (env.TRUST_PROXY === "1" ? String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() : "") || req.socket.remoteAddress || "";
  const publico = criarPublico({ db, json, corpo, auth, enviarFicheiro: (res, p) => estatico(res, p), limitar, ip, expirada: XF.sondagemExpirada, est });

  const servidor = http.createServer(async (req, res) => {
    for (const [k, v] of Object.entries(CABECALHOS)) res.setHeader(k, v);
    const u = new URL(req.url, BASE_URL);
    const p = u.pathname;
    try {
      if (p === "/healthz") return json(res, 200, { ok: true });
      if (p.startsWith("/s/") || p.startsWith("/j/") || p === "/jogar") { if (await publico(req, res, u, p)) return; }

      if (p === "/auth/entrar") {
        if (DEV && u.searchParams.get("dev")) {
          const upn = texto(u.searchParams.get("dev"), 120).toLowerCase();
          // Em modo grupo, a entrada de teste simula pertencer ao grupo (a menos que se junte &fora=1) e ao de administradores (&admin=1).
          const prof = professorDe(upn, upn.split("@")[0], GRUPO_DOCENTES ? u.searchParams.get("fora") !== "1" : undefined, GRUPO_ADMIN ? u.searchParams.get("admin") === "1" : undefined);
          if (!prof) { res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Conta sem acesso."); }
          est.contar(prof.id, "login");
          aplicarGrupoAd(prof, [u.searchParams.get("ad")]);
          db.prepare("UPDATE professores SET ultimo_acesso = datetime('now') WHERE id = ?").run(prof.id);
          auth.criarSessao(res, upn, prof.nome);
          res.writeHead(302, { Location: "/" }); return res.end();
        }
        res.writeHead(302, { Location: await auth.iniciar(res, { ip: ip(req) }) }); return res.end();
      }
      if (p === "/auth/correio/ligar") {
        const adm = sessaoDe(req);
        if (!adm || !adm.admin) { res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Só um administrador com sessão iniciada pode ligar o envio de email."); }
        res.writeHead(302, { Location: await auth.iniciar(res, { ip: ip(req), modo: "correio", scope: "openid profile email User.Read offline_access Mail.Send" }) }); return res.end();
      }
      if (p === "/auth/callback") {
        const c = await auth.concluir(req, res, u, { ip: ip(req) });
        if (c.modo === "correio") {
          const adm = sessaoDe(req);
          if (!adm || !adm.admin) throw Object.assign(erro(403, "Só um administrador com sessão iniciada pode ligar o envio de email."), { publico: true });
          if (!c.refreshToken) throw Object.assign(erro(400, "A Microsoft não deu permissão de envio. Confirma no Entra que a aplicação tem as permissões delegadas Mail.Send e offline_access."), { publico: true });
          CORREIO.ligar({ conta: c.upn, nome: c.nome, refresh: c.refreshToken, por: adm.upn });
          res.writeHead(302, { Location: "/#/correio" }); return res.end();
        }
        if (DOMINIOS.length && !DOMINIOS.includes(c.dominio)) throw Object.assign(erro(403, "Este domínio não tem acesso."), { publico: true });
        let doGrupo, adminGrupo;
        if (GRUPO_DOCENTES) doGrupo = await ehMembro(c.accessToken, GRUPO_DOCENTES, { graphUrl: GRAPH_URL });
        if (GRUPO_ADMIN) adminGrupo = await ehMembro(c.accessToken, GRUPO_ADMIN, { graphUrl: GRAPH_URL });
        const prof = professorDe(c.upn, c.nome, doGrupo, adminGrupo);
        if (!prof) throw Object.assign(erro(403, GRUPO_DOCENTES ? "A tua conta não pertence ao grupo de docentes." : "A tua conta ainda não tem acesso. Pede a um administrador que a adicione."), { publico: true });
        const perf = await perfil(c.accessToken, { graphUrl: GRAPH_URL });
        aplicarGrupoAd(prof, [perf && perf.department, perf && perf.jobTitle, perf && perf.displayName, c.nome]);
        const nomeLimpo = semGrupo(c.nome);
        db.prepare("UPDATE professores SET nome = ?, ultimo_acesso = datetime('now') WHERE id = ?").run(nomeLimpo, prof.id);
        est.contar(prof.id, "login");
        auth.criarSessao(res, c.upn, nomeLimpo);
        res.writeHead(302, { Location: "/" }); return res.end();
      }
      if (p === "/auth/local" && req.method === "POST") {
        if (req.headers["x-requested-with"] !== "eink") return json(res, 403, { erro: "Pedido recusado." });
        const b = await corpo(req), nome = texto(b.utilizador, 40).toLowerCase();
        if (!limitar("loc-ip:" + ip(req), 20, 900000) || !limitar("loc-u:" + nome, 10, 900000)) return json(res, 429, { erro: "Demasiadas tentativas. Espera uns minutos e tenta outra vez." });
        const prof = db.prepare("SELECT * FROM professores WHERE upn = ? AND local = 1").get(nome + "@local");
        const certa = await CONTAS.conferir(String(b.senha || "").slice(0, 200), prof && prof.senha);
        if (!prof || !certa || !prof.ativo) return json(res, 401, { erro: "Utilizador ou palavra-passe errados." });
        db.prepare("UPDATE professores SET ultimo_acesso = datetime('now') WHERE id = ?").run(prof.id);
        est.contar(prof.id, "login");
        auth.criarSessao(res, prof.upn, prof.nome);
        return json(res, 200, { ok: true });
      }
      if (p === "/auth/sair") { auth.terminar(res); res.writeHead(302, { Location: "/entrar.html" }); return res.end(); }

      if (p.startsWith("/api/")) {
        const prof = sessaoDe(req);
        if (!prof) return json(res, 401, { erro: "Sessão terminada. Entra outra vez." });
        const metodo = req.method;
        if (prof.trocar && p !== "/api/eu" && p !== "/api/eu/senha") return json(res, 403, { erro: "Tens de mudar a palavra-passe antes de continuar.", trocar: true });
        // Defesa contra pedidos de outros sites: as escritas têm de trazer este cabeçalho, que o navegador não deixa um site de fora pôr.
        if (metodo !== "GET" && req.headers["x-requested-with"] !== "eink") return json(res, 403, { erro: "Pedido recusado." });
        const imgQuiz = /^\/api\/quizzes\/(\d+)\/imagens\/(\d+)$/.exec(p);
        if (metodo === "GET" && imgQuiz) {
          const r = db.prepare("SELECT i.mime, i.dados FROM quiz_imagens i JOIN quizzes q ON q.id = i.quiz_id WHERE i.id = ? AND q.id = ? AND q.prof_id = ?").get(Number(imgQuiz[2]), Number(imgQuiz[1]), prof.id);
          if (!r) return json(res, 404, { erro: "Imagem inexistente." });
          res.writeHead(200, { "Content-Type": r.mime, "Cache-Control": "private, max-age=3600" });
          return res.end(Buffer.from(r.dados));
        }
        const fotoAluno = /^\/api\/alunos\/(\d+)\/foto$/.exec(p);
        if (metodo === "GET" && fotoAluno) {
          const f = alunoDe(prof, Number(fotoAluno[1])) && db.prepare("SELECT mime, dados FROM fotos WHERE aluno_id = ?").get(Number(fotoAluno[1]));
          if (!f) return json(res, 404, { erro: "Sem fotografia." });
          res.writeHead(200, { "Content-Type": f.mime, "Cache-Control": "private, max-age=86400" });
          return res.end(Buffer.from(f.dados));
        }
        if (metodo === "POST" && p === "/api/admin/documentos") {
          if (!prof.admin) return json(res, 403, { erro: "Só para administradores." });
          const gid = inteiro(u.searchParams.get("grupo"));
          if (gid === null || !db.prepare("SELECT 1 FROM grupos WHERE id = ?").get(gid)) return json(res, 400, { erro: "Escolhe o grupo (disciplina) do documento." });
          const partes = []; let n = 0;
          for await (const ch of req) { n += ch.length; if (n <= 12 * 1048576) partes.push(ch); else if (n > 64 * 1048576) { req.destroy(); return; } } // lê e descarta o excesso para o cliente poder receber a resposta
          if (n > 12 * 1048576) return json(res, 413, { erro: "O ficheiro é demasiado grande (máximo 12 MB)." });
          const buf = Buffer.concat(partes);
          if (buf.length < 8 || buf.subarray(0, 5).toString() !== "%PDF-") return json(res, 400, { erro: "O ficheiro não é um PDF válido." });
          if (db.prepare("SELECT COUNT(*) AS n FROM documentos WHERE grupo_id = ?").get(gid).n >= 30) return json(res, 409, { erro: "Este grupo já tem 30 documentos. Apaga algum antes de acrescentar outro." });
          const nome = texto(u.searchParams.get("nome"), 120).replace(/[\\/:*?"<>|]/g, "_") || "documento.pdf";
          const id = Number(db.prepare("INSERT INTO documentos (grupo_id, titulo, nome, mime, tamanho, dados, por) VALUES (?, ?, ?, 'application/pdf', ?, ?, ?)").run(gid, texto(u.searchParams.get("titulo"), 120) || nome.replace(/\.pdf$/i, ""), nome, buf.length, buf, prof.upn).lastInsertRowid);
          return json(res, 200, { id });
        }
        const docDown = /^\/api\/documentos\/(\d+)\/ficheiro$/.exec(p);
        if (metodo === "GET" && docDown) {
          const d = db.prepare("SELECT nome, mime, dados FROM documentos WHERE id = ?").get(Number(docDown[1]));
          if (!d) return json(res, 404, { erro: "Documento inexistente." });
          res.writeHead(200, { "Content-Type": d.mime, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(d.nome)}`, "Content-Security-Policy": "default-src 'none'; sandbox", "Cache-Control": "private, max-age=3600" });
          return res.end(Buffer.from(d.dados));
        }
        const cpDown = /^\/api\/admin\/copias\/descarregar$/.exec(p);
        if (metodo === "GET" && cpDown) {
          if (!prof.admin) return json(res, 403, { erro: "Só para administradores." });
          const f = copias.caminho(u.searchParams.get("nome"));
          if (!f) return json(res, 404, { erro: "Cópia inexistente." });
          res.writeHead(200, { "Content-Type": "application/gzip", "Content-Disposition": `attachment; filename="${path.basename(f)}"` });
          return fs.createReadStream(f).pipe(res);
        }
        const xlPauta = /^\/api\/periodos\/(\d+)\/pauta\.xlsx$/.exec(p);
        if (metodo === "GET" && xlPauta) {
          const per = existe(periodoDe(prof, Number(xlPauta[1])));
          est.contar(prof.id, "exportacao");
          res.writeHead(200, { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="pauta-${per.id}.xlsx"` });
          return res.end(xlsxPauta(per));
        }
        const csvPauta = /^\/api\/periodos\/(\d+)\/pauta\.csv$/.exec(p);
        if (metodo === "GET" && csvPauta) {
          const per = existe(periodoDe(prof, Number(csvPauta[1])));
          est.contar(prof.id, "exportacao");
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
        if (p !== "/entrar.html" && p !== "/privacidade.html" && !p.startsWith("/estilo") && p !== "/manifest.webmanifest" && !sessaoDe(req) && (p === "/" || p.endsWith(".html"))) {
          res.writeHead(302, { Location: "/entrar.html" }); return res.end();
        }
        if (estatico(res, p)) return;
      }
      json(res, 404, { erro: "Não encontrado." });
    } catch (e) {
      // Falha de rede ao falar com a Microsoft (entrada): mensagem útil em vez de «Erro interno».
      if (p.startsWith("/auth/") && !e.codigo && !e.publico) { console.error("Entrada:", e.message); e.codigo = 502; e.publico = true; e.message = "Não foi possível falar com o Microsoft Entra ID. Tenta outra vez dentro de uns minutos; se continuar, o administrador deve confirmar o TENANT_ID, o CLIENT_ID e o segredo."; }
      const codigo = e.codigo || 500;
      if (codigo === 500) console.error(e);
      if (p.startsWith("/api/")) return json(res, codigo, { erro: codigo === 500 ? "Erro interno." : e.message });
      const msg = e.publico || codigo < 500 ? e.message : "Erro interno.";
      // Os erros da entrada vão numa página (e não em texto simples, que alguns navegadores do telemóvel descarregam como ficheiro).
      if (p.startsWith("/auth/")) {
        const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
        res.writeHead(codigo, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(`<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Não foi possível entrar · Eça Avalia</title><link rel="stylesheet" href="/estilo.css?v=${VERSAO}"></head><body class="entrar"><main class="caixa-entrar" style="margin:12vh auto"><h1>Eça Avalia</h1><h2 style="margin-top:0">Não foi possível entrar</h2><p>${esc(msg)}</p><p><a class="botao grande" href="/entrar.html">Voltar e tentar outra vez</a></p></main></body></html>`);
      }
      res.writeHead(codigo, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(msg);
    }
  });
  servidor.on("close", () => { clearInterval(relogioCopias); clearInterval(limpezaContadores); db.close(); });
  return { servidor, db };
}

// Problemas na configuração de produção (devolve uma lista de textos; vazia se estiver tudo bem).
function verificarConfig(env) {
  const p = [];
  const https = /^https:\/\/[^/]+$/.test(String(env.BASE_URL || ""));
  if (env.DEV_LOGIN === "1") p.push("DEV_LOGIN=1 está ligado: a entrada de teste só pode existir em desenvolvimento (sem https).");
  if (!https) p.push("BASE_URL tem de ser o endereço público com https, sem barra no fim (ex.: https://sala.techpro.pt).");
  for (const k of ["TENANT_ID", "CLIENT_ID", "CLIENT_SECRET"]) if (!String(env[k] || "").trim()) p.push(`Falta ${k} (aplicação registada no Microsoft Entra ID).`);
  if (!String(env.ADMIN_USERS || "").trim()) p.push("Falta ADMIN_USERS: sem administradores ninguém consegue configurar a plataforma.");
  if (env.CLIENT_SECRET_EXPIRA && !/^\d{4}-\d{2}-\d{2}$/.test(String(env.CLIENT_SECRET_EXPIRA).trim())) p.push("CLIENT_SECRET_EXPIRA tem de ser uma data aaaa-mm-dd.");
  if (env.GRUPO_DOCENTES_ID && !/^[0-9a-f-]{36}$/i.test(env.GRUPO_DOCENTES_ID.trim())) p.push("GRUPO_DOCENTES_ID não parece um ID de objeto (GUID).");
  return p;
}

module.exports = { criarServidor, verificarConfig };

if (require.main === module) {
  // Em produção (NODE_ENV=production, como no contentor) uma configuração incompleta pára o arranque com uma explicação, em vez de falhar à primeira entrada.
  if (process.env.NODE_ENV === "production") {
    const problemas = verificarConfig(process.env);
    if (problemas.length) { console.error("Configuração incompleta:\n - " + problemas.join("\n - ") + "\nCorrige o ficheiro .env e volta a arrancar (docker compose up -d)."); process.exit(1); }
  }
  const exp = String(process.env.CLIENT_SECRET_EXPIRA || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(exp)) { const dias = Math.ceil((Date.parse(exp + "T23:59:59Z") - Date.now()) / 86400000); if (dias <= 60) console.warn(dias < 0 ? `ATENÇÃO: o segredo do Entra expirou em ${exp}: ninguém consegue entrar. Cria um novo e atualiza CLIENT_SECRET.` : `Aviso: o segredo do Entra expira em ${dias} dias (${exp}). Cria um novo e atualiza CLIENT_SECRET.`); }
  const { servidor } = criarServidor();
  const porta = Number(process.env.PORT) || 3000;
  servidor.listen(porta, () => console.log(`eink a ouvir na porta ${porta}`));
  for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => servidor.close(() => process.exit(0)));
}
