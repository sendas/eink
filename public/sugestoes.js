"use strict";
// Sugestões dos docentes: botão sempre visível no canto e janela para escrever. Os administradores leem-nas em Gestão.
(() => {
  const { api, aviso, esc } = EINK;
  const ESTADO = { nova: "enviada", lida: "lida", feita: "feita" };

  async function abrir() {
    if (document.querySelector(".sug-dlg[open]")) return;
    const dlg = document.createElement("dialog"); dlg.className = "sug-dlg"; dlg.setAttribute("aria-label", "Enviar uma sugestão");
    let minhas = []; try { minhas = await api("GET", "/api/sugestoes"); } catch { /* sem lista */ }
    dlg.innerHTML = `<h2 style="margin-top:0">Enviar uma sugestão</h2>
      <p class="pequeno">Diz-nos o que podemos melhorar, um erro que encontraste ou uma ferramenta que gostavas de ter. Os administradores leem-na com o teu nome.</p>
      <label>A tua sugestão<textarea id="sug-texto" rows="6" maxlength="1500" placeholder="Por exemplo: gostava de poder exportar a pauta para PDF." required></textarea></label>
      <p class="pequeno"><span id="sug-conta">0</span> de 1500 caracteres. A página onde estás fica registada para percebermos o contexto.</p>
      <p class="linha"><button type="button" id="sug-enviar">Enviar sugestão</button><button type="button" class="sec" id="sug-fechar">Cancelar</button></p>
      ${minhas.length ? `<details class="sug-minhas"><summary>As minhas sugestões (${minhas.length})</summary><ul class="lista">${minhas.map((m) => `<li><span>${esc(m.texto.slice(0, 160))}${m.texto.length > 160 ? "…" : ""}<br><span class="pequeno">${esc(m.criada.slice(0, 10).split("-").reverse().join("/"))} · ${ESTADO[m.estado] || m.estado}</span></span></li>`).join("")}</ul></details>` : ""}`;
    document.body.append(dlg); dlg.showModal();
    const t = dlg.querySelector("#sug-texto"), fechar = () => { dlg.close(); dlg.remove(); };
    t.focus(); t.oninput = () => { dlg.querySelector("#sug-conta").textContent = t.value.length; };
    dlg.querySelector("#sug-fechar").onclick = fechar; dlg.addEventListener("cancel", () => dlg.remove());
    dlg.querySelector("#sug-enviar").onclick = async (e) => {
      if (t.value.trim().length < 5) { aviso("Escreve pelo menos uma frase com a tua sugestão.", true); t.focus(); return; }
      e.target.disabled = true;
      try { await api("POST", "/api/sugestoes", { texto: t.value, pagina: location.hash || "#/" }); fechar(); aviso("Obrigado! A tua sugestão foi enviada."); }
      catch { e.target.disabled = false; }
    };
  }
  EINK.sugestao = abrir;

  // Botão fixo no canto, em todas as páginas, e o botão da faixa beta.
  const b = document.createElement("button"); b.type = "button"; b.className = "sug-botao"; b.textContent = "Sugestões"; b.title = "Enviar uma sugestão"; b.onclick = abrir;
  document.body.append(b);
  document.addEventListener("click", (e) => { if (e.target.closest("[data-sugestao]")) abrir(); });
})();
