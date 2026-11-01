"use strict";
// Pertença a um grupo do Microsoft Entra ID, verificada no Microsoft Graph com o token do próprio utilizador (permissão User.Read),
// como no helpdesk-escolar: GET /me/memberOf/{id do grupo} dá 200 se pertence e 404 se não pertence.
// Só conta a pertença direta ao grupo. Se os docentes estiverem em subgrupos, põe o grupo principal a conter os outros como membros diretos
// ou diz-me para passar a /me/transitiveMemberOf.
async function ehMembro(accessToken, grupoId, { graphUrl = "https://graph.microsoft.com/v1.0" } = {}) {
  if (!accessToken || !grupoId) return false;
  if (!/^[0-9a-f-]{36}$/i.test(grupoId)) throw new Error("O ID do grupo não é um GUID válido.");
  const r = await fetch(`${graphUrl}/me/memberOf/${grupoId}`, { headers: { Authorization: "Bearer " + accessToken }, signal: AbortSignal.timeout(10000) });
  if (r.status === 200) return true;
  if (r.status === 404) return false;
  throw Object.assign(new Error("Não foi possível verificar o grupo no Microsoft Graph (código " + r.status + ")."), { publico: true });
}
module.exports = { ehMembro };
