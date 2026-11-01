"use strict";
// Autenticação por Microsoft Entra ID (OpenID Connect, código de autorização com PKCE).
// A palavra-passe nunca passa por este servidor. A sessão é um cookie assinado (HMAC-SHA256).
const crypto = require("node:crypto");

const b64u = (b) => Buffer.from(b).toString("base64url");
const deB64u = (s) => Buffer.from(s, "base64url");

module.exports = function criarAuth(cfg) {
  const { tenant, clientId, clientSecret, baseUrl, issuerBase, segredo, sessaoHoras, prompt } = cfg;
  const seguro = baseUrl.startsWith("https://");
  const redirect = baseUrl.replace(/\/$/, "") + "/auth/callback";
  const configurado = !!(tenant && clientId && clientSecret);

  // ---------- cookies e assinatura ----------
  function assinar(obj) {
    const p = b64u(JSON.stringify(obj));
    const s = crypto.createHmac("sha256", segredo).update(p).digest("base64url");
    return p + "." + s;
  }
  function verificar(txt) {
    if (typeof txt !== "string") return null;
    const [p, s] = txt.split(".");
    if (!p || !s) return null;
    const esperado = crypto.createHmac("sha256", segredo).update(p).digest();
    let dado;
    try { dado = deB64u(s); } catch { return null; }
    if (dado.length !== esperado.length || !crypto.timingSafeEqual(dado, esperado)) return null;
    try {
      const o = JSON.parse(deB64u(p).toString("utf8"));
      return o && o.exp > Date.now() ? o : null;
    } catch { return null; }
  }
  function cookies(req) {
    const r = {};
    for (const par of (req.headers.cookie || "").split(";")) {
      const i = par.indexOf("=");
      if (i > 0) r[par.slice(0, i).trim()] = par.slice(i + 1).trim();
    }
    return r;
  }
  function defCookie(res, nome, valor, { maxAge, path = "/" } = {}) {
    const partes = [`${nome}=${valor}`, `Path=${path}`, "HttpOnly", "SameSite=Lax"];
    if (maxAge != null) partes.push(`Max-Age=${maxAge}`);
    if (seguro) partes.push("Secure");
    const antigos = res.getHeader("Set-Cookie") || [];
    res.setHeader("Set-Cookie", [].concat(antigos, partes.join("; ")));
  }

  // ---------- sessão ----------
  function criarSessao(res, user, nome) {
    const exp = Date.now() + sessaoHoras * 3600000;
    defCookie(res, "sid", assinar({ u: user, n: nome, exp }), { maxAge: sessaoHoras * 3600 });
  }
  function sessao(req) {
    const o = verificar(cookies(req).sid);
    return o && o.u ? { user: o.u, nome: o.n || o.u } : null;
  }
  function terminar(res) { defCookie(res, "sid", "", { maxAge: 0 }); }

  // ---------- descoberta e chaves públicas ----------
  let disc = null, discTs = 0;
  async function descoberta() {
    if (disc && Date.now() - discTs < 3600000) return disc;
    const r = await fetch(`${issuerBase}/${tenant}/v2.0/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error("Não foi possível contactar o Microsoft Entra ID.");
    disc = await r.json();
    discTs = Date.now();
    return disc;
  }
  let chaves = new Map(), chavesTs = 0;
  async function chave(kid) {
    if (chaves.has(kid) && Date.now() - chavesTs < 3600000) return chaves.get(kid);
    const d = await descoberta();
    const r = await fetch(d.jwks_uri, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error("Não foi possível obter as chaves do Microsoft Entra ID.");
    const { keys } = await r.json();
    chaves = new Map();
    for (const k of keys || []) if (k.kid && k.kty === "RSA") chaves.set(k.kid, crypto.createPublicKey({ key: k, format: "jwk" }));
    chavesTs = Date.now();
    if (!chaves.has(kid)) throw new Error("Chave de assinatura desconhecida.");
    return chaves.get(kid);
  }

  async function validarIdToken(tok, nonce) {
    const partes = String(tok).split(".");
    if (partes.length !== 3) throw new Error("id_token inválido.");
    const cab = JSON.parse(deB64u(partes[0]).toString("utf8"));
    if (cab.alg !== "RS256") throw new Error("Algoritmo não aceite.");
    const k = await chave(cab.kid);
    const ok = crypto.verify("RSA-SHA256", Buffer.from(partes[0] + "." + partes[1]), k, deB64u(partes[2]));
    if (!ok) throw new Error("Assinatura inválida.");
    const c = JSON.parse(deB64u(partes[1]).toString("utf8"));
    const d = await descoberta();
    const agora = Math.floor(Date.now() / 1000);
    if (c.iss !== d.issuer) throw new Error("Emissor inesperado.");
    if (c.aud !== clientId) throw new Error("Destinatário inesperado.");
    if (!(c.exp > agora - 60)) throw new Error("Token expirado.");
    if (c.nbf && c.nbf > agora + 120) throw new Error("Token ainda não válido.");
    if (c.nonce !== nonce) throw new Error("Nonce inválido.");
    if (/^[0-9a-f-]{36}$/i.test(tenant) && c.tid !== tenant) throw new Error("Organização inesperada.");
    return c;
  }

  // ---------- fluxo de entrada ----------
  async function iniciar(res) {
    if (!configurado) throw Object.assign(new Error("Entrada não configurada (faltam TENANT_ID, CLIENT_ID ou CLIENT_SECRET)."), { publico: true });
    const d = await descoberta();
    const state = crypto.randomBytes(16).toString("base64url");
    const nonce = crypto.randomBytes(16).toString("base64url");
    const verif = crypto.randomBytes(32).toString("base64url");
    const desafio = crypto.createHash("sha256").update(verif).digest("base64url");
    defCookie(res, "oidc", assinar({ s: state, n: nonce, v: verif, exp: Date.now() + 600000 }), { maxAge: 600, path: "/auth" });
    const q = new URLSearchParams({
      client_id: clientId, response_type: "code", redirect_uri: redirect, response_mode: "query",
      scope: "openid profile email User.Read", state, nonce, code_challenge: desafio, code_challenge_method: "S256",
    });
    // Em computadores partilhados, evita entrar sozinho com a conta do aluno anterior.
    if (prompt) q.set("prompt", prompt);
    return `${d.authorization_endpoint}?${q}`;
  }

  async function concluir(req, res, u) {
    const ck = verificar(cookies(req).oidc);
    defCookie(res, "oidc", "", { maxAge: 0, path: "/auth" });
    if (u.searchParams.get("error")) throw Object.assign(new Error("A Microsoft recusou a entrada: " + (u.searchParams.get("error_description") || u.searchParams.get("error")).slice(0, 200)), { publico: true });
    const state = u.searchParams.get("state") || "";
    const code = u.searchParams.get("code") || "";
    if (!ck || !code || state.length !== ck.s.length || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(ck.s))) {
      throw Object.assign(new Error("O pedido de entrada expirou. Tenta outra vez."), { publico: true });
    }
    const d = await descoberta();
    const r = await fetch(d.token_endpoint, {
      method: "POST", signal: AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", code, redirect_uri: redirect, code_verifier: ck.v }),
    });
    const tk = await r.json().catch(() => ({}));
    if (!r.ok || !tk.id_token) throw Object.assign(new Error("A troca do código falhou."), { detalhe: tk.error_description || tk.error });
    const c = await validarIdToken(tk.id_token, ck.n);
    const upn = String(c.preferred_username || c.upn || c.email || "").trim().toLowerCase();
    if (!/^[a-z0-9._'+-]+@[a-z0-9.-]+$/.test(upn)) throw Object.assign(new Error("Conta sem nome de utilizador válido."), { publico: true });
    return { upn, user: upn.split("@")[0], dominio: upn.split("@")[1], nome: String(c.name || upn).slice(0, 120), accessToken: tk.access_token };
  }

  return { configurado, iniciar, concluir, criarSessao, sessao, terminar, cookies, defCookie };
};
