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
  if (r.status === 401) { location.href = "/entrar.html"; const e = new Error("Sessão terminada."); e.mostrado = true; throw e; }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.erro || "Erro."); e.mostrado = true; aviso(e.message, true); throw e; }
  return d;
}

const vista = $("#vista");
function mostrar(html) { vista.innerHTML = html; }
const num = (v, casas = 1) => (v === null || v === undefined ? "" : String(Math.round(v * 10 ** casas) / 10 ** casas).replace(".", ","));

// ---------- painel: ver inicio.js ----------
// Aviso (só para administradores) quando o segredo da aplicação no Entra está perto de expirar: depois disso ninguém consegue entrar.
function avisoSegredo() {
  const s = EINK.eu && EINK.eu.segredo;
  if (!s || s.dias > 60) return "";
  return `<p class="banner-fechado" role="alert"><strong>${s.dias < 0 ? "O segredo do Microsoft Entra expirou" : `O segredo do Microsoft Entra expira em ${s.dias} dia(s)`}</strong> (${s.expira}). ${s.dias < 0 ? "Ninguém consegue entrar até ser renovado." : "Depois dessa data ninguém consegue entrar."} No Entra: Registos de aplicações → a aplicação Eça Avalia → Certificados e segredos → novo segredo; depois atualiza <code>CLIENT_SECRET</code> e <code>CLIENT_SECRET_EXPIRA</code> no <code>.env</code> e reinicia.</p>`;
}
EINK.avisoSegredo = avisoSegredo;
async function painel() { return EINK.inicio(); }

