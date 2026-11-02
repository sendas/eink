"use strict";
// Tema claro/escuro. Corre no <head> (antes de desenhar a página) para não piscar; a escolha fica neste navegador.
// Sem escolha, segue o tema do dispositivo («sistema»). O interruptor desenha-se em qualquer elemento com data-tema-switch.
(() => {
  const ler = () => { try { const v = localStorage.getItem("eink.tema"); return v === "claro" || v === "escuro" ? v : "auto"; } catch { return "auto"; } };
  const aplicar = (t) => { if (t === "auto") document.documentElement.removeAttribute("data-tema"); else document.documentElement.setAttribute("data-tema", t); };
  const escuroSistema = () => matchMedia("(prefers-color-scheme: dark)").matches;
  const efetivo = () => { const t = ler(); return t === "auto" ? (escuroSistema() ? "escuro" : "claro") : t; };
  const definir = (t) => { try { if (t === "auto") localStorage.removeItem("eink.tema"); else localStorage.setItem("eink.tema", t); } catch { /* sem armazenamento */ } aplicar(t); pintar(); };
  aplicar(ler());

  const SOL = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const LUA = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></svg>';
  const pintar = () => {
    const esc = efetivo() === "escuro", auto = ler() === "auto";
    document.querySelectorAll(".tema-switch").forEach((b) => { b.setAttribute("aria-checked", esc ? "true" : "false"); b.title = esc ? "Modo escuro ligado. Clica para o claro." : "Modo claro. Clica para o modo escuro."; });
    document.querySelectorAll(".tema-auto").forEach((b) => { b.setAttribute("aria-pressed", auto ? "true" : "false"); });
  };
  const montar = (el) => {
    if (el.dataset.montado) return; el.dataset.montado = "1"; el.classList.add("tema-sw");
    el.innerHTML = `<button type="button" class="tema-switch" role="switch" aria-label="Modo escuro">${SOL}<span class="ts-pista"><span class="ts-bola"></span></span>${LUA}</button><button type="button" class="tema-auto" title="Seguir o tema do dispositivo">Sistema</button>`;
    el.querySelector(".tema-switch").onclick = () => definir(efetivo() === "escuro" ? "claro" : "escuro");
    el.querySelector(".tema-auto").onclick = () => definir("auto");
    pintar();
  };
  const arrancar = () => { document.querySelectorAll("[data-tema-switch]").forEach(montar); pintar(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar); else arrancar();
  try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", pintar); } catch { /* navegador antigo */ }
  window.EINK_TEMA = { ler, efetivo, definir, montar };
})();
