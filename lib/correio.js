"use strict";
// Envio de email pelo Microsoft Graph (/me/sendMail) com a conta de um administrador que liga o envio uma vez.
// Guarda só o token de renovação, cifrado (AES-256-GCM) com uma chave derivada do segredo do servidor.
// Uso principal: avisar os administradores antes de o segredo da aplicação do Entra expirar.
const crypto = require("node:crypto");

const LIMIARES = [60, 30, 14, 7, 3, 1];
const SCOPE = "offline_access Mail.Send";
const dataPt = (iso) => iso.split("-").reverse().join("/");

module.exports = function criarCorreio({ db, auth, segredo, graphUrl, env, baseUrl, fetchFn = fetch, agora = () => Date.now() }) {
  const chave = crypto.createHash("sha256").update("correio:" + segredo).digest();
  const cifrar = (t) => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", chave, iv); const d = Buffer.concat([c.update(t, "utf8"), c.final()]); return [iv, c.getAuthTag(), d].map((b) => b.toString("base64url")).join("."); };
  const decifrar = (t) => { const [iv, tag, d] = String(t).split(".").map((x) => Buffer.from(x, "base64url")); const c = crypto.createDecipheriv("aes-256-gcm", chave, iv); c.setAuthTag(tag); return Buffer.concat([c.update(d), c.final()]).toString("utf8"); };
  const ler = (k) => { const r = db.prepare("SELECT valor FROM config WHERE chave = ?").get(k); try { return r ? JSON.parse(r.valor) : null; } catch { return null; } };
  const gravar = (k, v) => db.prepare("INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor").run(k, JSON.stringify(v));
  const apagar = (k) => db.prepare("DELETE FROM config WHERE chave = ?").run(k);

  const ligar = ({ conta, nome, refresh, por }) => { gravar("correio", { conta, nome, rt: cifrar(refresh), por, desde: new Date(agora()).toISOString(), erro: null }); };
  const desligar = () => { apagar("correio"); };

  function diasAte() {
    const d = String(env.CLIENT_SECRET_EXPIRA || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    return { expira: d, dias: Math.ceil((Date.parse(d + "T23:59:59Z") - agora()) / 86400000) };
  }

  function estado() {
    const c = ler("correio"), av = ler("correio_avisos") || {}, e = diasAte();
    return {
      ligado: !!c, conta: c ? c.conta : null, desde: c ? c.desde : null, erro: c ? c.erro : null, ultimoEnvio: c ? c.ultimo || null : null,
      expira: e ? e.expira : null, dias: e ? e.dias : null, avisosEnviados: av.expira === (e && e.expira) ? av.enviados || [] : [], limiares: LIMIARES,
    };
  }

  async function enviar(para, assunto, texto) {
    const c = ler("correio");
    if (!c) throw Object.assign(new Error("O envio de email ainda não está ligado."), { codigo: 409 });
    const dest = [...new Set(para.map((x) => String(x).trim().toLowerCase()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)))];
    if (!dest.length) throw Object.assign(new Error("Não há destinatários com email válido."), { codigo: 400 });
    try {
      const t = await auth.renovar(decifrar(c.rt), SCOPE);
      if (t.refresh_token) gravar("correio", { ...c, rt: cifrar(t.refresh_token) });
      const r = await fetchFn(`${graphUrl}/me/sendMail`, {
        method: "POST", signal: AbortSignal.timeout(15000), headers: { Authorization: "Bearer " + t.access_token, "Content-Type": "application/json" },
        body: JSON.stringify({ message: { subject: assunto, body: { contentType: "Text", content: texto }, toRecipients: dest.map((address) => ({ emailAddress: { address } })) }, saveToSentItems: false }),
      });
      if (r.status !== 202 && r.status !== 200) { const j = await r.json().catch(() => ({})); throw new Error((j.error && j.error.message) || "O Microsoft Graph recusou o envio (código " + r.status + ").") }
      gravar("correio", { ...(ler("correio")), erro: null, ultimo: new Date(agora()).toISOString() });
      return dest.length;
    } catch (e) {
      gravar("correio", { ...(ler("correio") || c), erro: String(e.message).slice(0, 300) });
      throw e;
    }
  }

  const destinatarios = () => {
    const c = ler("correio");
    const admins = db.prepare("SELECT upn FROM professores WHERE admin = 1 AND ativo = 1 AND local = 0").all().map((r) => r.upn);
    return [...admins, ...(c ? [c.conta] : [])];
  };

  function textoAviso(e) {
    const quando = e.dias <= 0 ? "expira hoje" : e.dias === 1 ? "expira amanhã" : `expira daqui a ${e.dias} dias`;
    return {
      assunto: `Avaliar Eça: o segredo do Microsoft Entra ${quando} (${dataPt(e.expira)})`,
      texto: `Olá,\n\nO segredo de cliente da aplicação Avaliar Eça no Microsoft Entra ID ${quando}, a ${dataPt(e.expira)}. Depois dessa data ninguém consegue entrar com a conta Office. As contas locais continuam a funcionar.\n\nPara renovar (demora uns minutos):\n1. Em entra.microsoft.com, vai a Registos de aplicações, abre a aplicação do Avaliar Eça, Certificados e segredos, Novo segredo de cliente.\n2. Copia a coluna Valor (não o ID do segredo) logo que for criado, porque depois já não se mostra.\n3. No servidor, edita o ficheiro .env: troca CLIENT_SECRET pelo valor novo e CLIENT_SECRET_EXPIRA pela nova data (aaaa-mm-dd).\n4. Aplica com: docker compose -f docker-compose.unraid.yml up -d\n\nEndereço da plataforma: ${baseUrl}\n\nEsta mensagem foi enviada automaticamente pelo eink. Deixa de ser enviada quando a data de CLIENT_SECRET_EXPIRA mudar.`,
    };
  }

  // Chamada todos os dias: envia o aviso do menor limiar já atingido que ainda não foi enviado.
  async function verificar() {
    const e = diasAte();
    if (!e) return { enviado: false, motivo: "CLIENT_SECRET_EXPIRA não está definido." };
    if (!ler("correio")) return { enviado: false, motivo: "O envio de email não está ligado." };
    let av = ler("correio_avisos");
    if (!av || av.expira !== e.expira) av = { expira: e.expira, enviados: [] };
    const atingidos = LIMIARES.filter((l) => e.dias <= l);
    if (!atingidos.length) { gravar("correio_avisos", av); return { enviado: false, motivo: "Ainda falta mais de " + LIMIARES[0] + " dias." }; }
    const pendentes = atingidos.filter((l) => !av.enviados.includes(l));
    if (!pendentes.length || e.dias < 0) return { enviado: false, motivo: "Já foi avisado." };
    const m = textoAviso(e);
    const n = await enviar(destinatarios(), m.assunto, m.texto);
    av.enviados = [...new Set([...av.enviados, ...atingidos])]; gravar("correio_avisos", av);
    return { enviado: true, limiar: Math.min(...pendentes), destinatarios: n };
  }

  return { ligar, desligar, estado, enviar, verificar, destinatarios, LIMIARES };
};
