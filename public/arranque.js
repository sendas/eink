"use strict";
// Arranque: descobre quem entrou e liga as rotas às vistas.
(async () => {
  try { EINK.eu = await EINK.api("GET", "/api/eu"); } catch { return; }
  document.getElementById("nome").textContent = EINK.eu.nome || EINK.eu.upn;
  if (EINK.eu.admin) document.getElementById("nav-admin").hidden = false;
  const ir = async () => {
    EINK.aoSair && EINK.aoSair();
    const caminho = location.hash.replace(/^#/, "");
    for (const [re, fn] of EINK.rotas) {
      const m = re.exec(caminho);
      if (m) { try { await fn(...m.slice(1)); } catch { /* o aviso já foi mostrado */ } document.getElementById("vista").focus(); return; }
    }
    location.hash = "#/";
  };
  window.addEventListener("hashchange", ir);
  ir();
})();
