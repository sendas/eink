"use strict";
// Sugestões dos docentes: qualquer docente envia, os administradores leem e marcam o estado.
module.exports = function registar(X) {
  const { rota, db, erro, inteiro, existe, soAdmin } = X;
  const ESTADOS = ["nova", "lida", "feita"];
  const limpar = (v, max) => String(v ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);

  rota("POST", "/api/sugestoes", (c) => {
    const texto = limpar(c.b.texto, 1500), pagina = limpar(c.b.pagina, 80).replace(/\n/g, " ");
    if (texto.length < 5) throw erro(400, "Escreve pelo menos uma frase com a tua sugestão.");
    const hoje = db.prepare("SELECT COUNT(*) AS n FROM sugestoes WHERE prof_id = ? AND criada > datetime('now', '-1 day')").get(c.p.id).n;
    if (hoje >= 20) throw erro(429, "Já enviaste muitas sugestões hoje. Volta a tentar amanhã.");
    db.prepare("INSERT INTO sugestoes (prof_id, texto, pagina) VALUES (?, ?, ?)").run(c.p.id, texto, pagina);
    return { ok: true };
  });
  // As minhas sugestões e o estado de cada uma.
  rota("GET", "/api/sugestoes", (c) => db.prepare("SELECT id, texto, estado, criada FROM sugestoes WHERE prof_id = ? ORDER BY id DESC LIMIT 20").all(c.p.id));

  rota("GET", "/api/admin/sugestoes", (c) => {
    soAdmin(c);
    return db.prepare("SELECT s.id, s.texto, s.pagina, s.estado, s.criada, p.nome, p.upn FROM sugestoes s JOIN professores p ON p.id = s.prof_id ORDER BY (s.estado = 'nova') DESC, s.id DESC LIMIT 500").all();
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
