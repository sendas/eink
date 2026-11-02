"use strict";
// Escala de 1 a 5 pelos limites dos níveis (20, 50, 70 e 90 por defeito), com uma marca na nota final do aluno.
(() => {
  const nivelDe = (f, lim) => 1 + lim.filter((x) => f >= x).length;
  EINK.escala = (final, limites = [20, 50, 70, 90], { grande = false } = {}) => {
    const L = [0, ...limites, 100], tem = final !== null && final !== undefined, pos = tem ? Math.max(0, Math.min(100, final)) : 0;
    const segs = [0, 1, 2, 3, 4].map((i) => `<span class="lv lv${i + 1}" style="flex:${Math.max(1, L[i + 1] - L[i])}"></span>`).join("");
    return `<div class="escala${grande ? " escala-g" : ""}" role="img" aria-label="${tem ? `Nota final ${Math.round(final * 10) / 10} %, nível ${nivelDe(final, limites)} de 5` : "Sem nota final"}">${segs}${tem ? `<i class="escala-marca" style="left:${pos}%"></i>` : ""}</div>`;
  };
})();
