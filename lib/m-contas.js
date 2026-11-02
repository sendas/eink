"use strict";
// Gestão de contas dos docentes: contas Office (Entra) e contas locais com utilizador e palavra-passe.
const CONTAS = require("./contas");

module.exports = function registar(X) {
  const { rota, db, erro, texto, inteiro, existe, soAdmin } = X;

  // Cria uma conta local. A palavra-passe gerada só se vê esta vez e tem de ser mudada na primeira entrada.
  rota("POST", "/api/admin/professores/locais", async (c) => {
    soAdmin(c);
    const utilizador = texto(c.b.utilizador, 40).toLowerCase();
    if (!CONTAS.utilizadorValido(utilizador)) throw erro(400, "O utilizador deve ter 3 a 40 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado (por exemplo ana.silva).");
    const upn = utilizador + "@local";
    if (db.prepare("SELECT 1 FROM professores WHERE upn = ?").get(upn)) throw erro(409, "Já existe uma conta com esse utilizador. Escolhe outro.");
    const senha = CONTAS.gerarSenha();
    db.prepare("INSERT INTO professores (upn, nome, admin, local, senha, trocar) VALUES (?, ?, ?, 1, ?, 1)").run(upn, texto(c.b.nome, 120) || utilizador, c.b.admin === true ? 1 : 0, await CONTAS.criarHash(senha));
    return { upn, utilizador, senha };
  });
  rota("POST", "/api/admin/professores/:id/senha", async (c) => {
    soAdmin(c);
    const p = existe(db.prepare("SELECT id, upn, local FROM professores WHERE id = ?").get(c.id[0]));
    if (!p.local) throw erro(400, "Esta é uma conta Office: a palavra-passe é gerida pela Microsoft.");
    const senha = CONTAS.gerarSenha();
    db.prepare("UPDATE professores SET senha = ?, trocar = 1 WHERE id = ?").run(await CONTAS.criarHash(senha), p.id);
    return { upn: p.upn, utilizador: p.upn.split("@")[0], senha };
  });
  rota("POST", "/api/admin/professores/:id/reativar", (c) => {
    soAdmin(c);
    existe(db.prepare("SELECT 1 FROM professores WHERE id = ?").get(c.id[0]));
    db.prepare("UPDATE professores SET ativo = 1 WHERE id = ?").run(c.id[0]);
    return { ok: true };
  });
  rota("PUT", "/api/admin/professores/:id/admin", (c) => {
    soAdmin(c);
    if (c.id[0] === c.p.id) throw erro(400, "Não podes mudar o teu próprio papel.");
    existe(db.prepare("SELECT 1 FROM professores WHERE id = ?").get(c.id[0]));
    db.prepare("UPDATE professores SET admin = ? WHERE id = ?").run(c.b.admin === true ? 1 : 0, c.id[0]);
    return { ok: true };
  });

  // O próprio docente (conta local) muda a palavra-passe.
  rota("POST", "/api/eu/senha", async (c) => {
    if (!c.p.local) throw erro(400, "A palavra-passe da conta Office muda-se na conta Microsoft.");
    if (!(await CONTAS.conferir(String(c.b.atual || ""), c.p.senha))) throw erro(403, "A palavra-passe atual não está certa.");
    if (!CONTAS.senhaValida(c.b.nova)) throw erro(400, "A nova palavra-passe deve ter pelo menos 10 caracteres.");
    if (c.b.nova === c.b.atual) throw erro(400, "A nova palavra-passe tem de ser diferente da atual.");
    db.prepare("UPDATE professores SET senha = ?, trocar = 0 WHERE id = ?").run(await CONTAS.criarHash(c.b.nova), c.p.id);
    return { ok: true };
  });
};
