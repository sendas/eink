"use strict";
// Cor do nível e avaliação qualitativa de uma célula (teste, média, pontuação), pelos limites da escola. Usado na pauta e na grelha dos testes.
(() => {
  const NOMES = ["Muito insuficiente", "Insuficiente", "Suficiente", "Bom", "Muito bom"];
  const LIMITES = [20, 50, 70, 90];
  const de = (v, lim = LIMITES) => (v === null || v === undefined || Number.isNaN(v) ? 0 : 1 + lim.filter((x) => v >= x).length);
  // Põe a classe av-nN na célula e, com `rotulo`, o nome do nível por baixo do valor.
  const marcar = (td, v, lim = LIMITES, rotulo = true) => {
    if (!td) return;
    for (let n = 1; n <= 5; n++) td.classList.remove("av-n" + n);
    let q = td.querySelector(".av-qual"); const n = de(v, lim);
    if (!n) { if (q) q.remove(); td.removeAttribute("title"); return; }
    td.classList.add("av-n" + n); td.title = `Nível ${n}: ${NOMES[n - 1]}`;
    if (!rotulo) { if (q) q.remove(); return; }
    if (!q) { q = document.createElement("span"); q.className = "av-qual"; td.append(q); }
    q.textContent = NOMES[n - 1];
  };
  EINK.nivelCel = { NOMES, LIMITES, de, marcar };
})();
