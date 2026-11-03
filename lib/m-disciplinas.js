"use strict";
// Disciplinas que cada docente leciona (escolhidas por ciclo e disciplina) e documentos PDF dos critérios de cada grupo.
module.exports = function registar(X) {
  const { rota, db, erro, inteiro, existe, soAdmin } = X;

  // Todas as disciplinas, com os anos em que têm critérios e se o docente já as escolheu.
  rota("GET", "/api/disciplinas", (c) => {
    const mias = new Set(db.prepare("SELECT grupo_id FROM prof_disciplinas WHERE prof_id = ?").all(c.p.id).map((r) => r.grupo_id));
    return db.prepare("SELECT id, nome, profissional FROM grupos ORDER BY nome").all().map((g) => ({
      id: g.id, nome: g.nome, profissional: !!g.profissional, escolhida: mias.has(g.id),
      anos: db.prepare("SELECT ano FROM esquemas WHERE grupo_id = ? AND ano > 0 ORDER BY ano").all(g.id).map((r) => r.ano),
      documentos: db.prepare("SELECT COUNT(*) AS n FROM documentos WHERE grupo_id = ?").get(g.id).n,
    }));
  });
  // Substitui as disciplinas do docente.
  rota("PUT", "/api/eu/disciplinas", (c) => {
    const ids = Array.isArray(c.b.ids) ? [...new Set(c.b.ids.map(inteiro).filter((x) => x !== null))] : null;
    if (!ids || ids.length > 30) throw erro(400, "Escolhe até 30 disciplinas.");
    for (const id of ids) if (!db.prepare("SELECT 1 FROM grupos WHERE id = ?").get(id)) throw erro(400, "Disciplina inexistente.");
    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM prof_disciplinas WHERE prof_id = ?").run(c.p.id);
      for (const id of ids) db.prepare("INSERT INTO prof_disciplinas (prof_id, grupo_id) VALUES (?, ?)").run(c.p.id, id);
      // A primeira escolha passa a ser a disciplina por defeito das turmas novas.
      db.prepare("UPDATE professores SET grupo_id = ? WHERE id = ?").run(ids[0] ?? null, c.p.id);
      db.exec("COMMIT");
    } catch (e) { db.exec("ROLLBACK"); throw e; }
    return { ok: true, ids };
  });

  rota("GET", "/api/documentos", (_c, u) => {
    const g = inteiro(u.searchParams.get("grupo"));
    if (g === null) throw erro(400, "Indica o grupo.");
    return db.prepare("SELECT id, titulo, nome, tamanho, criado FROM documentos WHERE grupo_id = ? ORDER BY criado DESC, id DESC").all(g);
  });
  rota("DELETE", "/api/admin/documentos/:id", (c) => {
    soAdmin(c); existe(db.prepare("SELECT 1 FROM documentos WHERE id = ?").get(c.id[0]));
    db.prepare("DELETE FROM documentos WHERE id = ?").run(c.id[0]);
    return { ok: true };
  });
};
