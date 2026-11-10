"use strict";
// Jogo ao vivo de um quiz, estilo Kahoot (portado do tic.techpro.pt): o docente lança as perguntas, os alunos respondem no próprio
// telemóvel (entram com um código e uma alcunha, sem conta) e há ranking por pontos (quanto mais depressa e certo, mais pontos).
// Opções da sessão: equipas (2 a 4, cada aluno escolhe a sua ao entrar), baralhar (perguntas e opções por outra ordem) e
// «ao próprio ritmo» (revisão: cada aluno avança sozinho, sem tempo, e vê a explicação a cada pergunta).
// As sessões vivem em memória, uma por código (PIN), e guardam-se na base de dados a cada mudança para sobreviverem a um reinício.
const crypto = require("node:crypto");

const TEMPO_PADRAO = 20000, MARGEM_REDE = 1500, MAX_TOPO = 5, MAX_JOGADORES = 80, VALIDADE_MS = 4 * 3600000;
const EQUIPAS = ["Vermelha", "Azul", "Amarela", "Verde"];
const sessoes = new Map(); // pin -> sessão
let aoTerminar = () => {};
const agora = () => Date.now();
const erro = (m, codigo = 400) => Object.assign(new Error(m), { codigo });

// Guarda a sessão pouco depois de cada mudança (várias respostas seguidas juntam-se numa só escrita).
const guardarJa = (s) => { s.porGuardar = null; if (s.loja && sessoes.get(s.pin) === s) { try { s.loja.guardar(s.pin, s.profId, serializar(s)); } catch (e) { console.error("Quiz ao vivo: não foi possível guardar a sessão:", e.message); } } };
const avisar = (s) => {
  s.revisao = (s.revisao || 0) + 1;
  if (!s.porGuardar) { s.porGuardar = setTimeout(() => guardarJa(s), 300); s.porGuardar.unref(); }
};
function programar(s) {
  clearTimeout(s.relogio);
  if (s.fase === "pergunta") { s.relogio = setTimeout(() => avaliar(s), Math.max(1, s.inicio + s.tempoMs + MARGEM_REDE - agora())); s.relogio.unref(); }
}
const novoPin = () => { for (let i = 0; i < 100; i++) { const p = String(crypto.randomInt(100000, 1000000)); if (!sessoes.has(p)) return p; } throw erro("Há demasiadas sessões em curso.", 503); };
const baralhar = (l) => { for (let i = l.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [l[i], l[j]] = [l[j], l[i]]; } return l; };

// `loja`: { guardar(pin, profId, texto), apagar(pin) } da base de dados de quem criou a sessão.
function criar({ profId, quizId, titulo, conteudo, equipas = 0, ritmo = false, horas = 4, misturar = false, loja = null }) {
  if (!conteudo || !Array.isArray(conteudo.perguntas) || !conteudo.perguntas.length) throw erro("Este quiz não tem perguntas.");
  limparAntigas();
  const c = JSON.parse(JSON.stringify(conteudo));
  if (misturar || c.baralhar) {
    baralhar(c.perguntas);
    for (const q of c.perguntas) { const ordem = baralhar(q.opcoes.map((_, k) => k)); q.opcoes = ordem.map((k) => conteudo.perguntas.find((x) => x.id === q.id).opcoes[k]); q.certa = ordem.indexOf(q.certa); }
  }
  const nEq = Number.isInteger(equipas) && equipas >= 2 && equipas <= 4 ? equipas : 0;
  const s = {
    pin: novoPin(), profId, quizId, titulo, conteudo: c, criada: agora(), revisao: 0,
    equipas: nEq, ritmo: !!ritmo, validade: ritmo ? Math.min(24, Math.max(1, Number(horas) || 4)) * 3600000 : VALIDADE_MS,
    fase: ritmo ? "livre" : "sala", idx: -1, inicio: 0, tempoMs: c.tempo > 0 ? c.tempo * 1000 : TEMPO_PADRAO,
    jogadores: new Map(), // token -> { nome, pontos, certas, ult, equipa, idx, mostrar }
    respostas: new Map(), // token -> { resp, ms, ok, pontos } só da pergunta em curso
    historico: new Map(), // token -> { qid -> { resp, ok } }
    contagens: {}, // qid -> respostas por opção (para a análise no fim)
  };
  Object.defineProperty(s, "loja", { value: loja, enumerable: false });
  sessoes.set(s.pin, s); avisar(s);
  return s;
}
const da = (pin) => { const s = sessoes.get(String(pin)) || null; if (s && agora() - s.criada > s.validade) { fechar(s.pin); return null; } return s; };
const doProf = (profId) => [...sessoes.values()].filter((s) => s.profId === profId);
const fechar = (pin) => { const s = sessoes.get(String(pin)); if (s) { clearTimeout(s.relogio); clearTimeout(s.porGuardar); sessoes.delete(String(pin)); try { if (s.loja) s.loja.apagar(String(pin)); } catch { /* base de dados já fechada */ } } };
function limparAntigas() { for (const s of sessoes.values()) if (agora() - s.criada > s.validade) fechar(s.pin); }

