"use strict";
// Sugestões dos docentes: qualquer docente envia, os administradores leem e marcam o estado.
module.exports = function registar(X) {
  const { rota, db, erro, inteiro, existe, soAdmin, correio, baseUrl } = X;
  const ESTADOS = ["nova", "lida", "feita"];
  const EMAIL_PADRAO = "pedropereira@queiroz.pt";
  const cfgLer = (k, def) => { const r = db.prepare("SELECT valor FROM config WHERE chave = ?").get(k); return r ? r.valor : def; };
  const emailDestino = () => cfgLer("sugestoes_email", EMAIL_PADRAO).trim();
  const emailValido = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) && v.length <= 120;
  const limpar = (v, max) => String(v ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);

  rota("POST", "/api/sugestoes", (c) => {
    const texto = limpar(c.b.texto, 1500), pagina = limpar(c.b.pagina, 80).replace(/\n/g, " ");
    if (texto.length < 5) throw erro(400, "Escreve pelo menos uma frase com a tua sugestão.");
    const hoje = db.prepare("SELECT COUNT(*) AS n FROM sugestoes WHERE prof_id = ? AND criada > datetime('now', '-1 day')").get(c.p.id).n;
    if (hoje >= 20) throw erro(429, "Já enviaste muitas sugestões hoje. Volta a tentar amanhã.");
    const id = Number(db.prepare("INSERT INTO sugestoes (prof_id, texto, pagina) VALUES (?, ?, ?)").run(c.p.id, texto, pagina).lastInsertRowid);
    // Aviso por email aos responsáveis; se falhar (por exemplo, o envio ainda não está ligado), a sugestão fica na mesma e o estado diz porquê.
    const para = emailDestino();
    const marca = (e) => db.prepare("UPDATE sugestoes SET email = ? WHERE id = ?").run(e, id);
    if (!para) marca("sem destinatário");
    else if (!correio) marca("envio de email não disponível");
    else {
      const corpo = `Nova sugestão no Eça Avalia\n\nDe: ${c.p.nome || c.p.upn} (${c.p.upn})\nPágina: ${pagina || "-"}\n\n${texto}\n\nVer e gerir: ${baseUrl || ""}/#/sugestoes`;
      correio.enviar([para], "Eça Avalia: nova sugestão de " + (c.p.nome || c.p.upn), corpo)
        .then(() => marca("enviado a " + para)).catch((e) => marca("falhou: " + String(e.message).slice(0, 120)));
    }
    return { ok: true };
  });
  // As minhas sugestões e o estado de cada uma.
  rota("GET", "/api/sugestoes", (c) => db.prepare("SELECT id, texto, estado, criada FROM sugestoes WHERE prof_id = ? ORDER BY id DESC LIMIT 20").all(c.p.id));

  rota("GET", "/api/admin/sugestoes", (c) => {
    soAdmin(c);
    return db.prepare("SELECT s.id, s.texto, s.pagina, s.estado, s.criada, s.email, p.nome, p.upn FROM sugestoes s JOIN professores p ON p.id = s.prof_id ORDER BY (s.estado = 'nova') DESC, s.id DESC LIMIT 500").all();
  });
  rota("GET", "/api/admin/sugestoes/config", (c) => { soAdmin(c); return { email: emailDestino(), padrao: EMAIL_PADRAO, correioLigado: !!(correio && correio.estado().ligado) }; });
  rota("PUT", "/api/admin/sugestoes/config", (c) => {
    soAdmin(c);
    const e = String(c.b.email ?? "").trim().toLowerCase();
    if (e && !emailValido(e)) throw erro(400, "Escreve um email válido, por exemplo nome@queiroz.pt. Deixa vazio para não enviar avisos.");
    db.prepare("INSERT INTO config (chave, valor) VALUES ('sugestoes_email', ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor").run(e);
    return { email: emailDestino() };
  });
  rota("PUT", "/api/admin/sugestoes/:id", (c) => {
    soAdmin(c);
    if (!ESTADOS.includes(c.b.estado)) throw erro(400, "Estado inválido.");
    existe(db.prepare("SELECT id FROM sugestoes WHERE id = ?").get(c.id[0]), "Sugestão inexistente.");
    db.prepare("UPDATE sugestoes SET estado = ? WHERE id = ?").run(c.b.estado, c.id[0]);
    return { ok: true };
  });
  rota("DELETE", "/api/admin/sugestoes/:id", (c) => {
    soAdmin(c);
    existe(db.prepare("SELECT id FROM sugestoes WHERE id = ?").get(c.id[0]), "Sugestão inexistente.");
    db.prepare("DELETE FROM sugestoes WHERE id = ?").run(c.id[0]);
    return { ok: true };
  });
  return { novas: () => db.prepare("SELECT COUNT(*) AS n FROM sugestoes WHERE estado = 'nova'").get().n };
};
