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
// Perfil do próprio utilizador no Graph (permissão User.Read): o departamento e o cargo costumam trazer o grupo de recrutamento.
async function perfil(accessToken, { graphUrl = "https://graph.microsoft.com/v1.0" } = {}) {
  if (!accessToken) return null;
  try {
    const r = await fetch(`${graphUrl}/me?$select=displayName,department,jobTitle`, { headers: { Authorization: "Bearer " + accessToken }, signal: AbortSignal.timeout(4000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
// Procura num texto o grupo de recrutamento («Docente-550 - Informática», «550 - Informática», «550 Informática»): código de 3 algarismos e nome.
const REGEX_GRUPO = [/(\d{3})\s*[-–:]\s*([^\d|;\n]+?)\s*$/, /(?:^|\s)(\d{3})\s+([A-Za-zÀ-ÿ][^\d|;\n]*?)\s*$/];
function grupoDeTexto(textos) {
  for (const t of textos.filter((x) => typeof x === "string" && x.trim())) for (const re of REGEX_GRUPO) {
    const m = re.exec(t.trim()); if (m && m[2].trim().length >= 3) return { codigo: m[1], nome: m[2].trim().replace(/\s+/g, " ").slice(0, 60) };
  }
  return null;
}
// O nome do docente sem o sufixo do grupo («Ana Silva Docente-550 - Informática» passa a «Ana Silva»).
const semGrupo = (nome) => String(nome || "").replace(/\s*(?:docente\s*[-–:]?\s*)?\d{3}\s*[-–:]\s*[^\d|;\n]+$/i, "").trim() || String(nome || "");
module.exports = { ehMembro, perfil, grupoDeTexto, semGrupo };