// ---------- guardar e repor (para sobreviver a uma atualização do servidor a meio da aula) ----------
function serializar(s) {
  const { relogio, porGuardar, jogadores, respostas, historico, ...resto } = s; void relogio; void porGuardar; // «loja» não é enumerável
  return JSON.stringify({ ...resto, jogadores: [...jogadores], respostas: [...respostas], historico: [...historico] });
}
function repor(texto, loja) {
  const d = JSON.parse(texto);
  const s = { ...d, jogadores: new Map(d.jogadores), respostas: new Map(d.respostas), historico: new Map(d.historico), contagens: d.contagens || {}, validade: d.validade || VALIDADE_MS };
  if (agora() - s.criada > s.validade || sessoes.has(s.pin)) return null;
  Object.defineProperty(s, "loja", { value: loja, enumerable: false });
  sessoes.set(s.pin, s); programar(s); avaliar(s);
  return s;
}
// Repõe as sessões guardadas por esta base de dados (no arranque do servidor).
function definirPersistencia(loja) {
  let n = 0;
  for (const t of loja.carregar()) { try { if (repor(t, loja)) n++; } catch (e) { console.error("Quiz ao vivo: sessão guardada ilegível:", e.message); } }
  return n;
}

const pergunta = (s) => s.conteudo.perguntas[s.idx] || null;
const tempoDe = (s) => { const q = pergunta(s); const t = (q && q.tempo) || s.conteudo.tempo; return t > 0 ? t * 1000 : TEMPO_PADRAO; };

