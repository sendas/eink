'use strict';
// Pede ao Plex, ao Jellyfin e ao Emby que voltem a ler a biblioteca depois de uma arrumação.

function configurados(env = process.env) {
  const lista = [];
  const url = (v) => String(v).replace(/\/+$/, '');
  if (env.JELLYFIN_URL && env.JELLYFIN_CHAVE) {
    lista.push({ nome: 'Jellyfin', metodo: 'POST', url: `${url(env.JELLYFIN_URL)}/Library/Refresh`, cabecalhos: { 'X-Emby-Token': env.JELLYFIN_CHAVE } });
  }
  if (env.EMBY_URL && env.EMBY_CHAVE) {
    lista.push({ nome: 'Emby', metodo: 'POST', url: `${url(env.EMBY_URL)}/emby/Library/Refresh`, cabecalhos: { 'X-Emby-Token': env.EMBY_CHAVE } });
  }
  if (env.PLEX_URL && env.PLEX_TOKEN) {
    lista.push({ nome: 'Plex', metodo: 'GET', url: `${url(env.PLEX_URL)}/library/sections/all/refresh`, cabecalhos: { 'X-Plex-Token': env.PLEX_TOKEN } });
  }
  return lista;
}

async function atualizar(env = process.env) {
  const resultados = [];
  for (const s of configurados(env)) {
    try {
      const r = await fetch(s.url, { method: s.metodo, headers: s.cabecalhos, signal: AbortSignal.timeout(10000) });
      resultados.push({ nome: s.nome, ok: r.ok, detalhe: r.ok ? 'a atualizar a biblioteca' : `respondeu ${r.status}` });
    } catch (e) {
      resultados.push({ nome: s.nome, ok: false, detalhe: `sem resposta (${e.cause?.code || e.name})` });
    }
  }
  return resultados;
}

module.exports = { configurados, atualizar };
