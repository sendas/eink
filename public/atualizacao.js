"use strict";
// Avisa quando há uma versão nova da plataforma: pergunta ao servidor de 2 em 2 minutos (e ao voltar ao separador) e, se a versão mudou,
// mostra uma faixa com o que há de novo e o botão «Atualizar agora». Depois de atualizar, mostra uma vez o que mudou.
(() => {
  const { esc } = EINK;
  let carregada = null, adiadoAte = 0;
  const faixa = (classe, html) => {
    document.querySelectorAll(".nova-versao").forEach((e) => e.remove());
    const d = document.createElement("div"); d.className = "nova-versao " + classe; d.setAttribute("role", "status"); d.innerHTML = html; document.body.append(d); return d;
  };
  const itens = (d) => (d.itens || []).slice(0, 2).map((i) => `<li>${esc(i.length > 170 ? i.slice(0, 167) + "…" : i)}</li>`).join("");

  async function perguntar() {
    try { const r = await fetch("/api/versao", { headers: { "X-Requested-With": "eink" }, cache: "no-store" }); return r.ok ? await r.json() : null; } catch { return null; }
  }
  async function verificar() {
    if (!carregada || Date.now() < adiadoAte) return;
    const d = await perguntar();
    if (!d || !d.versao || d.versao === carregada || document.querySelector(".nova-versao.nova")) return;
    const f = faixa("nova", `<div><strong>Há uma versão nova do Eça Avalia (v${esc(d.versao)}).</strong><ul>${itens(d)}</ul></div>
      <div class="nv-acoes"><button type="button" id="nv-atualizar">Atualizar agora</button><button type="button" class="sec" id="nv-depois">Mais tarde</button></div>`);
    f.querySelector("#nv-atualizar").onclick = () => location.reload();
    f.querySelector("#nv-depois").onclick = () => { adiadoAte = Date.now() + 20 * 60000; f.remove(); };
  }
  async function novidades() {
    try {
      const vista = localStorage.getItem("eink.versaoVista"); localStorage.setItem("eink.versaoVista", carregada);
      if (!vista || vista === carregada) return;
      const d = await perguntar(); if (!d || d.versao !== carregada) return;
      const f = faixa("feita", `<div><strong>Atualizado para a versão ${esc(d.versao)}.</strong><ul>${itens(d)}</ul></div><div class="nv-acoes"><a class="botao sec" href="#/versoes">Ver tudo o que mudou</a><button type="button" class="sec" id="nv-fechar">Fechar</button></div>`);
      f.querySelector("#nv-fechar").onclick = () => f.remove(); f.querySelector("a").onclick = () => f.remove();
      setTimeout(() => f.remove(), 20000);
    } catch { /* sem armazenamento */ }
  }
  EINK.verificarVersao = verificar;
  EINK.vigiarVersao = () => {
    carregada = EINK.eu && EINK.eu.versao; if (!carregada) return;
    novidades();
    setInterval(() => { if (document.visibilityState === "visible") verificar(); }, 120000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") verificar(); });
    window.addEventListener("online", verificar);
  };
})();
