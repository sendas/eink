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
    ["✅", "Chamada", "Presenças por aula", "#/chamada"], ["☑️", "Listas", "Listas de verificação", "#/listas"],
    ["📊", "Sondagem", "Pergunta rápida com código", "#/sondagens"], ["🪑", "Mapa de sala", "Lugares dos alunos", "#/mapa"],
    ["🖼", "Quadros", "Notas e ideias da aula", "#/quadros"], ["🎮", "Quizzes", "Jogo ao vivo estilo Kahoot", "#/quizzes"],
  ]],
];
async function painel() {
  mostrar(`<h1>Olá, ${esc((EINK.eu.nome || "").split(" ")[0])}</h1><p class="pequeno">O que queres fazer hoje?</p><div id="alertas"></div>` + CARTOES.map(([t, l]) => `
    <h2>${t}</h2><div class="cartoes">${l.map(([i, n, d, h]) => `<a class="cartao" href="${h}"><span class="icone" aria-hidden="true">${i}</span><span>${n}<small>${d}</small></span></a>`).join("")}</div>`).join(""));
  // Alunos a acompanhar (nota baixa ou muitas faltas), sem atrasar o painel.
  try {
    const r = await api("GET", "/api/alertas");
    if (r.alertas.length && $("#alertas")) $("#alertas").innerHTML = `<section class="painel aviso-alerta" aria-label="Alunos a acompanhar"><strong>Alunos a acompanhar (${r.alertas.length})</strong> <span class="pequeno">nota abaixo de ${r.limiteNota} % ou ${r.limiteFaltas} ou mais faltas</span>
      <ul class="lista">${r.alertas.slice(0, 8).map((a) => `<li><span>${esc(a.aluno)} <span class="pequeno">${esc(a.turma)}</span></span><span>${a.periodo_id ? `<a href="#/pauta/${a.periodo_id}">${esc(a.motivos.join(" · "))}</a>` : esc(a.motivos.join(" · "))}</span></li>`).join("")}${r.alertas.length > 8 ? `<li class="pequeno">e mais ${r.alertas.length - 8}…</li>` : ""}</ul></section>`;
  } catch { /* o aviso de erro já foi mostrado ou não é essencial */ }
}

