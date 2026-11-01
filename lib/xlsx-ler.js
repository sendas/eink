"use strict";
// Leitor mínimo de .xlsx (a primeira folha), sem dependências: lê o ZIP pelo diretório central e interpreta as células.
const zlib = require("node:zlib");

const desfazer = (s) => String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");

function lerZip(buf) {
  let fim = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  if (fim < 0) throw Object.assign(new Error("O ficheiro não é um .xlsx válido."), { publico: true });
  const n = buf.readUInt16LE(fim + 10); let pos = buf.readUInt32LE(fim + 16);
  const partes = new Map();
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw Object.assign(new Error("O ficheiro .xlsx está danificado."), { publico: true });
    const metodo = buf.readUInt16LE(pos + 10), csize = buf.readUInt32LE(pos + 20), usize = buf.readUInt32LE(pos + 24), nlen = buf.readUInt16LE(pos + 28), xlen = buf.readUInt16LE(pos + 30), clen = buf.readUInt16LE(pos + 32), off = buf.readUInt32LE(pos + 42);
    const nome = buf.toString("utf8", pos + 46, pos + 46 + nlen);
    pos += 46 + nlen + xlen + clen;
    if (!/^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(nome)) continue;
    if (usize > 8e6) throw Object.assign(new Error("A folha é demasiado grande."), { publico: true });
    const dados = buf.subarray(off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28), off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28) + csize);
    partes.set(nome, (metodo === 8 ? zlib.inflateRawSync(dados, { maxOutputLength: 8e6 }) : dados).toString("utf8"));
  }
  return partes;
}

const colunaDe = (letras) => { let n = 0; for (const c of letras) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; };

// Devolve as linhas da primeira folha como matriz de textos.
function lerXlsx(buf) {
  const partes = lerZip(buf);
  const nomes = [...partes.keys()].filter((k) => k.startsWith("xl/worksheets/")).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  if (!nomes.length) throw Object.assign(new Error("Não encontrei nenhuma folha no ficheiro."), { publico: true });
  const partilhadas = [];
  for (const m of (partes.get("xl/sharedStrings.xml") || "").matchAll(/<si>([\s\S]*?)<\/si>/g)) partilhadas.push(desfazer([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("")));
  const linhas = [];
  for (const m of partes.get(nomes[0]).matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const [, letras, lin, attrs, corpo = ""] = m;
    const tipo = (/t="(\w+)"/.exec(attrs) || [])[1];
    let v = "";
    if (tipo === "s") v = partilhadas[Number((/<v>([\s\S]*?)<\/v>/.exec(corpo) || [])[1])] ?? "";
    else if (tipo === "inlineStr") v = desfazer([...corpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""));
    else v = desfazer((/<v>([\s\S]*?)<\/v>/.exec(corpo) || [])[1] || "");
    const r = Number(lin) - 1;
    if (r > 5000) continue;
    (linhas[r] = linhas[r] || [])[colunaDe(letras)] = v.trim();
  }
  return Array.from(linhas, (l) => Array.from(l || [], (x) => x ?? ""));
}

// Texto delimitado por tabulações a partir de linhas já lidas.
const paraTexto = (linhas) => linhas.filter((l) => l.some((x) => x !== "")).map((l) => l.join("\t")).join("\n");

// Lê alunos: «número nome email» em colunas (tabulação, ; ou ,) ou em linhas «12 Ana Silva». Salta cabeçalhos.
function lerAlunos(texto, { virgula = false } = {}) {
  const linhas = String(texto || "").replace(/^﻿/, "").split(/\r?\n/).map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim());
  const delim = linhas.some((l) => l.includes("\t")) ? "\t" : linhas.some((l) => l.includes(";")) ? ";" : virgula && linhas.some((l) => l.includes(",")) ? "," : null;
  const CAB = /^(n\.?\s?[ºo°]|n|nº|n[uú]mero|nome|aluno|alunos|e-?mail)$/i;
  const r = [];
  for (const l of linhas) {
    let campos = delim ? l.split(delim).map((x) => x.trim()) : [l.trim()];
    if (campos.filter(Boolean).length && campos.filter(Boolean).every((x) => CAB.test(x))) continue; // cabeçalho
    let email = "";
    const ei = campos.findIndex((x) => /@/.test(x));
    if (ei >= 0) { email = campos[ei].toLowerCase(); campos = campos.filter((_, i) => i !== ei); }
    campos = campos.filter(Boolean);
    let numero = null, nome = "";
    const num = (x) => /^\d{1,3}$/.test(x);
    if (campos.length === 1) { const m = /^(\d{1,3})[\s.\-;,]+(.+)$/.exec(campos[0]); if (m) { numero = Number(m[1]); nome = m[2]; } else nome = campos[0]; }
    else if (num(campos[0])) { numero = Number(campos[0]); nome = campos.slice(1).join(" "); }
    else if (num(campos[campos.length - 1])) { numero = Number(campos[campos.length - 1]); nome = campos.slice(0, -1).join(" "); }
    else nome = campos.join(" ");
    nome = nome.replace(/\s+/g, " ").trim().slice(0, 120);
    if (nome) r.push({ numero, nome, email: email.slice(0, 120) });
  }
  return r;
}

module.exports = { lerXlsx, paraTexto, lerAlunos };
