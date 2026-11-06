"use strict";
// Lista dos docentes da escola (nome e email institucional), importada pelo administrador (Excel, CSV ou texto colado, por exemplo os membros do grupo
// «Todos os Docentes» do Entra). Serve só para sugerir colegas que ainda não entraram na plataforma quando se envia um modelo de grelha.
const { lerXlsx, paraTexto } = require("./xlsx-ler");
const { semGrupo } = require("./grupo");

module.exports = function registar(X) {
  const { rota, db, erro, soAdmin, dominios = [], graph = null } = X;
  const LIMITE = 3000;
  const norm = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const REGEX_EMAIL = /[^\s<>;,"']+@[^\s<>;,"']+\.[^\s<>;,"']+/;
  const ehEmail = (c) => REGEX_EMAIL.test(String(c)) && !/\s/.test(String(c).trim().replace(/^.*</, "").replace(/>.*$/, ""));
  // Divide uma linha CSV respeitando aspas.
  const partir = (linha, d) => {
    if (d !== ",") return linha.split(d);
    const r = []; let c = "", asp = false;
    for (const ch of linha) { if (ch === '"') asp = !asp; else if (ch === "," && !asp) { r.push(c); c = ""; } else c += ch; }
    r.push(c); return r;
  };
  const nomeDeEmail = (e) => e.split("@")[0].split(/[._-]+/).filter(Boolean).map((x) => x[0].toUpperCase() + x.slice(1)).join(" ");

  // Lê o texto: com cabeçalho (displayName, userPrincipalName, mail, Nome, Email...) ou sem ele (procura o email em cada linha).
  function ler(txt) {
    const linhas = String(txt || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
    const r = { linhas: linhas.length, validos: [], ignorados: 0 };
    if (!linhas.length) return r;
    const d = linhas.some((l) => l.includes("\t")) ? "\t" : linhas.some((l) => l.includes(";")) ? ";" : /^[^<]*,/.test(linhas[0]) && !/<[^>]+@/.test(linhas[0]) ? "," : null;
    let col = null, ini = 0;
    if (d) {
      const cab = partir(linhas[0], d).map((c) => norm(c).replace(/["\s_-]/g, ""));
      if (!cab.some(ehEmail)) {
        const acha = (res) => { for (const re of res) { const i = cab.findIndex((c) => re.test(c)); if (i >= 0) return i; } return -1; };
        col = { email: acha([/^userprincipalname$/, /^upn$/, /^e?mail$/, /^email/, /^endereco/]), nome: acha([/^displayname$/, /^nomecompleto$/, /^nome$/, /^name$/, /^utilizador$/]) };
        ini = 1;
      }
    }
    const vistos = new Set();
    for (const l of linhas.slice(ini)) {
      const cels = d ? partir(l, d).map((c) => c.trim().replace(/^"|"$/g, "")) : [l.trim()];
      let email = col && col.email >= 0 ? cels[col.email] : (cels.find((c) => REGEX_EMAIL.test(c)) || "");
      const m = REGEX_EMAIL.exec(email || ""); email = m ? m[0].toLowerCase() : "";
      let nome = col && col.nome >= 0 ? cels[col.nome] : cels.find((c) => c && !REGEX_EMAIL.test(c) && /[A-Za-zÀ-ÿ]/.test(c)) || (d ? "" : l.replace(REGEX_EMAIL, "").replace(/[<>()"]/g, ""));
      nome = semGrupo(String(nome || "").replace(/\s+/g, " ").trim()).slice(0, 120);
      if (!email || email.includes("#ext#") || (dominios.length && !dominios.includes(email.split("@")[1]))) { r.ignorados++; continue; }
      if (vistos.has(email)) continue; vistos.add(email);
      r.validos.push({ upn: email, nome: nome || nomeDeEmail(email) });
    }
    return r;
  }

  // Sincronização com o Entra (como no helpdesk): token da aplicação (client credentials) e leitura dos utilizadores. Precisa da permissão de
  // aplicação User.Read.All com consentimento do administrador, uma só vez. Com GRUPO_DOCENTES_ID lê só os membros desse grupo.
  const estadoSinc = { em: 0, n: 0, erro: "" };
  const disponivel = () => !!(graph && graph.tenant && graph.clientId && graph.clientSecret);
  async function sincronizar() {
    if (!disponivel()) throw erro(400, "A ligação ao Entra não está configurada (faltam TENANT_ID, CLIENT_ID ou CLIENT_SECRET).");
    const f = graph.fetchFn || fetch;
    try {
      const rt = await f(`${graph.loginBase}/${graph.tenant}/oauth2/v2.0/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: graph.clientId, client_secret: graph.clientSecret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }), signal: AbortSignal.timeout(15000) });
      const tj = await rt.json().catch(() => ({}));
      if (!rt.ok || !tj.access_token) throw new Error("O Entra não deu o acesso (" + (tj.error_description || tj.error || rt.status) + ").");
      const campos = "$select=displayName,userPrincipalName,mail,accountEnabled&$top=999";
      let url = graph.grupoId ? `${graph.url}/groups/${graph.grupoId}/transitiveMembers/microsoft.graph.user?${campos}` : `${graph.url}/users?$filter=accountEnabled eq true&${campos}`;
      const linhas = [];
      for (let i = 0; url && i < 40; i++) {
        const r = await f(url, { headers: { authorization: "Bearer " + tj.access_token }, signal: AbortSignal.timeout(20000) });
        const j = await r.json().catch(() => ({}));
        if (r.status === 403) throw new Error("Falta a permissão de aplicação User.Read.All com consentimento do administrador (Entra, Permissões de API).");
        if (!r.ok) throw new Error("O Graph respondeu " + r.status + ".");
        for (const u of j.value || []) if (u.accountEnabled !== false) linhas.push(`${u.displayName || ""}\t${u.userPrincipalName || u.mail || ""}`);
        url = j["@odata.nextLink"] || null;
      }
      const r = ler(linhas.join("\n"));
      if (!r.validos.length) throw new Error("O Entra não devolveu nenhum utilizador do domínio da escola.");
      if (r.validos.length > LIMITE) throw new Error(`O Entra devolveu ${r.validos.length} utilizadores: o máximo são ${LIMITE}. Define GRUPO_DOCENTES_ID para limitar aos docentes.`);
      db.exec("BEGIN");
      try {
        db.prepare("DELETE FROM docentes_dir").run();
        const ins = db.prepare("INSERT INTO docentes_dir (upn, nome) VALUES (?, ?) ON CONFLICT (upn) DO UPDATE SET nome = excluded.nome");
        for (const x of r.validos) ins.run(x.upn, x.nome);
        db.exec("COMMIT");
      } catch (e) { db.exec("ROLLBACK"); throw e; }
      Object.assign(estadoSinc, { em: Date.now(), n: r.validos.length, erro: "" });
      return { total: r.validos.length };
    } catch (e) { estadoSinc.erro = e.message; throw e.publico || e.estado ? e : erro(502, e.message); }
  }
  if (graph && graph.auto && disponivel()) {
    const volta = () => sincronizar().catch((e) => console.error("Diretório do Entra:", e.message));
    setTimeout(volta, 20000).unref(); setInterval(volta, 12 * 3600 * 1000).unref();
  }
  rota("POST", "/api/admin/diretorio/sincronizar", async (c) => { soAdmin(c); return sincronizar(); });

  rota("GET", "/api/admin/diretorio", (c) => {
    soAdmin(c);
    return { entra: { disponivel: disponivel(), grupo: !!(graph && graph.grupoId), ...estadoSinc }, total: db.prepare("SELECT COUNT(*) AS n FROM docentes_dir").get().n, exemplos: db.prepare("SELECT nome, upn FROM docentes_dir ORDER BY nome LIMIT 5").all(), dominios };
  });
  // Sem `aplicar` mostra só o que encontrou; com `aplicar: true` grava (junta aos que já existem; `substituir: true` começa de novo).
  rota("POST", "/api/admin/diretorio/importar", (c) => {
    soAdmin(c);
    let txt = String(c.b.texto || "");
    if (c.b.base64) {
      const buf = Buffer.from(String(c.b.base64), "base64");
      if (buf.length > 3000000) throw erro(413, "O ficheiro é demasiado grande (máximo 3 MB).");
      if (buf[0] === 0x50 && buf[1] === 0x4b) { try { txt = paraTexto(lerXlsx(buf)); } catch (e) { throw erro(400, e.publico ? e.message : "Não consegui ler o ficheiro Excel."); } }
      else txt = buf.toString("utf8");
    }
    if (!txt.trim()) throw erro(400, "Cola a lista ou escolhe um ficheiro (Excel ou CSV).");
    const r = ler(txt);
    if (!r.validos.length) throw erro(400, `Não encontrei nenhum email da escola${dominios.length ? " (" + dominios.join(", ") + ")" : ""}. Confirma que a lista tem uma coluna com o email institucional.`);
    if (r.validos.length > LIMITE) throw erro(400, `A lista tem ${r.validos.length} docentes: o máximo são ${LIMITE}.`);
    const saida = { encontrados: r.validos.length, ignorados: r.ignorados, exemplos: r.validos.slice(0, 5) };
    if (c.b.aplicar !== true) return saida;
    if (c.b.substituir === true) db.prepare("DELETE FROM docentes_dir").run();
    const ins = db.prepare("INSERT INTO docentes_dir (upn, nome) VALUES (?, ?) ON CONFLICT (upn) DO UPDATE SET nome = excluded.nome");
    for (const x of r.validos) ins.run(x.upn, x.nome);
    return { ...saida, gravados: r.validos.length, total: db.prepare("SELECT COUNT(*) AS n FROM docentes_dir").get().n };
  });
  rota("POST", "/api/admin/diretorio/apagar", (c) => {
    soAdmin(c);
    if (c.b.confirmar !== true) throw erro(400, "Confirma que queres apagar a lista de docentes.");
    return { apagados: db.prepare("DELETE FROM docentes_dir").run().changes };
  });
  return { ler };
};