// ---------- turmas ----------
async function turmas(arq) {
  const [l, grupos] = await Promise.all([api("GET", "/api/turmas" + (arq ? "?arquivadas=1" : "")), api("GET", "/api/grupos")]);
  const formulario = arq ? '<p class="pequeno">As turmas arquivadas não aparecem nos alertas nem nas ferramentas. São apagadas automaticamente quando passar o prazo de retenção definido pelo administrador.</p>' : `<form class="painel linha" id="f-turma">
      <label>Nome da turma<input name="nome" required maxlength="60" placeholder="7.º A"></label>
      <label>Ano letivo<input name="ano_letivo" maxlength="20" placeholder="2026/2027"></label>
      <label>Ano de escolaridade<select name="ano" required><option value="">Escolhe</option>${[5, 6, 7, 8, 9, 10, 11, 12].map((a) => `<option value="${a}">${a}.º ano</option>`).join("")}</select></label>
      <label>Disciplina / grupo disciplinar<select name="grupo_id">${grupos.map((g) => `<option value="${g.id}" ${g.id === EINK.eu.grupo_id ? "selected" : ""}>${esc(g.nome)}</option>`).join("")}</select></label>
      <button>Criar turma</button>
    </form>`;
  mostrar(`<h1>${arq ? "Turmas arquivadas" : "Turmas"}</h1>
    <p class="linha"><a class="botao sec" href="#/${arq ? "turmas" : "turmas-arquivadas"}">${arq ? "← Turmas ativas" : "Ver turmas arquivadas"}</a>${arq ? "" : '<button class="sec" id="arq-ano" type="button">Arquivar um ano letivo</button>'}</p>
    ${formulario}
    <div class="painel"><ul class="lista">${l.map((t) => `<li><a href="#/turma/${t.id}"><strong>${esc(t.nome)}</strong></a><span class="pequeno">${esc(t.ano_letivo)} · ${esc(t.grupo)}${t.ano ? " · " + t.ano + ".º ano" : ""} · ${t.alunos} alunos</span></li>`).join("") || '<li class="pequeno">Ainda não tens turmas.</li>'}</ul></div>`);
  const arqAno = $("#arq-ano");
  if (arqAno) arqAno.onclick = async () => {
    const ano = prompt("Ano letivo a arquivar (como está nas turmas, por exemplo 2025/2026):");
    if (ano && confirm(`Arquivar todas as tuas turmas do ano letivo ${ano}? Podes voltar a ativá-las.`)) { const r = await api("POST", "/api/turmas/arquivar-ano", { ano_letivo: ano }); aviso(`${r.arquivadas} turma(s) arquivada(s).`); turmas(false); }
  };
  if (!$("#f-turma")) return;
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
    <form class="painel" id="f-alunos"><label>Adicionar alunos: um por linha («12 Ana Silva»), ou cola do Excel (colunas número, nome e email)<textarea name="texto" placeholder="1 Ana Silva&#10;2 Bruno Costa"></textarea></label>
      <p class="linha"><label>Ou escolhe um ficheiro Excel (.xlsx) ou CSV<input type="file" id="f-ficheiro" accept=".xlsx,.csv,.txt"></label></p>
      <p class="pequeno">O ficheiro é lido e os nomes aparecem acima para os reveres antes de adicionares.</p><p><button>Adicionar alunos</button></p></form>
    <p class="linha"><button class="sec" id="arquivar-turma">${t.arquivada ? "Voltar a ativar a turma" : "Arquivar turma"}</button><button class="perigo" id="apagar-turma">Apagar turma</button></p>`);
  $("#arquivar-turma").onclick = async () => { await api("POST", `/api/turmas/${id}/arquivar`, { arquivada: !t.arquivada }); location.hash = "#/turmas"; };
  $("#f-periodo").onsubmit = async (e) => { e.preventDefault(); await api("POST", `/api/turmas/${id}/periodos`, { nome: new FormData(e.target).get("nome") }); turma(id); };
  $("#f-ficheiro").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 700000) return aviso("O ficheiro é demasiado grande (máximo 700 KB).", true);
    const b = new Uint8Array(await f.arrayBuffer()); let bin = ""; for (let i = 0; i < b.length; i += 8192) bin += String.fromCharCode(...b.subarray(i, i + 8192));
    try { const r = await api("POST", "/api/importar/alunos", { nome: f.name, base64: btoa(bin) }); $("#f-alunos textarea").value = r.texto; aviso(`${r.total} alunos lidos. Revê e carrega em «Adicionar alunos».`); } catch { /* aviso mostrado */ }
  };
  $("#f-alunos").onsubmit = async (e) => { e.preventDefault(); const r = await api("POST", `/api/turmas/${id}/alunos`, { texto: new FormData(e.target).get("texto") }); aviso(`${r.adicionados} alunos adicionados.`); turma(id); };
  $$("[data-apagar]").forEach((b) => { b.onclick = async () => { if (confirm("Remover este aluno e as suas notas?")) { await api("DELETE", "/api/alunos/" + b.dataset.apagar); turma(id); } }; });
  $("#apagar-turma").onclick = async () => { if (confirm(`Apagar a turma ${t.nome}, os alunos e todas as notas? Não se pode desfazer.`)) { await api("DELETE", "/api/turmas/" + id); location.hash = "#/turmas"; } };
}

// ---------- rotas ----------
EINK.rotas = [
  [/^$|^\/$/, painel], [/^\/turmas$/, () => turmas(false)], [/^\/turmas-arquivadas$/, () => turmas(true)], [/^\/turma\/(\d+)$/, (id) => turma(+id)],
];
EINK.api = api; EINK.aviso = aviso; EINK.mostrar = mostrar; EINK.esc = esc; EINK.$ = $; EINK.$$ = $$;
