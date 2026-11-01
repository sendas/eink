"use strict";
// Núcleo da interface: pedidos à API, rotas por «#/…» e as vistas de turmas e avaliação.
// As ferramentas de sala (temporizador, sorteio…) estão em ferramentas.js e registam-se em EINK.vistas.
const EINK = { vistas: [], eu: null };

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let tAviso;
function aviso(msg, mau) {
  const el = $("#aviso");
  el.textContent = msg; el.className = "ver" + (mau ? " mau" : "");
  clearTimeout(tAviso); tAviso = setTimeout(() => { el.className = ""; }, 3500);
}

async function api(metodo, url, corpo) {
  const r = await fetch(url, {
    method: metodo,
    headers: { "X-Requested-With": "eink", ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  if (r.status === 401) { location.href = "/entrar.html"; throw new Error("Sessão terminada."); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.erro || "Erro."); aviso(e.message, true); throw e; }
  return d;
}

const vista = $("#vista");
function mostrar(html) { vista.innerHTML = html; }
const num = (v, casas = 1) => (v === null || v === undefined ? "" : String(Math.round(v * 10 ** casas) / 10 ** casas).replace(".", ","));

// ---------- painel ----------
const CARTOES = [
  ["Avaliação", [["👥", "Turmas e alunos", "Gerir turmas e listas", "#/turmas"], ["📋", "Pauta e avaliação", "Testes, períodos e notas", "#/turmas"]]],
  ["Ferramentas de sala", [
    ["⏱", "Temporizador", "Contagem decrescente", "#/temporizador"], ["🔀", "Sorteio", "Aluno ou grupos ao acaso", "#/sorteio"],
    ["🔊", "Medidor de ruído", "Pelo microfone", "#/ruido"], ["✅", "Chamada", "Presenças por aula", "#/chamada"], ["☑️", "Listas", "Listas de verificação", "#/listas"],
  ]],
  ["Em breve", [["📊", "Sondagem", "", ""], ["🪑", "Mapa de sala", "", ""], ["🖼", "Quadros", "", ""]]],
];
function painel() {
  mostrar(`<h1>Olá, ${esc((EINK.eu.nome || "").split(" ")[0])}</h1><p class="pequeno">O que queres fazer hoje?</p>` + CARTOES.map(([t, l]) => `
    <h2>${t}</h2><div class="cartoes">${l.map(([i, n, d, h]) => h
      ? `<a class="cartao" href="${h}"><span class="icone" aria-hidden="true">${i}</span><span>${n}<small>${d}</small></span></a>`
      : `<div class="cartao breve"><span class="icone" aria-hidden="true">${i}</span><span>${n}<small>Em breve</small></span></div>`).join("")}</div>`).join(""));
}

// ---------- turmas ----------
async function turmas() {
  const [l, grupos] = await Promise.all([api("GET", "/api/turmas"), api("GET", "/api/grupos")]);
  mostrar(`<h1>Turmas</h1>
    <form class="painel linha" id="f-turma">
      <label>Nome da turma<input name="nome" required maxlength="60" placeholder="7.º A"></label>
      <label>Ano letivo<input name="ano_letivo" maxlength="20" placeholder="2026/2027"></label>
      <label>Ano de escolaridade<select name="ano" required><option value="">Escolhe</option>${[5, 6, 7, 8, 9, 10, 11, 12].map((a) => `<option value="${a}">${a}.º ano</option>`).join("")}</select></label>
      <label>Disciplina / grupo disciplinar<select name="grupo_id">${grupos.map((g) => `<option value="${g.id}" ${g.id === EINK.eu.grupo_id ? "selected" : ""}>${esc(g.nome)}</option>`).join("")}</select></label>
      <button>Criar turma</button>
    </form>
    <div class="painel"><ul class="lista">${l.map((t) => `<li><a href="#/turma/${t.id}"><strong>${esc(t.nome)}</strong></a><span class="pequeno">${esc(t.ano_letivo)} · ${esc(t.grupo)}${t.ano ? " · " + t.ano + ".º ano" : ""} · ${t.alunos} alunos</span></li>`).join("") || '<li class="pequeno">Ainda não tens turmas.</li>'}</ul></div>`);
  $("#f-turma").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const r = await api("POST", "/api/turmas", { nome: f.get("nome"), ano_letivo: f.get("ano_letivo"), ano: Number(f.get("ano")), grupo_id: Number(f.get("grupo_id")) });
    location.hash = "#/turma/" + r.id;
  };
}

async function turma(id) {
  const t = await api("GET", "/api/turmas/" + id);
  mostrar(`<p><a href="#/turmas">← Turmas</a></p><h1>${esc(t.nome)} <small class="pequeno">${esc(t.ano_letivo)}</small></h1>
    <h2>Critérios de avaliação · ${esc(t.grupo.nome)} · ${t.grupo.ano ? t.grupo.ano + ".º ano" : "todos os anos"}</h2>
    <div class="painel"><ul class="lista">${t.grupo.criterios.map((k) => `<li><span>${esc(k.nome)} <span class="pequeno">${k.tipo === "nivel" ? "nível 1 a 5, dado por ti" : "média dos testes e trabalhos que lançares"}</span></span><strong>${k.peso} %</strong></li>`).join("")}</ul>
      <p class="pequeno">Definidos pelo administrador para esta disciplina e ano. A nota final é a média destes critérios pelos seus pesos.</p></div>
    <h2>Períodos e avaliação</h2>
    <div class="painel"><ul class="lista">${t.periodos.map((p) => `<li><a href="#/pauta/${p.id}"><strong>${esc(p.nome)}</strong></a><a class="botao sec" href="#/pauta/${p.id}">Abrir pauta</a></li>`).join("")}</ul>
      <form class="linha" id="f-periodo"><label>Novo período<input name="nome" required maxlength="60" placeholder="Intercalar"></label><button class="sec">Adicionar</button></form></div>
    <h2>Alunos (${t.alunos.length})</h2>
    <div class="painel"><ul class="lista">${t.alunos.map((a) => `<li><span>${a.numero ?? ""} ${esc(a.nome)}</span><button class="perigo" data-apagar="${a.id}" aria-label="Remover ${esc(a.nome)}">Remover</button></li>`).join("") || '<li class="pequeno">Sem alunos.</li>'}</ul></div>
    <form class="painel" id="f-alunos"><label>Adicionar alunos (um por linha, número opcional: «12 Ana Silva»)<textarea name="texto" placeholder="1 Ana Silva&#10;2 Bruno Costa"></textarea></label><p><button>Adicionar alunos</button></p></form>
    <p><button class="perigo" id="apagar-turma">Apagar turma</button></p>`);
  $("#f-periodo").onsubmit = async (e) => { e.preventDefault(); await api("POST", `/api/turmas/${id}/periodos`, { nome: new FormData(e.target).get("nome") }); turma(id); };
  $("#f-alunos").onsubmit = async (e) => { e.preventDefault(); const r = await api("POST", `/api/turmas/${id}/alunos`, { texto: new FormData(e.target).get("texto") }); aviso(`${r.adicionados} alunos adicionados.`); turma(id); };
  $$("[data-apagar]").forEach((b) => { b.onclick = async () => { if (confirm("Remover este aluno e as suas notas?")) { await api("DELETE", "/api/alunos/" + b.dataset.apagar); turma(id); } }; });
  $("#apagar-turma").onclick = async () => { if (confirm(`Apagar a turma ${t.nome}, os alunos e todas as notas? Não se pode desfazer.`)) { await api("DELETE", "/api/turmas/" + id); location.hash = "#/turmas"; } };
}

// ---------- rotas ----------
EINK.rotas = [
  [/^$|^\/$/, painel], [/^\/turmas$/, turmas], [/^\/turma\/(\d+)$/, (id) => turma(+id)],
];
EINK.api = api; EINK.aviso = aviso; EINK.mostrar = mostrar; EINK.esc = esc; EINK.$ = $; EINK.$$ = $$;
