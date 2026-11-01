"use strict";
// Jogo ao vivo de um quiz, estilo Kahoot (portado do tic.techpro.pt): o docente lança as perguntas, os alunos respondem no próprio
// telemóvel (entram com um código e uma alcunha, sem conta) e há ranking por pontos (quanto mais depressa e certo, mais pontos).
// As sessões vivem em memória, uma por código (PIN).
const crypto = require("node:crypto");

const TEMPO_PADRAO = 20000, MARGEM_REDE = 1500, MAX_TOPO = 5, MAX_JOGADORES = 80, VALIDADE_MS = 4 * 3600000;
const sessoes = new Map(); // pin -> sessão
let aoTerminar = () => {};
const agora = () => Date.now();
const erro = (m, codigo = 400) => Object.assign(new Error(m), { codigo });

const avisar = (s) => { s.revisao = (s.revisao || 0) + 1; };
function programar(s) {
  clearTimeout(s.relogio);
  if (s.fase === "pergunta") { s.relogio = setTimeout(() => avaliar(s), Math.max(1, s.inicio + s.tempoMs + MARGEM_REDE - agora())); s.relogio.unref(); }
}
const novoPin = () => { for (let i = 0; i < 100; i++) { const p = String(crypto.randomInt(100000, 1000000)); if (!sessoes.has(p)) return p; } throw erro("Há demasiadas sessões em curso.", 503); };

function criar({ profId, quizId, titulo, conteudo }) {
  if (!conteudo || !Array.isArray(conteudo.perguntas) || !conteudo.perguntas.length) throw erro("Este quiz não tem perguntas.");
  limparAntigas();
  const s = {
    pin: novoPin(), profId, quizId, titulo, conteudo: JSON.parse(JSON.stringify(conteudo)), criada: agora(), revisao: 0,
    fase: "sala", idx: -1, inicio: 0, tempoMs: conteudo.tempo > 0 ? conteudo.tempo * 1000 : TEMPO_PADRAO,
    jogadores: new Map(), // token -> { nome, pontos, certas, ult }
    respostas: new Map(), // token -> { resp, ms, ok, pontos } só da pergunta em curso
    historico: new Map(), // token -> { qid -> { resp, ok } }
  };
  sessoes.set(s.pin, s); avisar(s);
  return s;
}
const da = (pin) => sessoes.get(String(pin)) || null;
const doProf = (profId) => [...sessoes.values()].filter((s) => s.profId === profId);
const fechar = (pin) => { const s = sessoes.get(String(pin)); if (s) { clearTimeout(s.relogio); sessoes.delete(String(pin)); } };
function limparAntigas() { for (const s of sessoes.values()) if (agora() - s.criada > VALIDADE_MS) fechar(s.pin); }

const pergunta = (s) => s.conteudo.perguntas[s.idx] || null;
const tempoDe = (s) => { const q = pergunta(s); const t = (q && q.tempo) || s.conteudo.tempo; return t > 0 ? t * 1000 : TEMPO_PADRAO; };

