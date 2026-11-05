"use strict";
// Modelos de grelha: guardar a estrutura de um teste (questões e cotações), voltar a usá-la e enviá-la a colegas dentro da plataforma.
(() => {
  const { api, aviso, mostrar, esc, $, $$ } = EINK;
  const num = (v) => String(Math.round(v * 100) / 100).replace(".", ",");

  // Janela para escolher os colegas que recebem uma cópia do modelo.
  EINK.dialogoEnviar = async (modeloId, nome, depois) => {
    let colegas = []; try { colegas = await api("GET", "/api/colegas"); } catch { return; }
    const dlg = document.createElement("dialog"); dlg.className = "sug-dlg";
    dlg.innerHTML = `<h2 style="margin-top:0">Enviar «${esc(nome)}» a colegas</h2>
      <p class="pequeno">Cada colega recebe uma cópia da estrutura (questões e cotações), sem notas nem alunos. Vê-la em «Modelos».</p>
      <label>Procurar um colega<input id="col-busca" type="search" placeholder="Nome"></label>
      <div class="col-lista" id="col-lista">${colegas.map((c) => `<label data-n="${esc(c.nome.toLowerCase())}"><input type="checkbox" value="${c.id}"> ${esc(c.nome)}</label>`).join("") || '<p class="pequeno">Ainda não há outros docentes na plataforma.</p>'}</div>
      <p class="linha"><button type="button" id="col-enviar">Enviar</button><button type="button" class="sec" id="col-fechar">Cancelar</button></p>`;
    document.body.append(dlg); dlg.showModal();
    const fechar = () => { dlg.close(); dlg.remove(); };
    $("#col-fechar", dlg).onclick = fechar; dlg.addEventListener("cancel", () => dlg.remove());
    $("#col-busca", dlg).oninput = (e) => { const t = e.target.value.trim().toLowerCase(); $$("#col-lista label", dlg).forEach((l) => { l.hidden = !!t && !l.dataset.n.includes(t); }); };
    $("#col-enviar", dlg).onclick = async (e) => {
      const para = $$("#col-lista input:checked", dlg).map((i) => Number(i.value));
      if (!para.length) return aviso("Escolhe pelo menos um colega.", true);
      e.target.disabled = true;
      try { const r = await api("POST", `/api/grelha-modelos/${modeloId}/enviar`, { para }); fechar(); aviso(`Modelo enviado a ${r.enviados} colega${r.enviados === 1 ? "" : "s"}.`); if (depois) depois(); } catch { e.target.disabled = false; }
    };
  };

  const lerLinhas = (t) => String(t || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const c = l.split(/\t|;|\|/).map((x) => x.trim());
    return c.length >= 3 ? { grupo: c[0], nome: c[1], cotacao: c[2] } : { grupo: "", nome: c[0], cotacao: c[1] };
  });

  async function modelos() {
    const lista = await api("GET", "/api/grelha-modelos");
    mostrar(`<h1>Modelos de grelha</h1>
      <p class="pequeno">Guarda a estrutura de um teste (questões e cotações) para a usares noutros testes e turmas, ou envia-a a colegas. Para criar um modelo a partir de um teste, abre a grelha desse teste e escolhe «Guardar esta grelha como modelo».</p>
      <details class="painel"><summary><strong>Criar um modelo novo</strong> <span class="pequeno">uma questão por linha</span></summary>
        <form id="f-modelo" class="linha" style="flex-direction:column;align-items:stretch">
          <label>Nome do modelo<input name="nome" required maxlength="100" placeholder="Teste de Matemática, 8.º ano"></label>
          <label>Questões e cotações<textarea name="itens" rows="6" required placeholder="1 ; 10&#10;2 ; 15&#10;Grupo II | 3 | 25"></textarea></label>
          <p class="pequeno">Escreve «questão ; cotação» ou «grupo | questão | cotação». Podes colar do Excel. Convém que as cotações somem 100.</p>
          <p><button>Guardar modelo</button></p>
        </form></details>
      ${lista.length ? `<div class="mod-lista">${lista.map((m) => `<article class="mod-cartao" data-id="${m.id}">
        <h3>${esc(m.nome)} ${m.nova ? '<span class="mod-nova">novo</span>' : ""}</h3>
        <p class="pequeno">${m.n} questões · soma ${num(m.soma)} pts${m.de ? ` · recebido de ${esc(m.de)}` : ""}</p>
        <details><summary class="pequeno">Ver as questões</summary><ul class="lista">${m.itens.map((i) => `<li><span>${i.grupo ? esc(i.grupo) + " · " : ""}${esc(i.nome)}</span><strong>${num(i.cotacao)}</strong></li>`).join("")}</ul></details>
        <p class="linha"><button type="button" data-env="${m.id}">Enviar a colegas</button><button type="button" class="sec" data-ren="${m.id}">Mudar o nome</button><button type="button" class="perigo" data-del="${m.id}">Apagar</button></p>
      </article>`).join("")}</div>` : '<p class="painel">Ainda não tens modelos. Cria um aqui ou a partir da grelha de um teste.</p>'}`);
    // Vistos: apaga a marca de «novo» e o número ao lado de «Modelos».
    if (lista.some((m) => m.nova)) { api("POST", "/api/grelha-modelos/vistos", {}).catch(() => {}); EINK.eu.grelhas_novas = 0; const b = document.getElementById("nav-modelos-n"); if (b) b.hidden = true; }
    $("#f-modelo").onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      try { await api("POST", "/api/grelha-modelos", { nome: f.get("nome"), itens: lerLinhas(f.get("itens")) }); aviso("Modelo guardado."); modelos(); } catch { /* aviso mostrado */ }
    };
    $$("[data-env]").forEach((b) => { b.onclick = () => { const m = lista.find((x) => x.id === Number(b.dataset.env)); EINK.dialogoEnviar(m.id, m.nome); }; });
    $$("[data-ren]").forEach((b) => { b.onclick = async () => { const m = lista.find((x) => x.id === Number(b.dataset.ren)), n = prompt("Novo nome do modelo:", m.nome); if (n && n.trim()) { await api("PUT", `/api/grelha-modelos/${m.id}`, { nome: n }); modelos(); } }; });
    $$("[data-del]").forEach((b) => { b.onclick = async () => { if (confirm("Apagar este modelo? Os testes que já o usam não mudam.")) { await api("DELETE", `/api/grelha-modelos/${b.dataset.del}`); modelos(); } }; });
  }
  EINK.rotas.push([/^\/modelos$/, modelos]);
})();
