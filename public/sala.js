"use strict";
// Ferramentas de sala com dados guardados: sondagens, mapa de sala e quadros.
(() => {
  const { api, aviso, mostrar, esc, $, $$ } = EINK;
  const voltar = '<p><a href="#/">← Painel</a></p>';
  const pararDepois = [];
  const aoSairAnt = EINK.aoSair;
  EINK.aoSair = () => { aoSairAnt && aoSairAnt(); while (pararDepois.length) pararDepois.pop()(); };
  const qrSvg = (url, tam = 6) => { try { const qr = window.qrcode(0, "M"); qr.addData(url); qr.make(); return qr.createSvgTag({ cellSize: tam, margin: 2, scalable: true }); } catch { return ""; } };

  // ---------- sondagens ----------
  async function sondagens() {
    const l = await api("GET", "/api/sondagens");
    mostrar(`${voltar}<h1>Sondagens</h1>
      <p class="pequeno">Faz uma pergunta rápida à turma. Os alunos votam no telemóvel, abrindo o endereço ou lendo o código QR, sem conta nem nome. Vês os resultados em direto.</p>
      <form class="painel" id="f-sond"><label>Pergunta<input name="pergunta" required maxlength="200" placeholder="Qual destas aplicações usas mais?"></label>
        <label class="inline"><input type="checkbox" name="aberta" id="s-aberta"> Resposta aberta (os alunos escrevem uma palavra ou frase curta e vês uma nuvem de palavras)</label>
        <label id="s-opcoes-l">Opções (uma por linha, de 2 a 8)<textarea name="opcoes" id="s-opcoes" rows="4" required placeholder="Instagram&#10;TikTok&#10;WhatsApp"></textarea></label>
        <p class="linha"><button>Criar sondagem</button><button type="button" class="sec" id="s-simnao">Sim / Não</button><button type="button" class="sec" id="s-escala">Escala 1 a 5</button></p></form>
      <h2>Anteriores</h2><div class="painel"><ul class="lista">${l.map((s) => `<li><a href="#/sondagem/${s.id}"><strong>${esc(s.pergunta)}</strong></a><span class="pequeno">${s.total} ${s.tipo === "aberta" ? "respostas" : "votos"} · ${s.aberta ? "aberta" : "fechada"}</span></li>`).join("") || '<li class="pequeno">Ainda não fizeste sondagens.</li>'}</ul></div>`);
    $("#s-simnao").onclick = () => { $("#f-sond [name=opcoes]").value = "Sim\nNão"; };
    $("#s-escala").onclick = () => { $("#f-sond [name=opcoes]").value = "1\n2\n3\n4\n5"; };
    $("#s-aberta").onchange = (e) => { $("#s-opcoes-l").hidden = e.target.checked; $("#s-opcoes").required = !e.target.checked; };
    $("#f-sond").onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target), aberta = $("#s-aberta").checked;
      const r = await api("POST", "/api/sondagens", { pergunta: f.get("pergunta"), tipo: aberta ? "aberta" : "escolha", opcoes: aberta ? [] : String(f.get("opcoes")).split(/\r?\n/) });
      location.hash = "#/sondagem/" + r.id;
    };
  }
  // Nuvem de palavras: o tamanho de cada palavra cresce com o número de pessoas que a escreveram.
  function nuvem(s) {
    const max = Math.max(1, ...s.palavras.map((p) => p.n));
    const cloud = s.palavras.map((p, i) => `<span class="nv c${i % 5}" style="font-size:${(1 + (p.n / max) * 2.6).toFixed(2)}rem" title="${p.n} resposta(s)">${esc(p.palavra)}</span>`).join(" ");
    return `<div class="nuvem" role="img" aria-label="Nuvem de palavras">${cloud || '<span class="pequeno">À espera das primeiras respostas…</span>'}</div>
      <details><summary>Ver as ${s.respostas.length} respostas</summary><ul class="lista">${s.respostas.map((r) => `<li><span>${esc(r.texto)}</span><button class="perigo" data-rm="${r.id}" aria-label="Tirar a resposta ${esc(r.texto)}">✕</button></li>`).join("")}</ul></details>`;
  }
  async function sondagem(id) {
    let primeira = true;
    const url = (c) => `${location.origin}/s/${c}`;
    const desenhar = (s) => {
      const max = Math.max(1, ...s.votos);
      const barras = s.tipo === "aberta" ? nuvem(s) : s.opcoes.map((o, i) => `<div class="s-linha"><div class="s-nome">${esc(o)}</div><div class="s-barra"><div class="s-enche c${i % 5}" style="width:${(s.votos[i] / max) * 100}%"></div></div><div class="s-valor"><strong>${s.votos[i]}</strong> <span class="pequeno">${s.total ? Math.round((s.votos[i] / s.total) * 100) : 0} %</span></div>
        <div class="linha"><button class="sec" data-d="-1" data-k="${i}" aria-label="Menos um voto em ${esc(o)}">−</button><button class="sec" data-d="1" data-k="${i}" aria-label="Mais um voto em ${esc(o)}">+</button></div></div>`).join("");
      if (primeira) {
        primeira = false;
        mostrar(`<p><a href="#/sondagens">← Sondagens</a></p><h1>${esc(s.pergunta)}</h1>
          <div class="painel linha s-topo"><div class="s-qr" aria-label="Código QR da sondagem">${qrSvg(url(s.codigo))}</div><div><p class="pequeno">Os alunos abrem:</p><p class="s-url">${esc(url(s.codigo).replace(/^https?:\/\//, ""))}</p><p>Código <strong class="s-codigo">${esc(s.codigo)}</strong></p><p class="pequeno" id="s-estado"></p></div></div>
          <div id="s-res"></div><p class="linha"><button id="s-fechar" class="sec"></button><button id="s-repor" class="sec">Repor votos</button><button id="s-apagar" class="perigo">Apagar</button></p>
          <p class="pequeno">${s.tipo === "aberta" ? "Cada aluno pode enviar até 3 respostas curtas. Não se guarda quem respondeu; podes tirar uma resposta imprópria com ✕." : "Os botões − e + servem para contar «mãos no ar» na sala. Os votos são só contagens: não se guarda quem votou."}</p>`);
        $("#s-fechar").onclick = async () => { await api("POST", `/api/sondagens/${id}/estado`, { aberta: !ultima.aberta }); atualizar(); };
        $("#s-repor").onclick = async () => { if (confirm("Voltar a pôr os votos a zero?")) { await api("POST", `/api/sondagens/${id}/repor`, {}); atualizar(); } };
        $("#s-apagar").onclick = async () => { if (confirm("Apagar esta sondagem?")) { await api("DELETE", `/api/sondagens/${id}`); location.hash = "#/sondagens"; } };
        $("#s-res").onclick = async (e) => {
          const x = e.target.closest("[data-rm]"); if (x) { await api("DELETE", `/api/sondagens/${id}/respostas/${x.dataset.rm}`); atualizar(); return; } const b = e.target.closest("[data-k]"); if (b) { await api("POST", `/api/sondagens/${id}/voto`, { opcao: Number(b.dataset.k), delta: Number(b.dataset.d) }); atualizar(); } };
      }
      $("#s-res").innerHTML = barras;
      $("#s-estado").textContent = `${s.total} ${s.tipo === "aberta" ? "respostas" : "votos"} · ${s.aberta ? "votação aberta" : "votação fechada"}`;
      $("#s-fechar").textContent = s.aberta ? "Fechar votação" : "Reabrir votação";
    };
    let ultima = null, parado = false;
    const atualizar = async () => { try { ultima = await api("GET", `/api/sondagens/${id}`); if (!parado) desenhar(ultima); } catch { parado = true; } };
    await atualizar();
    const t = setInterval(() => { if (!document.hidden) atualizar(); }, 2000);
    pararDepois.push(() => { parado = true; clearInterval(t); });
  }

  // ---------- mapa de sala ----------
  async function mapa() {
    const ts = await api("GET", "/api/turmas");
    if (!ts.length) { mostrar(`${voltar}<h1>Mapa de sala</h1><p>Cria primeiro uma <a href="#/turmas">turma</a>.</p>`); return; }
    const guardada = Number(localStorage.getItem("eink.turma")) || ts[0].id;
    mostrar(`${voltar}<h1>Mapa de sala</h1><p><label>Turma<select id="m-turma">${ts.map((t) => `<option value="${t.id}" ${t.id === guardada ? "selected" : ""}>${esc(t.nome)}</option>`).join("")}</select></label></p><div id="m-corpo"></div>`);
    const abrir = async () => { try { localStorage.setItem("eink.turma", $("#m-turma").value); } catch { /* sem armazenamento */ } editorMapa(await api("GET", `/api/turmas/${$("#m-turma").value}/mapa`), Number($("#m-turma").value)); };
    $("#m-turma").onchange = abrir; abrir();
  }
  function editorMapa(M, turmaId) {
    let { linhas, colunas, lugares } = M; const alunos = M.alunos; let sel = null, modoCorredor = false, t = null;
    const porId = new Map(alunos.map((a) => [a.id, a]));
    const curto = (a) => { const p = a.nome.split(/\s+/); return `${a.numero ? a.numero + ". " : ""}${p[0]}${p.length > 1 ? " " + p[p.length - 1][0] + "." : ""}`; };
    const sentados = () => new Set(Object.values(lugares).filter((v) => v !== "x"));
    const gravar = () => { clearTimeout(t); t = setTimeout(() => api("PUT", `/api/turmas/${turmaId}/mapa`, { linhas, colunas, lugares }).catch(() => {}), 500); };
    const desenhar = () => {
      const por = alunos.filter((a) => !sentados().has(a.id));
      $("#m-corpo").innerHTML = `<div class="linha nao-imprimir"><label>Filas<input id="m-l" type="number" min="1" max="12" value="${linhas}" style="width:5rem"></label><label>Colunas<input id="m-c" type="number" min="1" max="12" value="${colunas}" style="width:5rem"></label>
          <button class="sec" id="m-ordem">Pela ordem da lista</button><button class="sec" id="m-acaso">Ao acaso</button><button class="sec" id="m-limpar">Limpar</button><button class="sec" id="m-corr" aria-pressed="${modoCorredor}">Marcar corredores${modoCorredor ? " (ligado)" : ""}</button><button class="sec" id="m-imprimir">Imprimir</button></div>
        <div class="m-layout"><aside class="painel nao-imprimir"><strong>Por sentar (${por.length})</strong><div class="m-pool" id="m-pool">${por.map((a) => `<button type="button" class="m-chip ${sel === a.id ? "sel" : ""}" draggable="true" data-a="${a.id}">${esc(curto(a))}</button>`).join("") || '<span class="pequeno">Todos sentados.</span>'}</div><p class="pequeno">Clica num aluno e depois num lugar, ou arrasta.</p></aside>
        <div class="m-sala"><div class="m-quadro">Quadro · Secretária do professor</div><div class="m-grelha" style="grid-template-columns:repeat(${colunas},minmax(5.5rem,1fr))">${Array.from({ length: linhas }, (_, r) => Array.from({ length: colunas }, (_, c) => { const k = `${r},${c}`, v = lugares[k]; return `<button type="button" class="m-lugar ${v === "x" ? "corr" : v ? "ocup" : ""}" data-k="${k}" ${v && v !== "x" ? 'draggable="true"' : ""} aria-label="Fila ${r + 1}, coluna ${c + 1}${v && v !== "x" ? ": " + esc(porId.get(v)?.nome || "") : ""}">${v === "x" ? "" : v ? esc(curto(porId.get(v))) : ""}</button>`; }).join("")).join("")}</div></div></div>`;
      $("#m-l").onchange = (e) => { linhas = Math.min(12, Math.max(1, Number(e.target.value) || 1)); gravar(); desenhar(); };
      $("#m-c").onchange = (e) => { colunas = Math.min(12, Math.max(1, Number(e.target.value) || 1)); gravar(); desenhar(); };
      $("#m-limpar").onclick = () => { if (confirm("Tirar todos os alunos dos lugares?")) { lugares = Object.fromEntries(Object.entries(lugares).filter(([, v]) => v === "x")); gravar(); desenhar(); } };
      $("#m-corr").onclick = () => { modoCorredor = !modoCorredor; sel = null; desenhar(); };
      $("#m-imprimir").onclick = () => window.print();
      const preencher = (lista) => {
        const livres = []; for (let r = 0; r < linhas; r++) for (let c = 0; c < colunas; c++) if (lugares[`${r},${c}`] !== "x") livres.push(`${r},${c}`);
        if (lista.length > livres.length) return aviso(`A sala só tem ${livres.length} lugares para ${lista.length} alunos.`, true);
        lugares = Object.fromEntries(Object.entries(lugares).filter(([, v]) => v === "x"));
        lista.forEach((a, i) => { lugares[livres[i]] = a.id; });
        gravar(); desenhar();
      };
      $("#m-ordem").onclick = () => preencher(alunos);
      $("#m-acaso").onclick = () => { const l = [...alunos]; for (let i = l.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [l[i], l[j]] = [l[j], l[i]]; } preencher(l); };
      const colocar = (alunoId, k) => {
        if (lugares[k] === "x") return;
        const origem = Object.keys(lugares).find((q) => lugares[q] === alunoId), ocupante = lugares[k];
        if (origem) delete lugares[origem];
        lugares[k] = alunoId;
        if (ocupante && origem) lugares[origem] = ocupante; // troca de lugares
        sel = null; gravar(); desenhar();
      };
      $$(".m-chip").forEach((b) => {
        b.onclick = () => { sel = sel === Number(b.dataset.a) ? null : Number(b.dataset.a); desenhar(); };
        b.ondragstart = (e) => e.dataTransfer.setData("text/plain", "a" + b.dataset.a);
      });
      $$(".m-lugar").forEach((b) => {
        const k = b.dataset.k;
        b.onclick = () => {
          if (modoCorredor) { if (lugares[k] === "x") delete lugares[k]; else lugares[k] = "x"; gravar(); return desenhar(); }
          if (sel !== null) return colocar(sel, k);
          if (lugares[k] && lugares[k] !== "x") { delete lugares[k]; gravar(); desenhar(); }
        };
        b.ondragstart = (e) => e.dataTransfer.setData("text/plain", "a" + lugares[k]);
        b.ondragover = (e) => e.preventDefault();
        b.ondrop = (e) => { e.preventDefault(); const m = /^a(\d+)$/.exec(e.dataTransfer.getData("text/plain")); if (m) colocar(Number(m[1]), k); };
      });
      $("#m-pool").ondragover = (e) => e.preventDefault();
      $("#m-pool").ondrop = (e) => { e.preventDefault(); const m = /^a(\d+)$/.exec(e.dataTransfer.getData("text/plain")); if (m) { const o = Object.keys(lugares).find((q) => lugares[q] === Number(m[1])); if (o) { delete lugares[o]; gravar(); desenhar(); } } };
    };
    desenhar();
  }

  // ---------- quadros ----------
  async function quadros() {
    const l = await api("GET", "/api/quadros");
    mostrar(`${voltar}<h1>Quadros</h1><p class="pequeno">Notas coloridas para organizar ideias, tarefas ou o plano da aula. Arrastam-se e guardam-se sozinhas.</p>
      <form class="painel linha" id="f-quadro"><label>Novo quadro<input name="nome" maxlength="60" placeholder="Plano da aula"></label><button>Criar</button></form>
      <div class="painel"><ul class="lista">${l.map((q) => `<li><a href="#/quadro/${q.id}"><strong>${esc(q.nome)}</strong></a><span class="pequeno">${esc(q.atualizado)}</span></li>`).join("") || '<li class="pequeno">Ainda não tens quadros.</li>'}</ul></div>`);
    $("#f-quadro").onsubmit = async (e) => { e.preventDefault(); const r = await api("POST", "/api/quadros", { nome: new FormData(e.target).get("nome") }); location.hash = "#/quadro/" + r.id; };
  }
  const CORES_Q = ["Amarelo", "Rosa", "Verde", "Azul", "Laranja", "Roxo"];
  async function quadro(id) {
    const Q = await api("GET", `/api/quadros/${id}`);
    let notas = Q.notas, t = null;
    const gravar = () => { clearTimeout(t); t = setTimeout(() => api("PUT", `/api/quadros/${id}`, { notas }).catch(() => {}), 700); };
    mostrar(`<p><a href="#/quadros">← Quadros</a></p><div class="linha"><h1 style="margin:0">${esc(Q.nome)}</h1><button class="sec" id="q-nota">+ Nota</button><button class="sec" id="q-nome">Mudar nome</button><button class="perigo" id="q-apagar">Apagar quadro</button></div>
      <div class="q-tela" id="q-tela"></div><p class="pequeno">Arrasta a barra de cada nota (ou usa as setas do teclado nela) para a mover.</p>`);
    const tela = $("#q-tela");
    const desenhar = () => {
      tela.innerHTML = notas.map((n) => `<div class="q-nota cq${n.cor}" style="left:${n.x}px;top:${n.y}px" data-id="${esc(n.id)}"><div class="q-barra" tabindex="0" role="group" aria-label="Mover a nota"><select class="q-cor" aria-label="Cor da nota">${CORES_Q.map((c, i) => `<option value="${i}" ${n.cor === i ? "selected" : ""}>${c}</option>`).join("")}</select><button type="button" class="q-x" aria-label="Apagar a nota">✕</button></div><textarea maxlength="500" aria-label="Texto da nota">${esc(n.texto)}</textarea></div>`).join("");
      $$(".q-nota", tela).forEach((el) => {
        const n = notas.find((x) => x.id === el.dataset.id);
        $("textarea", el).oninput = (e) => { n.texto = e.target.value; gravar(); };
        $(".q-cor", el).onchange = (e) => { n.cor = Number(e.target.value); gravar(); desenhar(); };
        $(".q-x", el).onclick = () => { notas = notas.filter((x) => x !== n); gravar(); desenhar(); };
        const barra = $(".q-barra", el);
        barra.onpointerdown = (e) => {
          if (e.target.closest("select,button")) return;
          const ox = e.clientX - n.x, oy = e.clientY - n.y; barra.setPointerCapture(e.pointerId);
          barra.onpointermove = (m) => { n.x = Math.min(3000, Math.max(0, Math.round(m.clientX - ox))); n.y = Math.min(3000, Math.max(0, Math.round(m.clientY - oy))); el.style.left = n.x + "px"; el.style.top = n.y + "px"; };
          barra.onpointerup = () => { barra.onpointermove = null; barra.onpointerup = null; gravar(); };
        };
        barra.onkeydown = (e) => { const d = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[e.key]; if (d && e.target === barra) { e.preventDefault(); n.x = Math.max(0, n.x + d[0]); n.y = Math.max(0, n.y + d[1]); el.style.left = n.x + "px"; el.style.top = n.y + "px"; gravar(); } };
      });
    };
    $("#q-nota").onclick = () => { if (notas.length >= 100) return aviso("Um quadro leva até 100 notas.", true); const i = notas.length; notas.push({ id: "n" + Date.now().toString(36), x: 20 + (i % 6) * 30, y: 20 + (i % 6) * 30, cor: i % 6, texto: "" }); gravar(); desenhar(); };
    $("#q-nome").onclick = async () => { const nome = prompt("Nome do quadro", Q.nome); if (nome) { await api("PUT", `/api/quadros/${id}`, { nome }); quadro(id); } };
    $("#q-apagar").onclick = async () => { if (confirm("Apagar este quadro e as suas notas?")) { await api("DELETE", `/api/quadros/${id}`); location.hash = "#/quadros"; } };
    pararDepois.push(() => { clearTimeout(t); api("PUT", `/api/quadros/${id}`, { notas }).catch(() => {}); });
    desenhar();
  }

  EINK.rotas.push([/^\/sondagens$/, sondagens], [/^\/sondagem\/(\d+)$/, (id) => sondagem(+id)], [/^\/mapa$/, mapa], [/^\/quadros$/, quadros], [/^\/quadro\/(\d+)$/, (id) => quadro(+id)]);
})();
