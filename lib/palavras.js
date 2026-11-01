"use strict";
// Frequência de palavras para a nuvem de palavras de uma sondagem aberta. Agrupa por forma sem acentos e mostra a forma mais usada.
const PARAS = new Set(("a o as os um uma uns umas de do da dos das em no na nos nas por para com sem sob sobre entre ate ao aos aquele aquela isto isso aquilo e ou mas que se nao sim como mais menos muito muita muitos muitas " +
  "ja so tambem ser estar ter foi sao era tem ha eu tu ele ela nos eles elas meu minha teu tua seu sua lhe me te este esta estes estas esse essa esses essas quando onde porque pois depois antes ainda assim").split(" "));
const sem = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function frequencias(textos, max = 60) {
  const m = new Map();
  for (const t of textos) {
    const vistas = new Set(); // uma pessoa não conta a mesma palavra duas vezes na mesma resposta
    for (const original of String(t).split(/[^\p{L}\p{N}]+/u)) {
      const chave = sem(original);
      if (chave.length < 3 || PARAS.has(chave) || /^\d+$/.test(chave) || vistas.has(chave)) continue;
      vistas.add(chave);
      const e = m.get(chave) || { n: 0, formas: new Map() };
      e.n++; e.formas.set(original.toLowerCase(), (e.formas.get(original.toLowerCase()) || 0) + 1);
      m.set(chave, e);
    }
  }
  return [...m.values()].map((e) => ({ palavra: [...e.formas.entries()].sort((a, b) => b[1] - a[1])[0][0], n: e.n })).sort((a, b) => b.n - a.n || a.palavra.localeCompare(b.palavra, "pt")).slice(0, max);
}
module.exports = { frequencias };
