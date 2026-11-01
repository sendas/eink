"use strict";
// Quizzes (estilo Kahoot): editor do docente, modelos importados do tic.techpro.pt e jogo ao vivo.
const fs = require("node:fs");
const path = require("node:path");
const { validar } = require("./quiz");
const VIVO = require("./vivo");

module.exports = function registar(X) {
  const { rota, db, erro, texto, inteiro, existe, DIR_MODELOS, est } = X;
  const meu = (p, id) => existe(db.prepare("SELECT * FROM quizzes WHERE id = ? AND prof_id = ?").get(id, p.id), "Quiz inexistente.");
  const modelos = () => (fs.existsSync(DIR_MODELOS) ? fs.readdirSync(DIR_MODELOS).filter((f) => f.endsWith(".json")).sort() : []);
  const tituloModelo = (f) => f.replace(/\.json$/, "").replace(/^tic-/, "").replace(/-/g, " ").replace(/^(\d)ano/, "$1.º ano");

  // Quando um jogo ao vivo termina, guarda o resumo (alcunhas e pontos, % de acertos por pergunta).
  VIVO.definirAoTerminar((s) => {
    const r = VIVO.resumo(s);
    db.prepare("INSERT INTO quiz_resultados (quiz_id, jogadores, resumo) VALUES (?, ?, ?)").run(s.quizId, s.jogadores.size, JSON.stringify(r));
  });

  rota("GET", "/api/quizzes", (c) => db.prepare("SELECT id, titulo, dados, atualizado FROM quizzes WHERE prof_id = ? ORDER BY atualizado DESC LIMIT 200").all(c.p.id).map((q) => ({ id: q.id, titulo: q.titulo, perguntas: JSON.parse(q.dados).perguntas.length, atualizado: q.atualizado })));
  rota("GET", "/api/quizzes/:id", (c) => { const q = meu(c.p, c.id[0]); return { id: q.id, titulo: q.titulo, ...JSON.parse(q.dados) }; });
  const guardar = (c, id) => {
    const titulo = texto(c.b.titulo, 100);
    if (!titulo) throw erro(400, "Dá um título ao quiz.");
    const dados = validar({ intro: c.b.intro, tempo: c.b.tempo, perguntas: c.b.perguntas });
    // Cada imagem tem de ser deste quiz (uma imagem de outro quiz não se pode «roubar» pelo número).
    for (const q of dados.perguntas) if (q.imagem && !(id && db.prepare("SELECT 1 FROM quiz_imagens WHERE id = ? AND quiz_id = ?").get(q.imagem, id))) delete q.imagem;
    if (id) { db.prepare("UPDATE quizzes SET titulo = ?, dados = ?, atualizado = datetime('now') WHERE id = ?").run(titulo, JSON.stringify(dados), id); return id; }
    if (db.prepare("SELECT COUNT(*) AS n FROM quizzes WHERE prof_id = ?").get(c.p.id).n >= 200) throw erro(409, "Já tens 200 quizzes.");
    return Number(db.prepare("INSERT INTO quizzes (prof_id, titulo, dados) VALUES (?, ?, ?)").run(c.p.id, titulo, JSON.stringify(dados)).lastInsertRowid);
  };
  rota("POST", "/api/quizzes", (c) => ({ id: guardar(c, null) }));
  rota("PUT", "/api/quizzes/:id", (c) => { const q = meu(c.p, c.id[0]); guardar(c, q.id); return { ok: true }; });
  rota("DELETE", "/api/quizzes/:id", (c) => { const q = meu(c.p, c.id[0]); db.prepare("DELETE FROM quizzes WHERE id = ?").run(q.id); return { ok: true }; });
  rota("POST", "/api/quizzes/:id/duplicar", (c) => {
    const q = meu(c.p, c.id[0]);
    const novo = Number(db.prepare("INSERT INTO quizzes (prof_id, titulo, dados) VALUES (?, ?, ?)").run(c.p.id, `${q.titulo} (cópia)`.slice(0, 100), q.dados).lastInsertRowid);
    const dados = JSON.parse(q.dados), mapa = new Map();
    for (const img of db.prepare("SELECT id, mime, dados FROM quiz_imagens WHERE quiz_id = ?").all(q.id)) mapa.set(img.id, Number(db.prepare("INSERT INTO quiz_imagens (quiz_id, mime, dados) VALUES (?, ?, ?)").run(novo, img.mime, img.dados).lastInsertRowid));
    for (const p of dados.perguntas) if (p.imagem) { if (mapa.has(p.imagem)) p.imagem = mapa.get(p.imagem); else delete p.imagem; }
    db.prepare("UPDATE quizzes SET dados = ? WHERE id = ?").run(JSON.stringify(dados), novo);
    return { id: novo };
  });
  // Imagens das perguntas: o navegador reduz-as (máx. 1000 px, JPEG) antes de enviar; aqui confere-se pelo conteúdo, não pelo que diz o nome.
  const tipoImagem = (b) => (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? "image/jpeg" : b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? "image/png" : b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" ? "image/webp" : null);
  rota("POST", "/api/quizzes/:id/imagens", (c) => {
    const q = meu(c.p, c.id[0]);
    const buf = Buffer.from(String(c.b.base64 || ""), "base64");
    if (!buf.length) throw erro(400, "Imagem vazia.");
    if (buf.length > 400 * 1024) throw erro(400, "A imagem é demasiado grande (máximo 400 KB). Usa uma mais pequena.");
    const mime = tipoImagem(buf);
    if (!mime) throw erro(400, "Só se aceitam imagens JPEG, PNG ou WebP.");
    if (db.prepare("SELECT COUNT(*) AS n FROM quiz_imagens WHERE quiz_id = ?").get(q.id).n >= 60) throw erro(409, "Este quiz já tem 60 imagens.");
    return { id: Number(db.prepare("INSERT INTO quiz_imagens (quiz_id, mime, dados) VALUES (?, ?, ?)").run(q.id, mime, buf).lastInsertRowid) };
  });
  rota("DELETE", "/api/quizzes/:id/imagens/:img", (c) => {
    const q = meu(c.p, c.id[0]);
    db.prepare("DELETE FROM quiz_imagens WHERE id = ? AND quiz_id = ?").run(c.id[1], q.id);
    const d = JSON.parse(q.dados); let mudou = false;
    for (const p of d.perguntas) if (p.imagem === c.id[1]) { delete p.imagem; mudou = true; }
    if (mudou) db.prepare("UPDATE quizzes SET dados = ? WHERE id = ?").run(JSON.stringify(d), q.id);
    return { ok: true };
  });
  rota("GET", "/api/quizzes/:id/resultados", (c) => {
    const q = meu(c.p, c.id[0]);
    return db.prepare("SELECT id, quando, jogadores, resumo FROM quiz_resultados WHERE quiz_id = ? ORDER BY id DESC LIMIT 30").all(q.id).map((r) => ({ id: r.id, quando: r.quando, jogadores: r.jogadores, ...JSON.parse(r.resumo) }));
  });
  // Modelos vindos do tic.techpro.pt: copiam-se para o docente, que os edita à vontade.
  rota("GET", "/api/quiz-modelos", () => modelos().map((f) => ({ id: f.replace(/\.json$/, ""), titulo: tituloModelo(f), perguntas: JSON.parse(fs.readFileSync(path.join(DIR_MODELOS, f), "utf8")).length })));
  rota("POST", "/api/quizzes/de-modelo", (c) => {
    const f = String(c.b.modelo || "") + ".json";
    if (!/^[a-z0-9-]+\.json$/.test(f) || !modelos().includes(f)) throw erro(404, "Modelo inexistente.");
    const perguntas = JSON.parse(fs.readFileSync(path.join(DIR_MODELOS, f), "utf8"));
    const dados = validar({ intro: "", tempo: 20, perguntas });
    return { id: Number(db.prepare("INSERT INTO quizzes (prof_id, titulo, dados) VALUES (?, ?, ?)").run(c.p.id, tituloModelo(f).replace(/^./, (x) => x.toUpperCase()), JSON.stringify(dados)).lastInsertRowid) };
  });

  // ---------- jogo ao vivo (lado do docente) ----------
  const minha = (c, pin) => { const s = VIVO.da(pin); if (!s || s.profId !== c.p.id) throw erro(404, "Esta sessão já não existe."); return s; };
  rota("POST", "/api/quizzes/:id/vivo", (c) => {
    const q = meu(c.p, c.id[0]);
    if (VIVO.doProf(c.p.id).length >= 5) throw erro(409, "Tens demasiadas sessões abertas: fecha algumas.");
    const s = VIVO.criar({ profId: c.p.id, quizId: q.id, titulo: q.titulo, conteudo: JSON.parse(q.dados) });
    est.contar(c.p.id, "jogo_sessao");
    return { pin: s.pin };
  });
  rota("GET", "/api/vivo", (c) => VIVO.doProf(c.p.id).map((s) => ({ pin: s.pin, titulo: s.titulo, fase: s.fase, jogadores: s.jogadores.size })));
  // `v`: revisão que o cliente já tem; se não mudou, responde só { mudou: false } (poupa dados e tempo).
  rota("GET", "/api/vivo/:pin", (c, u) => {
    const s = minha(c, String(c.id[0]));
    const v = inteiro(u.searchParams.get("v"));
    const vista = VIVO.vistaProf(s);
    return v === s.revisao && s.fase !== "pergunta" ? { mudou: false, revisao: s.revisao } : vista;
  });
  rota("POST", "/api/vivo/:pin/acao", (c) => {
    const s = minha(c, String(c.id[0]));
    if (c.b.acao === "fechar") { VIVO.fechar(s.pin); return { fechada: true }; }
    VIVO.acao(s, String(c.b.acao || ""));
    return VIVO.vistaProf(s);
  });
};