// ---------- turmas ----------
async function turmas(arq) {
  const [l, grupos] = await Promise.all([api("GET", "/api/turmas" + (arq ? "?arquivadas=1" : "")), api("GET", "/api/disciplinas")]);
  const opcaoDisc = (g, sel) => `<option value="${g.id}" data-anos="${g.anos.join(",")}" ${g.id === sel ? "selected" : ""}>${esc(g.nome)}</option>`;
  const minhas = grupos.filter((g) => g.escolhida), outras = grupos.filter((g) => !g.escolhida), porDefeito = (minhas[0] || {}).id ?? EINK.eu.grupo_id;
  const formulario = arq ? '<p class="pequeno">As turmas arquivadas não aparecem nos alertas nem nas ferramentas. São apagadas automaticamente quando passar o prazo de retenção definido pelo administrador.</p>' : `<form class="painel linha" id="f-turma">
      <label>Nome da turma<input name="nome" required maxlength="60" placeholder="7.º A"></label>
      <label>Ano letivo<input name="ano_letivo" maxlength="20" placeholder="2026/2027"></label>
      <label>Ano de escolaridade<select name="ano" required><option value="">Escolhe</option>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((a) => `<option value="${a}">${a}.º ano</option>`).join("")}</select></label>
      <label>Disciplina<select name="grupo_id">${minhas.length ? `<optgroup label="As minhas disciplinas">${minhas.map((g) => opcaoDisc(g, porDefeito)).join("")}</optgroup>` : ""}<optgroup label="${minhas.length ? "Outras disciplinas" : "Disciplinas"}">${outras.map((g) => opcaoDisc(g, porDefeito)).join("")}</optgroup></select></label>
      <button>Criar turma</button><button class="sec" type="button" id="esc-disc">Escolher as minhas disciplinas</button>
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
  if ($("#esc-disc")) $("#esc-disc").onclick = () => EINK.escolherDisciplinas(() => turmas(arq));
  // Ao escolher o ano, passa para a primeira das tuas disciplinas que tem critérios para esse ano.
  if ($("#f-turma")) $("#f-turma [name=ano]").onchange = (e) => {
    const ano = e.target.value, sel = $("#f-turma [name=grupo_id]"), tem = (o) => (o.dataset.anos || "").split(",").includes(ano);
    if (!ano || tem(sel.selectedOptions[0])) return;
    const prox = [...sel.options].find((o) => o.parentElement.label === "As minhas disciplinas" && tem(o)); if (prox) sel.value = prox.value;
  };
  if (!$("#f-turma")) return;
  $("#f-turma").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const r = await api("POST", "/api/turmas", { nome: f.get("nome"), ano_letivo: f.get("ano_letivo"), ano: Number(f.get("ano")), grupo_id: Number(f.get("grupo_id")) });
    location.hash = "#/turma/" + r.id;
  };
}

// Fotografias em lote: liga cada ficheiro a um aluno pelo número (12.jpg) ou pelo nome (Ana Silva.jpg), mostra o resultado e só grava depois de confirmado.
function ligarFotosLote(alunos, turmaId) {
  const entrada = $("#f-fotos-lote"); if (!entrada) return;
  const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const acharAluno = (ficheiro) => {
    const base = ficheiro.name.replace(/\.[^.]+$/, "").trim();
    if (/^\d{1,3}$/.test(base)) { const a = alunos.find((x) => x.numero === Number(base)); return a ? a.id : null; }
    const palavras = norm(base).split(" ").filter((w) => w.length > 1); if (!palavras.length) return null;
    const cand = alunos.filter((a) => { const nome = norm(a.nome).split(" "); return palavras.every((w) => nome.includes(w)); });
    return cand.length === 1 ? cand[0].id : null;
  };
  entrada.onchange = () => {
    const ficheiros = [...entrada.files]; if (!ficheiros.length) return;
    if (ficheiros.length > 120) { aviso("Escolhe no máximo 120 fotografias de cada vez.", true); return; }
    const lig = ficheiros.map((f) => acharAluno(f)), res = $("#fotos-lote-res");
    const opcoes = (sel) => `<option value="">Não usar</option>` + alunos.map((a) => `<option value="${a.id}" ${a.id === sel ? "selected" : ""}>${a.numero ?? ""} ${esc(a.nome)}</option>`).join("");
    res.innerHTML = `<div class="tabela-rolagem"><table><thead><tr><th>Ficheiro</th><th>Aluno</th></tr></thead><tbody>${ficheiros.map((f, i) => `<tr class="${lig[i] ? "" : "n1"}"><td>${esc(f.name)}</td><td><select data-i="${i}">${opcoes(lig[i])}</select></td></tr>`).join("")}</tbody></table></div>
      <p id="fotos-lote-conta" class="pequeno"></p><p><button type="button" id="fotos-lote-ok">Guardar as fotografias ligadas</button></p>`;
    const conta = () => {
      const ids = $$("#fotos-lote-res select").map((x) => x.value).filter(Boolean), rep = ids.length - new Set(ids).size;
      $("#fotos-lote-conta").textContent = `${ids.length} de ${ficheiros.length} ligadas${rep ? `. Atenção: ${rep} aluno(s) com mais do que uma fotografia (fica a última).` : "."}`;
      $("#fotos-lote-ok").disabled = !ids.length;
    };
    $$("#fotos-lote-res select").forEach((x) => { x.onchange = () => { x.closest("tr").className = x.value ? "" : "n1"; conta(); }; }); conta();
    $("#fotos-lote-ok").onclick = async () => {
      const pares = $$("#fotos-lote-res select").filter((x) => x.value).map((x) => [Number(x.value), ficheiros[Number(x.dataset.i)]]);
      $("#fotos-lote-ok").disabled = true; let feitas = 0;
      for (const [alunoId, f] of pares) { try { await EINK.guardarFoto(alunoId, f); feitas++; $("#fotos-lote-conta").textContent = `A guardar… ${feitas} de ${pares.length}`; } catch (e) { aviso(`${f.name}: ${e.message}`, true); } }
      aviso(`${feitas} fotografia(s) guardada(s).`); turma(turmaId);
    };
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
    <details class="painel" id="fotos-pdf"><summary><strong>Fotografias da turma a partir de um PDF ou imagem</strong> <span class="pequeno">reconhece cada fotografia e o nome por baixo</span></summary>
      <p class="pequeno">Escolhe o PDF (ou uma imagem) com as fotografias da turma. Encontro as fotografias, leio os nomes e ligo cada uma ao aluno. Vês tudo antes de guardar. O ficheiro nunca sai do teu computador: só ficam guardados os recortes das fotografias.</p>
      <p class="linha"><label>PDF ou imagem da turma<input type="file" id="f-fotos-pdf" accept="application/pdf,image/*"></label></p><p id="fotos-pdf-estado" class="pequeno" role="status"></p><div id="fotos-pdf-res"></div></details>
    <details class="painel" id="fotos-lote"><summary><strong>Fotografias dos alunos (várias de uma vez)</strong> <span class="pequeno">o nome de cada ficheiro diz de quem é</span></summary>
      <p class="pequeno">Escolhe várias fotografias. Cada ficheiro deve chamar-se com o <strong>número do aluno</strong> (por exemplo <code>12.jpg</code>) ou com o <strong>nome</strong> (<code>Ana Silva.jpg</code>). Antes de guardar, vês a quem cada uma foi ligada e podes corrigir. As imagens são cortadas e reduzidas no navegador.</p>
      <p class="linha"><label>Fotografias<input type="file" id="f-fotos-lote" accept="image/*" multiple></label></p><div id="fotos-lote-res"></div></details>
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
  ligarFotosLote(t.alunos, id);
  if (EINK.ligarFotosPdf) EINK.ligarFotosPdf(t.alunos, () => turma(id));
  $("#apagar-turma").onclick = async () => { if (confirm(`Apagar a turma ${t.nome}, os alunos e todas as notas? Não se pode desfazer.`)) { await api("DELETE", "/api/turmas/" + id); location.hash = "#/turmas"; } };
}

// ---------- rotas ----------
EINK.rotas = [
  [/^$|^\/$/, painel], [/^\/turmas$/, () => turmas(false)], [/^\/turmas-arquivadas$/, () => turmas(true)], [/^\/turma\/(\d+)$/, (id) => turma(+id)],
];
EINK.api = api; EINK.aviso = aviso; EINK.mostrar = mostrar; EINK.esc = esc; EINK.$ = $; EINK.$$ = $$;
