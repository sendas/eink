"use strict";
// Arranque: descobre quem entrou e liga as rotas às vistas.
(async () => {
  try { EINK.eu = await EINK.api("GET", "/api/eu"); } catch { return; }
  document.getElementById("nome").textContent = EINK.eu.nome || EINK.eu.upn;
  if (EINK.eu.admin) { document.getElementById("nav-admin").hidden = false; document.getElementById("nav-crit").hidden = false; }
  // Botão do tema: Automático (sistema) → Claro → Escuro
  const botaoTema = document.getElementById("tema"), NOME = { auto: "Tema: automático", claro: "Tema: claro", escuro: "Tema: escuro" };
  const pintarTema = () => { const t = window.EINK_TEMA.ler(); botaoTema.textContent = NOME[t]; botaoTema.setAttribute("aria-label", NOME[t] + ". Mudar o tema."); };
  botaoTema.onclick = () => { window.EINK_TEMA.ciclo(); pintarTema(); };
  pintarTema();
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
