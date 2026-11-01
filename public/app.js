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
  const l = await api("GET", "/api/turmas");
  mostrar(`<h1>Turmas</h1>
    <form class="painel linha" id="f-turma">
      <label>Nome da turma<input name="nome" required maxlength="60" placeholder="7.º A"></label>
      <label>Ano letivo<input name="ano_letivo" maxlength="20" placeholder="2026/2027"></label>
      <button>Criar turma</button>
    </form>
    <div class="painel"><ul class="lista">${l.map((t) => `<li><a href="#/turma/${t.id}"><strong>${esc(t.nome)}</strong></a><span class="pequeno">${esc(t.ano_letivo)} · ${t.alunos} alunos</span></li>`).join("") || '<li class="pequeno">Ainda não tens turmas.</li>'}</ul></div>`);
  $("#f-turma").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const r = await api("POST", "/api/turmas", { nome: f.get("nome"), ano_letivo: f.get("ano_letivo") });
    location.hash = "#/turma/" + r.id;
  };
}

async function turma(id) {
  const t = await api("GET", "/api/turmas/" + id);
  mostrar(`<p><a href="#/turmas">← Turmas</a></p><h1>${esc(t.nome)} <small class="pequeno">${esc(t.ano_letivo)}</small></h1>
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

// ---------- pauta ----------
async function pautaVista(id) {
  const d = await api("GET", `/api/periodos/${id}/pauta`);
  const cab = d.avaliacoes.map((a) => `<th class="num" scope="col">${esc(a.titulo)}<br><span class="pequeno">${esc(a.tipo)} · ${a.peso} % · máx. ${a.maximo}${a.data ? " · " + esc(a.data) : ""}</span><br>
      <button class="sec" data-peso="${a.id}" data-p="${a.peso}">Peso</button> <button class="perigo" data-del="${a.id}" aria-label="Apagar ${esc(a.titulo)}">✕</button></th>`).join("");
  const linhas = d.alunos.map((al) => `<tr data-aluno="${al.id}"><td class="num">${al.numero ?? ""}</td><th scope="row">${esc(al.nome)}</th>
      ${d.avaliacoes.map((a) => { const v = d.notas[a.id + ":" + al.id]; return `<td><input class="nota" inputmode="decimal" data-aval="${a.id}" data-aluno="${al.id}" value="${v === undefined ? "" : num(v, 2)}" aria-label="Nota de ${esc(al.nome)} em ${esc(a.titulo)}"></td>`; }).join("")}
      <td class="num" data-c="media">${num(al.media)}</td>
      <td><select data-comp="${al.id}" aria-label="Comportamento de ${esc(al.nome)}"><option value="">–</option>${[1, 2, 3, 4, 5].map((n) => `<option ${al.comportamento === n ? "selected" : ""}>${n}</option>`).join("")}</select></td>
      <td class="num" data-c="final">${al.final ?? ""}</td><td class="num" data-c="nivel">${al.nivel ?? ""}</td><td data-c="mencao">${esc(al.mencao)}</td></tr>`).join("");
  const soma = d.avaliacoes.reduce((z, a) => z + a.peso, 0);
  mostrar(`<p><a href="#/turma/${d.periodo.turma_id}">← Turma</a></p><h1>${esc(d.periodo.nome)}</h1>
    <form class="painel linha" id="f-aval">
      <label>Título<input name="titulo" required maxlength="80" placeholder="Teste 1"></label>
      <label>Tipo<select name="tipo"><option>teste</option><option>trabalho</option><option>ficha</option><option>oral</option><option>outro</option></select></label>
      <label>Peso (%)<input name="peso" type="number" min="0" max="100" step="any" value="0" style="width:6rem"></label>
      <label>Máximo<input name="maximo" type="number" min="1" step="any" value="100" style="width:6rem"></label>
      <label>Data<input name="data" type="date"></label>
      <button>Adicionar avaliação</button>
    </form>
    <p class="pequeno">Soma dos pesos: ${num(soma)} %. A média usa só as avaliações que o aluno já tem. Podes escrever «15», «15,5» ou «15/20». O comportamento (1 a 5) vale 30 % da nota final.</p>
    <div class="tabela-rolagem"><table><thead><tr><th class="num" scope="col">N.º</th><th scope="col">Aluno</th>${cab}<th class="num" scope="col">Média %</th><th scope="col">Comport.</th><th class="num" scope="col">Final %</th><th class="num" scope="col">Nível</th><th scope="col">Menção</th></tr></thead><tbody>${linhas || '<tr><td colspan="9">Adiciona alunos à turma.</td></tr>'}</tbody></table></div>
    <p><a class="botao sec" href="/api/periodos/${id}/pauta.csv">Exportar CSV (Excel)</a></p>`);

  const pintar = (dd) => dd.alunos.forEach((al) => {
    const tr = $(`tr[data-aluno="${al.id}"]`); if (!tr) return;
    $('[data-c="media"]', tr).textContent = num(al.media); $('[data-c="final"]', tr).textContent = al.final ?? "";
    $('[data-c="nivel"]', tr).textContent = al.nivel ?? ""; $('[data-c="mencao"]', tr).textContent = al.mencao;
    tr.className = al.nivel ? "n" + al.nivel : "";
  });
  pintar(d);
  $("#f-aval").onsubmit = async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    await api("POST", `/api/periodos/${id}/avaliacoes`, { ...f, peso: Number(f.peso), maximo: Number(f.maximo) }); pautaVista(id);
  };
  $$("input.nota").forEach((i) => { i.onchange = async () => {
    try { await api("PUT", `/api/avaliacoes/${i.dataset.aval}/notas`, { linhas: [{ aluno: Number(i.dataset.aluno), nota: i.value }] }); pintar(await api("GET", `/api/periodos/${id}/pauta`)); }
    catch { i.focus(); }
  }; });
  $$("[data-comp]").forEach((s) => { s.onchange = async () => { await api("PUT", `/api/periodos/${id}/comportamento`, { aluno: Number(s.dataset.comp), nivel: s.value || null }); pintar(await api("GET", `/api/periodos/${id}/pauta`)); }; });
  $$("[data-del]").forEach((b) => { b.onclick = async () => { if (confirm("Apagar esta avaliação e as notas?")) { await api("DELETE", "/api/avaliacoes/" + b.dataset.del); pautaVista(id); } }; });
  $$("[data-peso]").forEach((b) => { b.onclick = async () => { const v = prompt("Peso em %", b.dataset.p); if (v !== null) { await api("PATCH", "/api/avaliacoes/" + b.dataset.peso, { peso: Number(String(v).replace(",", ".")) }); pautaVista(id); } }; });
}

// ---------- administração ----------
async function admin() {
  const l = await api("GET", "/api/admin/professores");
  mostrar(`<h1>Docentes com acesso</h1>
    <form class="painel linha" id="f-prof"><label>Email da escola<input name="upn" type="email" required placeholder="nome@escola.pt"></label><label>Nome<input name="nome" maxlength="120"></label><button>Dar acesso</button></form>
    <div class="painel"><ul class="lista">${l.map((p) => `<li><span>${esc(p.upn)} ${p.admin ? "· administrador" : ""} ${p.ativo ? "" : "· desativado"}</span>${p.ativo && p.upn !== EINK.eu.upn ? `<button class="perigo" data-off="${p.id}">Retirar acesso</button>` : ""}</li>`).join("")}</ul></div>`);
  $("#f-prof").onsubmit = async (e) => { e.preventDefault(); const f = new FormData(e.target); await api("POST", "/api/admin/professores", { upn: f.get("upn"), nome: f.get("nome") }); admin(); };
  $$("[data-off]").forEach((b) => { b.onclick = async () => { if (confirm("Retirar o acesso a este docente?")) { await api("DELETE", "/api/admin/professores/" + b.dataset.off); admin(); } }; });
}

// ---------- rotas ----------
EINK.rotas = [
  [/^$|^\/$/, painel], [/^\/turmas$/, turmas], [/^\/turma\/(\d+)$/, (id) => turma(+id)],
  [/^\/pauta\/(\d+)$/, (id) => pautaVista(+id)], [/^\/admin$/, admin],
];
EINK.api = api; EINK.aviso = aviso; EINK.mostrar = mostrar; EINK.esc = esc; EINK.$ = $; EINK.$$ = $$;