// Alcunha: até 16 caracteres, única na sessão (se já existir, junta um número).
function entrar(s, token, alcunha, filtro) {
  if (s.jogadores.has(token)) return s.jogadores.get(token);
  if (s.fase !== "sala") throw erro("O jogo já começou.", 409);
  if (s.jogadores.size >= MAX_JOGADORES) throw erro("A sala está cheia.", 409);
  let nome = String(alcunha || "").replace(/[\u0000-\u001F<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 16);
  if (!nome) throw erro("Escolhe uma alcunha.");
  if (filtro && filtro(nome)) throw erro("Escolhe outra alcunha.");
  const existentes = new Set([...s.jogadores.values()].map((j) => j.nome.toLowerCase()));
  let final = nome, k = 2;
  while (existentes.has(final.toLowerCase())) final = `${nome.slice(0, 13)} ${k++}`;
  const j = { nome: final, pontos: 0, certas: 0, ult: 0 };
  s.jogadores.set(token, j); avisar(s);
  return j;
}

function avaliar(s) { if (s.fase === "pergunta" && agora() >= s.inicio + s.tempoMs + MARGEM_REDE) revelar(s); }

function revelar(s) {
  if (s.fase !== "pergunta") return;
  const q = pergunta(s);
  for (const [t, j] of s.jogadores) {
    const r = s.respostas.get(t);
    j.ult = r ? r.pontos : 0;
    if (r) { j.pontos += r.pontos; if (r.ok) j.certas++; }
    const h = s.historico.get(t) || {};
    h[q.id] = r ? { resp: r.resp, ok: r.ok } : { resp: -1, ok: false };
    s.historico.set(t, h);
  }
  s.fase = "resposta"; clearTimeout(s.relogio); avisar(s);
}

const ranking = (s) => [...s.jogadores.entries()].map(([token, j]) => ({ token, nome: j.nome, pontos: j.pontos, certas: j.certas, ult: j.ult }))
  .sort((a, b) => b.pontos - a.pontos || b.certas - a.certas || a.nome.localeCompare(b.nome, "pt"));

function acao(s, nome) {
  avaliar(s);
  if (nome === "comecar") {
    if (s.fase !== "sala") throw erro("O jogo já começou.");
    if (!s.jogadores.size) throw erro("Ainda não entrou nenhum aluno.");
    s.idx = 0; s.fase = "pergunta"; s.inicio = agora(); s.respostas = new Map(); s.tempoMs = tempoDe(s);
  } else if (nome === "mais") {
    if (s.fase !== "pergunta") throw erro("Não há nenhuma pergunta em curso.");
    s.tempoMs = Math.min(s.tempoMs + 10000, 300000);
  } else if (nome === "mostrar") {
    if (s.fase !== "pergunta") throw erro("Não há nenhuma pergunta em curso.");
    revelar(s);
  } else if (nome === "proxima") {
    if (s.fase !== "resposta") throw erro("Mostra primeiro a resposta da pergunta atual.");
    if (s.idx + 1 >= s.conteudo.perguntas.length) return acao(s, "terminar");
    s.idx++; s.fase = "pergunta"; s.inicio = agora(); s.respostas = new Map(); s.tempoMs = tempoDe(s);
  } else if (nome === "terminar") {
    if (s.fase === "pergunta") revelar(s);
    if (s.fase === "fim") return;
    s.fase = "fim";
    try { aoTerminar(s, ranking(s)); } catch (e) { console.error("Quiz ao vivo: falha ao guardar o resultado:", e.message); }
  } else throw erro("Ação desconhecida.");
  programar(s); avisar(s);
}

function responder(s, token, qid, k) {
  avaliar(s);
  if (s.fase !== "pergunta") throw erro("Já não podes responder a esta pergunta.");
  const q = pergunta(s);
  if (!q || q.id !== qid || !Number.isInteger(k) || k < 0 || k >= q.opcoes.length) throw erro("Resposta inválida.");
  if (!s.jogadores.has(token)) throw erro("Entra primeiro no jogo.");
  if (s.respostas.has(token)) return; // a primeira resposta é a que conta
  if (agora() > s.inicio + s.tempoMs + MARGEM_REDE) throw erro("O tempo acabou.");
  const ms = Math.min(Math.max(0, agora() - s.inicio), s.tempoMs);
  const ok = k === q.certa;
  s.respostas.set(token, { resp: k, ms, ok, pontos: ok ? Math.round(1000 * (1 - ms / s.tempoMs / 2)) : 0 }); avisar(s);
  avaliar(s);
}

const posicao = (rk, token) => { const i = rk.findIndex((x) => x.token === token); return i < 0 ? 0 : i + 1; };
const contagem = (s, q) => { const c = q.opcoes.map(() => 0); for (const x of s.respostas.values()) c[x.resp]++; return c; };

// Vista do aluno: nada de resposta certa enquanto a pergunta está aberta.
function vistaAluno(s, token) {
  avaliar(s);
  const rk = ranking(s), eu = s.jogadores.get(token);
  const v = { ativo: true, entrou: !!eu, nome: eu ? eu.nome : "", revisao: s.revisao, titulo: s.titulo, fase: s.fase, idx: s.idx, total: s.conteudo.perguntas.length, jogadores: s.jogadores.size, tempo: s.tempoMs, pontos: eu ? eu.pontos : 0, posicao: posicao(rk, token) };
  const q = pergunta(s);
  if (!eu) return v;
  if (s.fase === "pergunta" && q) {
    const r = s.respostas.get(token);
    Object.assign(v, { pergunta: { id: q.id, texto: q.texto, opcoes: q.opcoes }, restante: Math.max(0, s.inicio + s.tempoMs - agora()), respondeu: !!r, minha: r ? r.resp : null, respondidos: s.respostas.size });
  } else if (s.fase === "resposta" && q) {
    const r = s.respostas.get(token);
    Object.assign(v, { pergunta: { id: q.id, texto: q.texto, opcoes: q.opcoes }, certa: q.certa, explicacao: q.explicacao || "", minha: r ? r.resp : null, ok: !!(r && r.ok), semResposta: !r, ganhos: eu.ult, contagem: contagem(s, q), topo: rk.slice(0, MAX_TOPO).map(({ nome, pontos }) => ({ nome, pontos })), ultima: s.idx + 1 >= s.conteudo.perguntas.length });
  } else if (s.fase === "fim") {
    Object.assign(v, { certas: eu.certas, topo: rk.slice(0, 10).map(({ nome, pontos, certas }) => ({ nome, pontos, certas })) });
  }
  return v;
}

// Vista do professor: tudo, incluindo a resposta certa e quem já respondeu.
function vistaProf(s) {
  avaliar(s);
  const rk = ranking(s), q = pergunta(s);
  const v = { ativo: true, pin: s.pin, revisao: s.revisao, titulo: s.titulo, fase: s.fase, idx: s.idx, total: s.conteudo.perguntas.length, tempo: s.tempoMs, jogadores: [...s.jogadores.values()].map((j) => j.nome).sort((a, b) => a.localeCompare(b, "pt")), ranking: rk.map(({ nome, pontos, certas, ult }) => ({ nome, pontos, certas, ult })) };
  if (q && s.fase !== "sala") {
    Object.assign(v, { pergunta: { id: q.id, texto: q.texto, opcoes: q.opcoes }, respondidos: s.respostas.size, estados: [...s.jogadores.entries()].map(([t, j]) => ({ nome: j.nome, respondeu: s.respostas.has(t) })).sort((a, b) => a.nome.localeCompare(b.nome, "pt")) });
    if (s.fase === "pergunta") v.restante = Math.max(0, s.inicio + s.tempoMs - agora());
    if (s.fase === "resposta" || s.fase === "fim") Object.assign(v, { certa: q.certa, explicacao: q.explicacao || "", contagem: contagem(s, q), semResposta: Math.max(0, s.jogadores.size - s.respostas.size) });
  }
  return v;
}

// Resumo no fim: ranking e % de acertos por pergunta (sem identificar ninguém além da alcunha).
function resumo(s) {
  const n = s.jogadores.size;
  return { ranking: ranking(s).map(({ nome, pontos, certas }) => ({ nome, pontos, certas })), perguntas: s.conteudo.perguntas.map((q) => ({ texto: q.texto, pct: n ? Math.round(([...s.historico.values()].filter((h) => h[q.id] && h[q.id].ok).length / n) * 100) : 0 })) };
}

module.exports = { criar, da, doProf, fechar, entrar, acao, responder, vistaAluno, vistaProf, resumo, limparAntigas, definirAoTerminar: (f) => { aoTerminar = f; } };
