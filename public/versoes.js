"use strict";
// Histórico de versões: o que foi acrescentado e mudado, com a data e a hora.
(() => {
  const { api, mostrar, esc } = EINK;
  const dataHora = (d) => { const [dia, hora] = d.split(" "); return dia.split("-").reverse().join("/") + " às " + hora; };
  async function versoes() {
    const v = await api("GET", "/api/versoes");
    mostrar(`<h1>Versões</h1><p class="pequeno">Versão atual: <strong>${esc(v.atual)}</strong>. Aqui fica o que foi acrescentado e mudado, com a data e a hora.</p>
      ${v.lista.map((x, i) => `<section class="painel"><h2 style="margin-top:0">${esc(x.versao)} <span class="etiqueta-versao ${esc(x.tipo)}">${esc(x.tipo)}</span>${i === 0 ? ' <span class="etiqueta-versao atual">atual</span>' : ""}</h2>
        <p class="pequeno">${esc(dataHora(x.data))}</p><ul>${x.itens.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></section>`).join("")}`);
  }
  EINK.rotas.push([/^\/versoes$/, versoes]);
})();