// Alcunha: até 16 caracteres, única na sessão (se já existir, junta um número). Com equipas, o aluno escolhe uma.
function entrar(s, token, alcunha, filtro, equipa) {
  if (s.jogadores.has(token)) return s.jogadores.get(token);
  if (s.fase !== "sala" && s.fase !== "livre") throw erro("O jogo já começou.", 409);
  if (s.jogadores.size >= MAX_JOGADORES) throw erro("A sala está cheia.", 409);
  let nome = String(alcunha || "").replace(/[\u0000-\u001F<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 16);
  if (!nome) throw erro("Escolhe uma alcunha.");
  if (filtro && filtro(nome)) throw erro("Escolhe outra alcunha.");
  let eq = null;
  if (s.equipas) { eq = Number(equipa); if (!Number.isInteger(eq) || eq < 0 || eq >= s.equipas) throw erro("Escolhe a tua equipa."); }
  const existentes = new Set([...s.jogadores.values()].map((j) => j.nome.toLowerCase()));
  let final = nome, k = 2;
  while (existentes.has(final.toLowerCase())) final = `${nome.slice(0, 13)} ${k++}`;
  const j = { nome: final, pontos: 0, certas: 0, ult: 0, equipa: eq, idx: 0, mostrar: false };
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
  s.contagens[q.id] = contagem(s, q);
  s.fase = "resposta"; clearTimeout(s.relogio); avisar(s);
}

const ranking = (s) => [...s.jogadores.entries()].map(([token, j]) => ({ token, nome: j.nome, pontos: j.pontos, certas: j.certas, ult: j.ult, equipa: j.equipa }))
  .sort((a, b) => b.pontos - a.pontos || b.certas - a.certas || a.nome.localeCompare(b.nome, "pt"));
// Classificação das equipas pela média de pontos (assim uma equipa maior não ganha só por ter mais gente).
const rankingEquipas = (s) => !s.equipas ? [] : EQUIPAS.slice(0, s.equipas).map((nome, i) => {
  const m = [...s.jogadores.values()].filter((j) => j.equipa === i), pontos = m.reduce((z, j) => z + j.pontos, 0);
  return { equipa: i, nome, membros: m.length, pontos, media: m.length ? Math.round(pontos / m.length) : 0 };
}).sort((a, b) => b.media - a.media || b.pontos - a.pontos);

function acao(s, nome) {
  avaliar(s);
  if (s.ritmo) {
    if (nome !== "terminar") throw erro("Na revisão ao próprio ritmo cada aluno avança sozinho.");
    if (s.fase === "fim") return;
    s.fase = "fim";
    try { aoTerminar(s, ranking(s)); } catch (e) { console.error("Quiz ao próprio ritmo: falha ao guardar o resultado:", e.message); }
    avisar(s); return;
  }
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
  const j = s.jogadores.get(token);
  if (s.ritmo) {
    if (s.fase !== "livre") throw erro("A revisão já terminou.");
    if (!j) throw erro("Entra primeiro no jogo.");
    const q = s.conteudo.perguntas[j.idx];
    if (!q || j.mostrar || q.id !== qid || !Number.isInteger(k) || k < 0 || k >= q.opcoes.length) throw erro("Resposta inválida.");
    const ok = k === q.certa, h = s.historico.get(token) || {};
    h[q.id] = { resp: k, ok }; s.historico.set(token, h);
    j.ult = ok ? 1000 : 0; j.pontos += j.ult; if (ok) j.certas++; j.mostrar = true;
    (s.contagens[q.id] = s.contagens[q.id] || q.opcoes.map(() => 0))[k]++;
    avisar(s); return;
  }
  if (s.fase !== "pergunta") throw erro("Já não podes responder a esta pergunta.");
  const q = pergunta(s);
  if (!q || q.id !== qid || !Number.isInteger(k) || k < 0 || k >= q.opcoes.length) throw erro("Resposta inválida.");
  if (!j) throw erro("Entra primeiro no jogo.");
  if (s.respostas.has(token)) return; // a primeira resposta é a que conta
  if (agora() > s.inicio + s.tempoMs + MARGEM_REDE) throw erro("O tempo acabou.");
  const ms = Math.min(Math.max(0, agora() - s.inicio), s.tempoMs);
  const ok = k === q.certa;
  s.respostas.set(token, { resp: k, ms, ok, pontos: ok ? Math.round(1000 * (1 - ms / s.tempoMs / 2)) : 0 }); avisar(s);
  avaliar(s);
}
// Ao próprio ritmo: depois de ver a explicação, o aluno passa à pergunta seguinte.
function seguinte(s, token) {
  const j = s.jogadores.get(token);
  if (!s.ritmo || !j) throw erro("Entra primeiro no jogo.");
  if (j.mostrar) { j.mostrar = false; j.idx++; avisar(s); }
}

const posicao = (rk, token) => { const i = rk.findIndex((x) => x.token === token); return i < 0 ? 0 : i + 1; };
const contagem = (s, q) => { const c = q.opcoes.map(() => 0); for (const x of s.respostas.values()) c[x.resp]++; return c; };
const opcoesEquipas = (s) => EQUIPAS.slice(0, s.equipas);

// Vista do aluno: nada de resposta certa enquanto a pergunta está aberta.
function vistaAluno(s, token) {
  avaliar(s);
  const rk = ranking(s), eu = s.jogadores.get(token);
  const v = { ativo: true, entrou: !!eu, nome: eu ? eu.nome : "", revisao: s.revisao, titulo: s.titulo, fase: s.fase, ritmo: s.ritmo, idx: s.idx, total: s.conteudo.perguntas.length, jogadores: s.jogadores.size, tempo: s.tempoMs, pontos: eu ? eu.pontos : 0, posicao: posicao(rk, token), equipas: opcoesEquipas(s), equipa: eu ? eu.equipa : null };
  if (!eu) return v;
  if (s.ritmo && s.fase === "livre") {
    const q = s.conteudo.perguntas[eu.idx];
    v.idx = eu.idx; v.certas = eu.certas;
    if (!q) return Object.assign(v, { concluido: true });
    v.pergunta = { id: q.id, texto: q.texto, opcoes: q.opcoes, imagem: q.imagem || 0 };
    if (eu.mostrar) { const h = (s.historico.get(token) || {})[q.id] || {}; Object.assign(v, { mostrar: true, certa: q.certa, minha: h.resp, ok: !!h.ok, explicacao: q.explicacao || "", ultima: eu.idx + 1 >= s.conteudo.perguntas.length }); }
    return v;
  }
  const q = pergunta(s);
  if (s.fase === "pergunta" && q) {
    const r = s.respostas.get(token);
    Object.assign(v, { pergunta: { id: q.id, texto: q.texto, opcoes: q.opcoes, imagem: q.imagem || 0 }, restante: Math.max(0, s.inicio + s.tempoMs - agora()), respondeu: !!r, minha: r ? r.resp : null, respondidos: s.respostas.size });
  } else if (s.fase === "resposta" && q) {
    const r = s.respostas.get(token);
    Object.assign(v, { pergunta: { id: q.id, texto: q.texto, opcoes: q.opcoes, imagem: q.imagem || 0 }, certa: q.certa, explicacao: q.explicacao || "", minha: r ? r.resp : null, ok: !!(r && r.ok), semResposta: !r, ganhos: eu.ult, contagem: contagem(s, q), topo: rk.slice(0, MAX_TOPO).map(({ nome, pontos }) => ({ nome, pontos })), topoEquipas: rankingEquipas(s), ultima: s.idx + 1 >= s.conteudo.perguntas.length });
  } else if (s.fase === "fim") {
    Object.assign(v, { certas: eu.certas, topo: rk.slice(0, 10).map(({ nome, pontos, certas }) => ({ nome, pontos, certas })), topoEquipas: rankingEquipas(s) });
  }
  return v;
}

// Vista do professor: tudo, incluindo a resposta certa e quem já respondeu.
function vistaProf(s) {
  avaliar(s);
  const rk = ranking(s), q = pergunta(s);
  const v = { ativo: true, pin: s.pin, revisao: s.revisao, titulo: s.titulo, fase: s.fase, ritmo: s.ritmo, idx: s.idx, total: s.conteudo.perguntas.length, tempo: s.tempoMs, jogadores: [...s.jogadores.values()].map((j) => j.nome).sort((a, b) => a.localeCompare(b, "pt")), ranking: rk.map(({ nome, pontos, certas, ult, equipa }) => ({ nome, pontos, certas, ult, equipa })), equipas: rankingEquipas(s), nomesEquipas: opcoesEquipas(s), expira: s.criada + s.validade };
  if (s.ritmo) {
    const js = [...s.jogadores.values()];
    return Object.assign(v, { concluiram: js.filter((j) => j.idx >= s.conteudo.perguntas.length).length, perguntas: analise(s) });
  }
  if (q && s.fase !== "sala") {
    Object.assign(v, { pergunta: { id: q.id, texto: q.texto, opcoes: q.opcoes, imagem: q.imagem || 0 }, respondidos: s.respostas.size, estados: [...s.jogadores.entries()].map(([t, j]) => ({ nome: j.nome, respondeu: s.respostas.has(t) })).sort((a, b) => a.nome.localeCompare(b.nome, "pt")) });
    if (s.fase === "pergunta") v.restante = Math.max(0, s.inicio + s.tempoMs - agora());
    if (s.fase === "resposta" || s.fase === "fim") Object.assign(v, { certa: q.certa, explicacao: q.explicacao || "", contagem: contagem(s, q), semResposta: Math.max(0, s.jogadores.size - s.respostas.size) });
  }
  if (s.fase === "fim") v.perguntas = analise(s);
  return v;
}

// Por pergunta: % de acertos entre quem respondeu (ou entre todos, no jogo ao vivo), as respostas por opção e a opção errada mais escolhida.
function analise(s) {
  const n = s.jogadores.size;
  return s.conteudo.perguntas.map((q) => {
    const c = s.contagens[q.id] || q.opcoes.map(() => 0), resp = c.reduce((z, x) => z + x, 0);
    const base = s.ritmo ? resp : n, certas = [...s.historico.values()].filter((h) => h[q.id] && h[q.id].ok).length;
    let errada = -1; c.forEach((x, k) => { if (k !== q.certa && x > 0 && (errada < 0 || x > c[errada])) errada = k; });
    return { texto: q.texto, opcoes: q.opcoes, certa: q.certa, contagem: c, respostas: resp, pct: base ? Math.round((certas / base) * 100) : 0, errada };
  });
}

// Resumo no fim: ranking, equipas e a análise por pergunta (sem identificar ninguém além da alcunha).
function resumo(s) {
  return { ranking: ranking(s).map(({ nome, pontos, certas, equipa }) => ({ nome, pontos, certas, ...(s.equipas ? { equipa: EQUIPAS[equipa] } : {}) })), equipas: rankingEquipas(s), ritmo: s.ritmo, perguntas: analise(s) };
}

module.exports = { criar, da, doProf, fechar, entrar, acao, responder, seguinte, vistaAluno, vistaProf, resumo, limparAntigas, definirPersistencia, EQUIPAS, definirAoTerminar: (f) => { aoTerminar = f; } };
