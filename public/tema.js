"use strict";
// Tema claro/escuro. Corre no <head> (antes de desenhar a página) para não piscar; a escolha fica neste navegador.
(() => {
  const ler = () => { try { const v = localStorage.getItem("eink.tema"); return v === "claro" || v === "escuro" ? v : "auto"; } catch { return "auto"; } };
  const aplicar = (t) => { if (t === "auto") document.documentElement.removeAttribute("data-tema"); else document.documentElement.setAttribute("data-tema", t); };
  aplicar(ler());
  window.EINK_TEMA = {
    ler,
    ciclo() { const seg = { auto: "claro", claro: "escuro", escuro: "auto" }[ler()]; try { if (seg === "auto") localStorage.removeItem("eink.tema"); else localStorage.setItem("eink.tema", seg); } catch { /* sem armazenamento */ } aplicar(seg); return seg; },
  };
})();
