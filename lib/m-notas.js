"use strict";
// Importar notas de um teste a partir do Excel (colado ou ficheiro .xlsx/.csv): lê, associa a cada aluno e devolve uma pré-visualização.
// Nada se grava aqui: o navegador mostra o resultado e, se o docente confirmar, grava pelo pedido normal de notas (que valida, regista e respeita o fecho).
const { lerXlsx, paraTexto } = require("./xlsx-ler");
const { lerNota } = require("./avaliacao");

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// «número nome nota» em colunas (tabulação, ; ou ,) ou «12 Ana Silva 15,5» numa só coluna. A nota é o último campo numérico (ou fração).
function lerLinhasNotas(texto) {
  const linhas = String(texto || "").replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const delim = linhas.some((l) => l.includes("\t")) ? "\t" : linhas.some((l) => l.includes(";")) ? ";" : null;
  const NOTA = /^-?\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?$/;
  const r = [];
  for (const l of linhas) {
    let campos = delim ? l.split(delim).map((x) => x.trim()) : [l];
    if (!delim) { const m = /^(.*\S)\s+(-?\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?)$/.exec(l); campos = m ? [m[1], m[2]] : [l]; }
    campos = campos.filter((x) => x !== "");
    if (!campos.length) continue;
    if (campos.every((x) => /^(n\.?\s?[º°o]?|n[uú]mero|nome|aluno|alunos|nota|notas|classifica[cç][aã]o|e-?mail|\d+(?:[.,]\d+)?\s*%?)$/i.test(x) && campos.some((x) => /^(nome|aluno|alunos|nota|notas|classifica)/i.test(x)))) continue; // cabeçalho
    let nota = "";
    if (campos.length >= 2 && NOTA.test(campos[campos.length - 1])) nota = campos.pop();
    else if (campos.length >= 2 && /^(f|a|n|-|—)?$/i.test(campos[campos.length - 1])) campos.pop(); // coluna de nota vazia ou «F»
    let numero = null, nome;
    if (campos.length >= 2 && /^\d{1,3}$/.test(campos[0])) { numero = Number(campos[0]); nome = campos.slice(1).join(" "); }
    else { const m = /^(\d{1,3})[\s.\-]+(.+)$/.exec(campos.join(" ")); if (m) { numero = Number(m[1]); nome = m[2]; } else nome = campos.join(" "); }
    if (!nome && numero === null) continue;
    if (/^(nome|aluno|alunos|n\.?º?|n[uú]mero)$/i.test(nome || "")) continue; // cabeçalho
    r.push({ original: l, numero, nome: nome || "", nota });
  }
  return r;
}

module.exports = function registar(X) {
  const { rota, db, erro, existe, avalDe } = X;
  rota("POST", "/api/avaliacoes/:id/notas/importar", (c) => {
    const a = existe(avalDe(c.p, c.id[0]));
    if (db.prepare("SELECT 1 FROM itens WHERE avaliacao_id = ? LIMIT 1").get(a.id)) throw erro(409, "Este teste tem grelha: as notas vêm das pontuações por questão.");
    let texto = String(c.b.texto || "");
    if (c.b.base64) {
      const buf = Buffer.from(String(c.b.base64), "base64");
      if (!buf.length || buf.length > 900000) throw erro(400, "Ficheiro vazio ou demasiado grande.");
      if (String(c.b.nome || "").toLowerCase().endsWith(".xlsx") || (buf[0] === 0x50 && buf[1] === 0x4b)) { try { texto = paraTexto(lerXlsx(buf)); } catch (e) { throw erro(400, e.publico ? e.message : "Não consegui ler o ficheiro Excel."); } }
      else texto = buf.toString("utf8");
    }
    const lidas = lerLinhasNotas(texto).slice(0, 300);
    if (!lidas.length) throw erro(400, "Não encontrei linhas com notas.");
    const alunos = db.prepare("SELECT id, numero, nome FROM alunos WHERE turma_id = ?").all(a.turma_id);
    const porNumero = new Map(alunos.filter((x) => x.numero !== null).map((x) => [x.numero, x]));
    const porNome = new Map(); for (const x of alunos) { const k = norm(x.nome); porNome.set(k, [...(porNome.get(k) || []), x]); }
    const usados = new Set();
    const linhas = lidas.map((l) => {
      let al = null, motivo = "";
      if (l.numero !== null && porNumero.has(l.numero)) {
        al = porNumero.get(l.numero);
        // Se o ficheiro traz também o nome, tem de bater (evita notas trocadas por números desatualizados).
        if (l.nome && norm(l.nome) !== norm(al.nome) && !norm(al.nome).includes(norm(l.nome)) && !norm(l.nome).includes(norm(al.nome))) { motivo = `o n.º ${l.numero} é «${al.nome}», mas o ficheiro diz «${l.nome}»`; al = null; }
      }
      if (!al && !motivo && l.nome) {
        const k = norm(l.nome), exatos = porNome.get(k) || [];
        if (exatos.length === 1) al = exatos[0];
        else if (exatos.length > 1) motivo = "há mais do que um aluno com este nome";
        else {
          const parecidos = alunos.filter((x) => { const t = norm(x.nome); return k && (t.includes(k) || k.includes(t)); });
          if (parecidos.length === 1) al = parecidos[0]; else motivo = parecidos.length > 1 ? "nome ambíguo" : "aluno não encontrado nesta turma";
        }
      } else if (!al && !motivo) motivo = "aluno não encontrado nesta turma";
      let valor = null;
      if (al && l.nota !== "") { valor = lerNota(l.nota, a.maximo); if (Number.isNaN(valor)) { motivo = `nota inválida (0 a ${a.maximo})`; valor = null; } }
      if (al && usados.has(al.id)) { motivo = "aluno repetido no ficheiro"; al = null; }
      if (al) usados.add(al.id);
      return { aluno: al ? al.id : null, nome: al ? al.nome : l.nome, numero: al ? al.numero : l.numero, nota: l.nota, valor, ok: !!al && !motivo && l.nota !== "", motivo: al && !motivo && l.nota === "" ? "sem nota (fica como está)" : motivo };
    });
    return { maximo: a.maximo, titulo: a.titulo, linhas, aplicaveis: linhas.filter((x) => x.ok).length, alunosSemLinha: alunos.filter((x) => !usados.has(x.id)).map((x) => x.nome) };
  });
};
module.exports.lerLinhasNotas = lerLinhasNotas;
