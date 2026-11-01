"use strict";
// Validação dos quizzes (perguntas de escolha com resposta certa), portada do motor «quiz» do tic.techpro.pt.
const erro = (m) => Object.assign(new Error(m), { codigo: 400 });
const limpar = (v) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

function txt(v, max, nome, obrigatorio) {
  const t = limpar(v).trim();
  if (obrigatorio && !t) throw erro(`${nome} não pode ficar vazio.`);
  if (t.length > max) throw erro(`${nome} é demasiado longo (máximo ${max} caracteres).`);
  return t;
}

// Devolve o conteúdo limpo { intro, tempo, perguntas: [{ id, texto, opcoes, certa, explicacao, tempo }] } ou lança erro 400.
function validar(c) {
  if (!c || typeof c !== "object") throw erro("Conteúdo em falta.");
  if (!Array.isArray(c.perguntas) || c.perguntas.length < 1 || c.perguntas.length > 40) throw erro("Tem de haver entre 1 e 40 perguntas.");
  const usados = new Set();
  let seguinte = 1;
  const perguntas = c.perguntas.map((q, i) => {
    let id = typeof q.id === "string" && /^q[0-9]{1,3}$/.test(q.id) && !usados.has(q.id) ? q.id : "";
    if (!id) { while (usados.has("q" + seguinte)) seguinte++; id = "q" + seguinte; }
    usados.add(id);
    if (!Array.isArray(q.opcoes) || q.opcoes.length < 2 || q.opcoes.length > 5) throw erro(`Pergunta ${i + 1}: tem de haver entre 2 e 5 opções.`);
    const opcoes = q.opcoes.map((o, k) => txt(o, 150, `Opção ${k + 1} da pergunta ${i + 1}`, true));
    if (new Set(opcoes).size !== opcoes.length) throw erro(`Pergunta ${i + 1}: as opções têm de ser diferentes.`);
    const certa = parseInt(q.certa, 10);
    if (!(certa >= 0 && certa < opcoes.length)) throw erro(`Pergunta ${i + 1}: escolhe qual é a opção certa.`);
    const tq = q.tempo === undefined || q.tempo === "" || q.tempo === null ? 0 : parseInt(q.tempo, 10);
    if (!Number.isInteger(tq) || tq < 0 || tq > 120) throw erro(`Pergunta ${i + 1}: o tempo tem de estar entre 1 e 120 segundos (vazio usa o tempo geral).`);
    return { id, texto: txt(q.texto, 300, `A pergunta ${i + 1}`, true), opcoes, certa, explicacao: txt(q.explicacao, 500, `A explicação da pergunta ${i + 1}`), tempo: tq };
  });
  const tempo = c.tempo === undefined || c.tempo === "" || c.tempo === null ? 0 : parseInt(c.tempo, 10);
  if (!Number.isInteger(tempo) || tempo < 0 || tempo > 120) throw erro("O tempo por pergunta tem de estar entre 0 (padrão de 20 s) e 120 segundos.");
  return { intro: txt(c.intro, 600, "A introdução"), tempo, perguntas };
}

module.exports = { validar };
