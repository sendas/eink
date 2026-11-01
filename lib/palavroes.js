"use strict";
// Filtro de palavrões e insultos do chat. Antes de comparar, o texto é normalizado: minúsculas, sem acentos,
// algarismos e símbolos trocados pelas letras que imitam (m3rd@ → merda), letras repetidas reduzidas a uma (merdaaa → merda)
// e letras soltas seguidas juntas (m e r d a, m.e.r.d.a → merda). Compara-se palavra a palavra (nunca dentro de outras
// palavras, para não apanhar «computador» ou «reconhecer»), com a lista exata e com os começos de palavra de RAIZES.
// O professor acrescenta palavras suas (terminadas em * contam como começo de palavra).

// Formas já normalizadas (sem acentos e sem letras repetidas).
const EXATAS = [
  "merda", "merdas", "foda", "fodase", "foder", "fodido", "fodida", "fodidos", "fodidas", "puta", "putas", "putedo", "putaria",
  "cona", "conas", "pila", "pilas", "caralho", "caralhos", "cabrao", "cabroes", "cabrona", "paneleiro", "paneleiros", "panasca", "panascas",
  "bosta", "cagalhao", "cagalhoes", "otario", "otaria", "otarios", "idiota", "idiotas", "estupido", "estupida", "estupidos", "imbecil", "imbecis",
  "cretino", "cretina", "mongoloide", "badalhoco", "badalhoca", "punheta", "punhetas",
  "crl", "krl", "fdp", "pqp", "vsf", "vtnc", "pfdp", "fds", "fodase",
];
// Começos de palavra (merdoso, caralhada, fodilhão, paneleirice...).
const RAIZES = ["merd", "fod", "caralh", "paneleir", "putedo", "punhet", "cagalh", "cabrao", "cabroe", "badalhoc"];

const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", "@": "a", $: "s", "!": "i", "|": "i", "€": "e" };

const semRepetir = (s) => s.replace(/(.)\1+/g, "$1");
function normalizar(texto) {
  return String(texto || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[013457 8@$!|€]/g, (c) => (c === " " ? " " : LEET[c] || c));
}
// Palavras do texto, já normalizadas, mais as sequências de letras soltas juntas («m e r d a»).
function palavras(texto) {
  const toks = normalizar(texto).split(/[^a-z]+/).filter(Boolean);
  const out = toks.map(semRepetir);
  let soltas = "";
  for (const t of toks.concat([""])) {
    if (t.length === 1) { soltas += t; continue; }
    if (soltas.length >= 3) out.push(semRepetir(soltas));
    soltas = "";
  }
  return out;
}

function criar(extra = []) {
  const exatas = new Set(EXATAS.map((x) => semRepetir(x.replace(/[^a-z]/g, ""))));
  const raizes = RAIZES.slice();
  for (const p of extra) {
    const w = semRepetir(normalizar(p).replace(/[^a-z*]/g, ""));
    if (!w || w === "*") continue;
    if (w.endsWith("*")) { if (w.length > 2) raizes.push(w.slice(0, -1)); } else exatas.add(w);
  }
  // Devolve a primeira palavra proibida encontrada (normalizada) ou "".
  return (texto) => palavras(texto).find((w) => exatas.has(w) || raizes.some((r) => w.startsWith(r))) || "";
}

module.exports = { criar, normalizar, palavras };
