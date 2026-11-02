"use strict";
document.getElementById("f-local").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target), erro = document.getElementById("erro-local"); erro.textContent = "";
  try {
    const r = await fetch("/auth/local", { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "eink" }, body: JSON.stringify({ utilizador: f.get("utilizador"), senha: f.get("senha") }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { erro.textContent = d.erro || "Não foi possível entrar. Tenta outra vez."; return; }
    location.href = "/";
  } catch { erro.textContent = "Sem ligação ao servidor. Verifica a rede e tenta outra vez."; }
};

// Slideshow das capturas: avança sozinho (menos com movimento reduzido), pára com o rato ou o foco por cima e tem botões e pontos.
(() => {
  const slides = [...document.querySelectorAll(".slide")], pontos = document.getElementById("sl-pontos");
  if (!slides.length) return;
  let i = 0, relogio = null;
  const bolas = slides.map((_, k) => { const b = document.createElement("button"); b.type = "button"; b.className = "ponto"; b.setAttribute("aria-label", `Captura ${k + 1} de ${slides.length}`); b.onclick = () => { ir(k); parar(); }; pontos.append(b); return b; });
  const ir = (k) => { i = (k + slides.length) % slides.length; slides.forEach((s, n) => s.classList.toggle("ativo", n === i)); bolas.forEach((b, n) => b.setAttribute("aria-current", n === i ? "true" : "false")); };
  const parar = () => { clearInterval(relogio); relogio = null; };
  const iniciar = () => { if (relogio || matchMedia("(prefers-reduced-motion: reduce)").matches) return; relogio = setInterval(() => ir(i + 1), 5500); };
  document.getElementById("sl-ant").onclick = () => { ir(i - 1); parar(); };
  document.getElementById("sl-seg").onclick = () => { ir(i + 1); parar(); };
  const secao = document.querySelector(".slides");
  secao.addEventListener("mouseenter", parar); secao.addEventListener("mouseleave", iniciar);
  secao.addEventListener("focusin", parar);
  secao.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") { ir(i - 1); parar(); } if (e.key === "ArrowRight") { ir(i + 1); parar(); } });
  // Ampliação: janela por cima de tudo, com a versão grande da captura, setas, legenda e ecrã inteiro (quando o navegador deixa).
  const lb = document.getElementById("lb"), lbImg = document.getElementById("lb-img"), lbLeg = document.getElementById("lb-legenda"), lbEcra = document.getElementById("lb-ecra");
  const mostrarLb = () => { const img = slides[i].querySelector("img"); lbImg.src = img.dataset.grande || img.src; lbImg.alt = img.alt; lbLeg.textContent = slides[i].querySelector("figcaption").textContent + `  (${i + 1} de ${slides.length})`; };
  const abrirLb = () => { parar(); mostrarLb(); if (!lb.open) lb.showModal(); };
  const passarLb = (d) => { ir(i + d); mostrarLb(); };
  document.getElementById("sl-ampliar").onclick = abrirLb;
  slides.forEach((s) => { s.querySelector("img").onclick = abrirLb; s.querySelector("img").style.cursor = "zoom-in"; });
  document.getElementById("lb-fechar").onclick = () => lb.close();
  document.getElementById("lb-ant").onclick = () => passarLb(-1);
  document.getElementById("lb-seg").onclick = () => passarLb(1);
  lb.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") passarLb(-1); if (e.key === "ArrowRight") passarLb(1); });
  lb.addEventListener("click", (e) => { if (e.target === lb) lb.close(); });
  let x0 = null; lb.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) passarLb(dx < 0 ? 1 : -1); });
  lb.addEventListener("close", () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); lbImg.removeAttribute("src"); });
  if (document.fullscreenEnabled && lb.requestFullscreen) {
    lbEcra.hidden = false;
    lbEcra.onclick = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else lb.requestFullscreen().catch(() => {}); };
    document.addEventListener("fullscreenchange", () => { lbEcra.textContent = document.fullscreenElement ? "Sair do ecrã inteiro" : "Ecrã inteiro"; });
  }
  ir(0); iniciar();
})();
