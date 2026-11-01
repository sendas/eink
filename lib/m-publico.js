"use strict";
// Páginas e pedidos sem sessão: os alunos votam numa sondagem (/s/CÓDIGO) e jogam um quiz (/j/PIN) sem conta, só com um código.
// Tudo o que é público é pequeno, limitado por IP e nunca expõe dados do docente nem dos alunos.
const crypto = require("node:crypto");
const VIVO = require("./vivo");
const palavroes = require("./palavroes");

module.exports = function criar(X) {
  const { db, json, corpo, auth, enviarFicheiro, limitar, ip, expirada, est } = X;
  const filtro = palavroes.criar([]);
  const bloqueado = (res, msg = "Muitos pedidos. Espera um pouco.") => json(res, 429, { erro: msg });
  const erroJson = (res, e) => json(res, e.codigo || 500, { erro: e.codigo && e.codigo < 500 ? e.message : "Erro interno." });

  return async function publico(req, res, u, p) {
    // ---- sondagem ----
    let m = /^\/s\/([A-Z2-9]{5})$/.exec(p);
    if (m && req.method === "GET") { est.contarPublico("sondagem_pagina"); return enviarFicheiro(res, "/sondagem.html") || true; }
    m = /^\/s\/api\/([A-Z2-9]{5})(\/votar)?$/.exec(p);
    if (m) {
      if (!limitar("s:" + ip(req), 120, 60000)) return bloqueado(res), true;
      const s = db.prepare("SELECT * FROM sondagens WHERE codigo = ?").get(m[1]);
      if (!s) return json(res, 404, { erro: "Esta sondagem não existe." }), true;
      const opcoes = JSON.parse(s.opcoes), aberta = !!s.aberta && !expirada(s), cookie = "sv_" + m[1];
      const jaVotou = auth.cookies(req)[cookie] === "1";
      if (req.method === "GET" && !m[2]) return json(res, 200, { pergunta: s.pergunta, opcoes, aberta, votou: jaVotou }), true;
      if (req.method === "POST" && m[2]) {
        try {
          const b = await corpo(req), k = Number.isInteger(b.opcao) ? b.opcao : -1;
          if (!aberta) return json(res, 409, { erro: "A sondagem já fechou." }), true;
          if (jaVotou) return json(res, 409, { erro: "Já votaste nesta sondagem." }), true;
          if (!limitar("v:" + ip(req), 40, 60000)) return bloqueado(res), true;
          if (!(k >= 0 && k < opcoes.length)) return json(res, 400, { erro: "Opção inválida." }), true;
          const votos = JSON.parse(s.votos);
          if (votos.reduce((z, x) => z + x, 0) >= 5000) return json(res, 409, { erro: "A sondagem está cheia." }), true;
          votos[k]++;
          db.prepare("UPDATE sondagens SET votos = ? WHERE id = ?").run(JSON.stringify(votos), s.id);
          auth.defCookie(res, cookie, "1", { maxAge: 86400, path: "/s" });
          est.contarPublico("sondagem_voto");
          return json(res, 200, { ok: true }), true;
        } catch (e) { return erroJson(res, e), true; }
      }
      return json(res, 405, { erro: "Método não permitido." }), true;
    }

    // ---- quiz ao vivo ----
    if ((p === "/jogar" || /^\/j\/\d{6}$/.test(p)) && req.method === "GET") { est.contarPublico("jogo_pagina"); return enviarFicheiro(res, "/jogar.html") || true; }
    m = /^\/j\/api\/(\d{6})(?:\/(entrar|responder))?$/.exec(p);
    if (m) {
      if (!limitar("j:" + ip(req), 600, 60000)) return bloqueado(res), true;
      const s = VIVO.da(m[1]);
      if (!s) return json(res, 404, { erro: "Este jogo não existe ou já terminou." }), true;
      const nomeCookie = "jg_" + m[1];
      let token = auth.cookies(req)[nomeCookie];
      if (!/^[0-9a-f]{32}$/.test(token || "")) token = "";
      try {
        if (req.method === "GET" && !m[2]) {
          const v = Number(u.searchParams.get("v"));
          const vista = VIVO.vistaAluno(s, token);
          return json(res, 200, v === s.revisao && s.fase !== "pergunta" && vista.entrou ? { mudou: false, revisao: s.revisao } : vista), true;
        }
        if (req.method !== "POST") return json(res, 405, { erro: "Método não permitido." }), true;
        const b = await corpo(req);
        if (m[2] === "entrar") {
          if (!token) { token = crypto.randomBytes(16).toString("hex"); auth.defCookie(res, nomeCookie, token, { maxAge: 14400, path: "/j" }); }
          const novo = !s.jogadores.has(token);
          VIVO.entrar(s, token, b.alcunha, filtro);
          if (novo) est.contarPublico("jogo_entrada");
          return json(res, 200, VIVO.vistaAluno(s, token)), true;
        }
        if (m[2] === "responder") {
          if (!token) return json(res, 400, { erro: "Entra primeiro no jogo." }), true;
          VIVO.responder(s, token, String(b.pergunta || ""), Number.isInteger(b.resposta) ? b.resposta : -1);
          return json(res, 200, VIVO.vistaAluno(s, token)), true;
        }
      } catch (e) { return erroJson(res, e), true; }
    }
    return false;
  };
};
