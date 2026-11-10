"use strict";
// Ferramentas de sala com dados guardados: sondagens, mapa de sala e quadros. O mural e o bilhete de saída estão em atividades.js.
(() => {
  const { api, aviso, mostrar, esc, $, $$ } = EINK;
  const voltar = EINK.voltarSala;
  const pararDepois = [];
  const aoSairAnt = EINK.aoSair;
  EINK.aoSair = () => { aoSairAnt && aoSairAnt(); while (pararDepois.length) pararDepois.pop()(); };
  EINK.pararDepois = (f) => pararDepois.push(f);
  const qrSvg = (url, tam = 6) => { try { const qr = window.qrcode(0, "M"); qr.addData(url); qr.make(); return qr.createSvgTag({ cellSize: tam, margin: 2, scalable: true }); } catch { return ""; } };
  EINK.qrSvg = qrSvg;
  // Cabeçalho comum das atividades com código: QR grande, endereço e código (no projetor fica ao lado dos resultados).
  EINK.blocoCodigo = (codigo, prefixo = "s") => { const url = `${location.origin}/${prefixo}/${codigo}`; return `<div class="painel linha s-topo"><div class="s-qr" aria-label="Código QR">${qrSvg(url)}</div><div><p class="pequeno">Os alunos abrem:</p><p class="s-url">${esc(url.replace(/^https?:\/\//, ""))}</p><p>Código <strong class="s-codigo">${esc(codigo)}</strong></p><p class="pequeno" id="s-estado"></p></div></div>`; };
  const nomeTurma = async () => { try { return await api("GET", "/api/turmas"); } catch { return []; } };
  EINK.seletorTurmaOpcional = (ts, sel) => `<label>Turma (opcional)<select name="turma"><option value="">Sem turma</option>${ts.map((t) => `<option value="${t.id}" ${t.id === sel ? "selected" : ""}>${esc(t.nome)}</option>`).join("")}</select></label>`;
  EINK.listaAnteriores = (l, vazio) => `<div class="painel"><ul class="lista">${l.map((s) => `<li><span><a href="#/sondagem/${s.id}"><strong>${esc(s.pergunta)}</strong></a> <span class="pequeno">${s.total} ${s.tipo === "escolha" ? "votos" : s.tipo === "bilhete" ? "bilhetes" : s.tipo === "mural" ? "notas" : "respostas"} · ${s.aberta ? "aberta" : "fechada"} · ${esc(String(s.criada).slice(0, 10))}</span></span><button type="button" class="sec" data-copiar="${s.id}">Usar outra vez</button></li>`).join("") || `<li class="pequeno">${vazio}</li>`}</ul></div>`;
  EINK.ligarCopiar = () => $$("[data-copiar]").forEach((b) => { b.onclick = async () => { const r = await api("POST", `/api/sondagens/${b.dataset.copiar}/copiar`, {}); location.hash = "#/sondagem/" + r.id; }; });

  // ---------- sondagens ----------
  const MODELOS = [["Sim / Não", "Sim\nNão"], ["Verdadeiro / Falso", "Verdadeiro\nFalso"], ["Escala 1 a 5", "1\n2\n3\n4\n5"], ["Concordo… Discordo", "Concordo totalmente\nConcordo\nNem concordo nem discordo\nDiscordo\nDiscordo totalmente"], ["Percebi?", "Percebi\nMais ou menos\nNão percebi"]];
  async function sondagens() {
    const [l, ts] = await Promise.all([api("GET", "/api/sondagens?tipo=sondagem"), nomeTurma()]);
    mostrar(`${voltar}<h1>Sondagens</h1>
      <p class="pequeno">Faz uma pergunta rápida à turma. Os alunos votam no telemóvel, abrindo o endereço ou lendo o código QR, sem conta nem nome. Sem telemóveis, usa «Só na sala» e conta as mãos no ar.</p>
      <form class="painel" id="f-sond"><label>Pergunta<input name="pergunta" required maxlength="200" placeholder="Qual destas aplicações usas mais?"></label>
        <p class="linha" role="group" aria-label="Tipo"><label class="inline"><input type="radio" name="tipo" value="escolha" checked> Escolha</label><label class="inline"><input type="radio" name="tipo" value="aberta"> Resposta aberta (nuvem de palavras)</label><label class="inline"><input type="radio" name="tipo" value="sala"> Só na sala (mãos no ar)</label></p>
        <div id="s-opcoes-l"><label>Opções (uma por linha, de 2 a 8)<textarea name="opcoes" id="s-opcoes" rows="4" required placeholder="Instagram&#10;TikTok&#10;WhatsApp"></textarea></label>
          <p class="linha"><span class="pequeno">Modelos:</span>${MODELOS.map(([n], i) => `<button type="button" class="sec" data-mod="${i}"${i === 0 ? ' id="s-simnao"' : ""}>${n}</button>`).join("")}</p>
          <p class="linha"><label>Resposta certa (opcional)<select name="certa" id="s-certa"><option value="">Nenhuma</option></select></label><label class="inline"><input type="checkbox" name="esconder"> Esconder os resultados até eu mostrar</label></p></div>
        <p class="linha">${EINK.seletorTurmaOpcional(ts, EINK.ler("turma", null))}<button>Criar sondagem</button></p></form>
      <h2>Anteriores</h2>${EINK.listaAnteriores(l, "Ainda não fizeste sondagens.")}`);
    const op = $("#s-opcoes"), certa = $("#s-certa");
    const opcoes = () => op.value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const atualizarCerta = () => { const v = certa.value; certa.innerHTML = `<option value="">Nenhuma</option>${opcoes().map((o, i) => `<option value="${i}">${esc(o)}</option>`).join("")}`; if (v && Number(v) < opcoes().length) certa.value = v; };
    op.oninput = atualizarCerta;
    $$("[data-mod]").forEach((b) => { b.onclick = () => { op.value = MODELOS[Number(b.dataset.mod)][1]; if (b.textContent === "Verdadeiro / Falso") $("#f-sond [name=pergunta]").placeholder = "Afirmação para verdadeiro ou falso"; atualizarCerta(); }; });
    $$("#f-sond [name=tipo]").forEach((r) => { r.onchange = () => { const aberta = $("#f-sond [name=tipo]:checked").value === "aberta"; $("#s-opcoes-l").hidden = aberta; op.required = !aberta; }; });
    $("#f-sond").onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target), tipo = f.get("tipo");
      const r = await api("POST", "/api/sondagens", { pergunta: f.get("pergunta"), tipo: tipo === "aberta" ? "aberta" : "escolha", opcoes: tipo === "aberta" ? [] : opcoes(), certa: f.get("certa") === "" ? null : Number(f.get("certa")), esconder: !!f.get("esconder"), turma: f.get("turma") || null });
      if (tipo === "sala") EINK.guardar("sondagem.sala." + r.id, true);
      location.hash = "#/sondagem/" + r.id;
    };
    EINK.ligarCopiar();
  }
  // Nuvem de palavras: o tamanho de cada palavra cresce com o número de pessoas que a escreveram.
  EINK.nuvem = (palavras, respostas, apagavel = true) => {
    const max = Math.max(1, ...palavras.map((p) => p.n));
    const cloud = palavras.map((p, i) => `<span class="nv c${i % 5}" style="font-size:${(1 + (p.n / max) * 2.6).toFixed(2)}rem" title="${p.n} resposta(s)">${esc(p.palavra)}</span>`).join(" ");
    return `<div class="nuvem" role="img" aria-label="Nuvem de palavras">${cloud || '<span class="pequeno">À espera das primeiras respostas…</span>'}</div>
      <details class="nao-projetar"><summary>Ver as ${respostas.length} respostas</summary><ul class="lista">${respostas.map((r) => `<li><span>${esc(r.texto)}</span>${apagavel ? `<button class="perigo" data-rm="${r.id}" aria-label="Tirar a resposta ${esc(r.texto)}">✕</button>` : ""}</li>`).join("")}</ul></details>`;
  };
  // Vista do docente para qualquer atividade com código: atualiza de 2 em 2 segundos enquanto o separador está visível.
  EINK.vigiarSondagem = async (id, desenhar) => {
    let ultima = null, parado = false;
    const atualizar = async () => { try { ultima = await api("GET", `/api/sondagens/${id}`); if (!parado) desenhar(ultima, atualizar); } catch { parado = true; } };
    await atualizar();
    const t = setInterval(() => { if (!document.hidden) atualizar(); }, 2000);
    pararDepois.push(() => { parado = true; clearInterval(t); });
    return { atualizar, ultima: () => ultima };
  };
  async function sondagem(id) {
    const primeiro = await api("GET", `/api/sondagens/${id}`);
    if (primeiro.tipo === "mural" && EINK.vistaMural) return EINK.vistaMural(id);
    if (primeiro.tipo === "bilhete" && EINK.vistaBilhete) return EINK.vistaBilhete(id);
    const soSala = EINK.ler("sondagem.sala." + id, false);
    let primeira = true;
    const desenhar = (s, atualizar) => {
      const max = Math.max(1, ...s.votos), mostrar_ = s.revelada || !s.aberta;
      const barras = s.tipo === "aberta" ? EINK.nuvem(s.palavras, s.respostas) : s.opcoes.map((o, i) => `<div class="s-linha ${mostrar_ && s.certa === i ? "s-certa" : ""}"><div class="s-nome">${mostrar_ && s.certa === i ? "✓ " : ""}${esc(o)}</div><div class="s-barra"><div class="s-enche c${i % 5}" style="width:${mostrar_ ? (s.votos[i] / max) * 100 : 0}%"></div></div><div class="s-valor">${mostrar_ ? `<strong>${s.votos[i]}</strong> <span class="pequeno">${s.total ? Math.round((s.votos[i] / s.total) * 100) : 0} %</span>` : '<span class="pequeno">?</span>'}</div>
        <div class="linha s-maos"><button class="sec" data-d="-1" data-k="${i}" aria-label="Menos um voto em ${esc(o)}">−</button><button class="sec" data-d="1" data-k="${i}" aria-label="Mais um voto em ${esc(o)}">+</button></div></div>`).join("");
      if (primeira) {
        primeira = false;
        mostrar(`<p class="nao-projetar"><a href="#/sondagens">← Sondagens</a></p><div class="linha cab-ferr"><h1>${esc(s.pergunta)}</h1>${EINK.botaoProjetar()}</div>
          <div class="s-proj ${soSala ? "so-sala" : ""}">${soSala ? '<p class="pequeno" id="s-estado"></p>' : EINK.blocoCodigo(s.codigo)}
          <div><p class="s-contador" id="s-contador"></p><div id="s-res"></div></div></div>
          <p class="linha nao-projetar"><button id="s-revelar" class="sec" hidden></button><button id="s-fechar" class="sec"></button><button id="s-repor" class="sec">Repor votos</button><button id="s-copiar" class="sec">Usar outra vez</button>${s.tipo === "escolha" ? `<button id="s-modo" class="sec">${soSala ? "Mostrar o código aos alunos" : "Só na sala (mãos no ar)"}</button>` : ""}<button id="s-apagar" class="perigo">Apagar</button></p>
          <p class="pequeno nao-projetar">${s.tipo === "aberta" ? "Cada aluno pode enviar até 3 respostas curtas. Não se guarda quem respondeu; podes tirar uma resposta imprópria com ✕." : "Os botões − e + servem para contar «mãos no ar» na sala. Os votos são só contagens: não se guarda quem votou."}</p>`);
        $("#s-fechar").onclick = async () => { await api("POST", `/api/sondagens/${id}/estado`, { aberta: !V.ultima().aberta }); atualizar(); };
        $("#s-revelar").onclick = async () => { await api("POST", `/api/sondagens/${id}/estado`, { revelada: !V.ultima().revelada }); atualizar(); };
        $("#s-repor").onclick = async () => { if (confirm("Voltar a pôr os votos a zero?")) { await api("POST", `/api/sondagens/${id}/repor`, {}); atualizar(); } };
        $("#s-copiar").onclick = async () => { const r = await api("POST", `/api/sondagens/${id}/copiar`, {}); location.hash = "#/sondagem/" + r.id; };
        if ($("#s-modo")) $("#s-modo").onclick = () => { EINK.guardar("sondagem.sala." + id, !soSala); sondagem(id); };
        $("#s-apagar").onclick = async () => { if (confirm("Apagar esta sondagem?")) { await api("DELETE", `/api/sondagens/${id}`); location.hash = "#/sondagens"; } };
        $("#s-res").onclick = async (e) => {
          const x = e.target.closest("[data-rm]"); if (x) { await api("DELETE", `/api/sondagens/${id}/respostas/${x.dataset.rm}`); atualizar(); return; } const b = e.target.closest("[data-k]"); if (b) { await api("POST", `/api/sondagens/${id}/voto`, { opcao: Number(b.dataset.k), delta: Number(b.dataset.d) }); atualizar(); } };
      }
      $("#s-res").innerHTML = barras;
      $("#s-res").classList.toggle("com-maos", soSala);
      $("#s-contador").innerHTML = `<strong>${s.total}</strong> ${s.tipo === "aberta" ? "respostas" : "votos"}${!mostrar_ ? " · resultados escondidos" : ""}`;
      if ($("#s-estado")) $("#s-estado").textContent = `${s.aberta ? "votação aberta" : s.expirada ? "fechada (passaram 12 horas: usa «Usar outra vez»)" : "votação fechada"}`;
      $("#s-fechar").textContent = s.aberta ? "Fechar votação" : "Reabrir votação"; $("#s-fechar").disabled = s.expirada;
      $("#s-revelar").hidden = s.tipo !== "escolha" || !s.aberta; $("#s-revelar").textContent = s.revelada ? "Esconder resultados" : "Mostrar resultados";
    };
    const V = await EINK.vigiarSondagem(id, desenhar);
  }

  // ---------- mapa de sala ----------
  async function mapa() {
    await EINK.escolherTurma("Mapa de sala", async (t, el) => { editorMapa(await api("GET", `/api/turmas/${t.id}/mapa`), t.id, el); }, { projetar: true });
  }
  function editorMapa(M, turmaId, raiz) {
    let { linhas, colunas, lugares } = M; const alunos = M.alunos; let disposicoes = M.disposicoes || [];
    let sel = null, modoCorredor = false, t = null, comFotos = EINK.ler("mapa.fotos", false), alunosVista = false, destaque = null;
    const porId = new Map(alunos.map((a) => [a.id, a]));
    const curto = (a) => { const p = a.nome.split(/\s+/); return `${a.numero ? a.numero + ". " : ""}${p[0]}${p.length > 1 ? " " + p[p.length - 1][0] + "." : ""}`; };
    const sentados = () => new Set(Object.values(lugares).filter((v) => v !== "x"));
    const gravar = (extra = {}) => { clearTimeout(t); t = setTimeout(() => api("PUT", `/api/turmas/${turmaId}/mapa`, { linhas, colunas, lugares, ...extra }).catch(() => {}), 500); };
    const lugarHtml = (r, c) => { const k = `${r},${c}`, v = lugares[k], a = v && v !== "x" ? porId.get(v) : null; return `<button type="button" class="m-lugar ${v === "x" ? "corr" : a ? "ocup" : ""} ${destaque === v ? "m-destaque" : ""}" data-k="${k}" ${a ? 'draggable="true"' : ""} aria-label="Fila ${r + 1}, coluna ${c + 1}${a ? ": " + esc(a.nome) : ""}">${a ? `${comFotos ? EINK.foto(a, "foto-mapa") : ""}<span>${esc(curto(a))}</span>` : ""}</button>`; };
    const desenhar = () => {
      const por = alunos.filter((a) => !sentados().has(a.id));
      // Vista dos alunos: o mapa rodado 180°, com o quadro em baixo (como a turma vê a sala ao projetar).
      const filas = Array.from({ length: linhas }, (_, r) => r), cols = Array.from({ length: colunas }, (_, c) => c);
      const ordemR = alunosVista ? [...filas].reverse() : filas, ordemC = alunosVista ? [...cols].reverse() : cols;
      const grelha = `<div class="m-grelha" style="grid-template-columns:repeat(${colunas},minmax(5.5rem,1fr))">${ordemR.map((r) => ordemC.map((c) => lugarHtml(r, c)).join("")).join("")}</div>`;
      const quadro = `<div class="m-quadro">Quadro · Secretária do professor</div>`;
      raiz.innerHTML = `<div class="linha nao-imprimir nao-projetar"><label>Filas<input id="m-l" type="number" min="1" max="12" value="${linhas}" style="width:5rem"></label><label>Colunas<input id="m-c" type="number" min="1" max="12" value="${colunas}" style="width:5rem"></label>
          <button class="sec" id="m-ordem">Pela ordem da lista</button><button class="sec" id="m-acaso">Ao acaso</button><button class="sec" id="m-limpar">Limpar</button><button class="sec" id="m-corr" aria-pressed="${modoCorredor}">Marcar corredores${modoCorredor ? " (ligado)" : ""}</button><button class="sec" id="m-imprimir">Imprimir</button></div>
        <div class="linha nao-imprimir"><label class="inline nao-projetar"><input type="checkbox" id="m-fotos" ${comFotos ? "checked" : ""}> Fotografias</label><button class="sec" id="m-vista" aria-pressed="${alunosVista}">${alunosVista ? "Vista do professor" : "Vista dos alunos"}</button><button class="sec" id="m-sortear">🔀 Sortear um aluno</button>
          <span class="linha nao-projetar"><label>Disposição<select id="m-disp"><option value="">Escolher…</option>${disposicoes.map((d, i) => `<option value="${i}">${esc(d.nome)}</option>`).join("")}</select></label><button class="sec" id="m-gdisp">Guardar como…</button>${disposicoes.length ? '<button class="perigo" id="m-adisp">Apagar disposição</button>' : ""}</span></div>
        <div class="m-layout"><aside class="painel nao-imprimir nao-projetar"><strong>Por sentar (${por.length})</strong><div class="m-pool" id="m-pool">${por.map((a) => `<button type="button" class="m-chip ${sel === a.id ? "sel" : ""}" draggable="true" data-a="${a.id}">${esc(curto(a))}</button>`).join("") || '<span class="pequeno">Todos sentados.</span>'}</div><p class="pequeno">Clica num aluno e depois num lugar, ou arrasta.</p></aside>
        <div class="m-sala ${alunosVista ? "m-alunos" : ""}">${alunosVista ? grelha + quadro : quadro + grelha}</div></div>`;
      $("#m-l").onchange = (e) => { linhas = Math.min(12, Math.max(1, Number(e.target.value) || 1)); gravar(); desenhar(); };
      $("#m-c").onchange = (e) => { colunas = Math.min(12, Math.max(1, Number(e.target.value) || 1)); gravar(); desenhar(); };
      $("#m-limpar").onclick = () => { if (confirm("Tirar todos os alunos dos lugares?")) { lugares = Object.fromEntries(Object.entries(lugares).filter(([, v]) => v === "x")); gravar(); desenhar(); } };
      $("#m-corr").onclick = () => { modoCorredor = !modoCorredor; sel = null; desenhar(); };
      $("#m-imprimir").onclick = () => window.print();
      $("#m-fotos").onchange = (e) => { comFotos = e.target.checked; EINK.guardar("mapa.fotos", comFotos); desenhar(); };
      $("#m-vista").onclick = () => { alunosVista = !alunosVista; desenhar(); };
      $("#m-sortear").onclick = () => {
        const l = [...sentados()]; if (!l.length) return aviso("Ainda não há alunos sentados.", true);
        let i = 0; const fim = l[EINK.acaso(l.length)], volta = () => { destaque = i < 10 ? l[EINK.acaso(l.length)] : fim; desenhar(); if (i++ < 10) setTimeout(volta, 60 + i * 25); else aviso(`Saiu: ${porId.get(fim).nome}`); };
        volta();
      };
      $("#m-disp").onchange = (e) => { const d = disposicoes[Number(e.target.value)]; if (!d || !confirm(`Mudar para a disposição «${d.nome}»? A atual perde-se se não a guardaste.`)) { e.target.value = ""; return; } ({ linhas, colunas } = d); lugares = { ...d.lugares }; gravar(); desenhar(); };
      $("#m-gdisp").onclick = () => {
        const nome = prompt("Nome desta disposição (por exemplo «Testes» ou «Trabalho de grupo»):"); if (!nome) return;
        const i = disposicoes.findIndex((d) => d.nome.toLowerCase() === nome.toLowerCase());
        const nova = { nome, linhas, colunas, lugares: { ...lugares } };
        if (i >= 0) disposicoes[i] = nova; else { if (disposicoes.length >= 6) return aviso("Podes guardar até 6 disposições.", true); disposicoes.push(nova); }
        gravar({ disposicoes }); aviso("Disposição guardada."); desenhar();
      };
      if ($("#m-adisp")) $("#m-adisp").onclick = () => { const nome = prompt(`Que disposição apagar? (${disposicoes.map((d) => d.nome).join(", ")})`); const i = disposicoes.findIndex((d) => d.nome.toLowerCase() === String(nome || "").toLowerCase()); if (i < 0) return; disposicoes.splice(i, 1); gravar({ disposicoes }); desenhar(); };
      const preencher = (lista) => {
        const livres = []; for (let r = 0; r < linhas; r++) for (let c = 0; c < colunas; c++) if (lugares[`${r},${c}`] !== "x") livres.push(`${r},${c}`);
        if (lista.length > livres.length) return aviso(`A sala só tem ${livres.length} lugares para ${lista.length} alunos.`, true);
        lugares = Object.fromEntries(Object.entries(lugares).filter(([, v]) => v === "x"));
        lista.forEach((a, i) => { lugares[livres[i]] = a.id; });
        gravar(); desenhar();
      };
      $("#m-ordem").onclick = () => preencher(alunos);
      $("#m-acaso").onclick = () => preencher(EINK.baralhar(alunos));
      const colocar = (alunoId, k) => {
        if (lugares[k] === "x") return;
        const origem = Object.keys(lugares).find((q) => lugares[q] === alunoId), ocupante = lugares[k];
        if (origem) delete lugares[origem];
        lugares[k] = alunoId;
        if (ocupante && origem) lugares[origem] = ocupante; // troca de lugares
        sel = null; gravar(); desenhar();
      };
      $$(".m-chip", raiz).forEach((b) => {
        b.onclick = () => { sel = sel === Number(b.dataset.a) ? null : Number(b.dataset.a); desenhar(); };
        b.ondragstart = (e) => e.dataTransfer.setData("text/plain", "a" + b.dataset.a);
      });
      $$(".m-lugar", raiz).forEach((b) => {
        const k = b.dataset.k;
        b.onclick = () => {
          if (modoCorredor) { if (lugares[k] === "x") delete lugares[k]; else lugares[k] = "x"; gravar(); return desenhar(); }
          if (sel !== null) return colocar(sel, k);
          if (lugares[k] && lugares[k] !== "x" && !document.body.classList.contains("projetar")) { delete lugares[k]; gravar(); desenhar(); }
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
  // Modelos: colunas de fundo e notas iniciais. «Abrir aos alunos» cria um mural com as mesmas colunas.
  const MODELOS_Q = {
    branco: { nome: "Em branco", colunas: [] },
    skq: { nome: "Sei / Quero saber / Aprendi", colunas: ["Sei", "Quero saber", "Aprendi"] },
    pc: { nome: "Prós / Contras", colunas: ["Prós", "Contras"] },
    plano: { nome: "Plano da aula", colunas: ["Para fazer", "A fazer", "Feito"] },
  };
  const COL_W = 260;
  async function quadros() {
    const l = await api("GET", "/api/quadros");
    mostrar(`${voltar}<h1>Quadros</h1><p class="pequeno">Notas coloridas para organizar ideias, tarefas ou o plano da aula. Arrastam-se e guardam-se sozinhas. Para os alunos escreverem do telemóvel, usa «Abrir aos alunos» (cria um mural).</p>
      <form class="painel linha" id="f-quadro"><label>Novo quadro<input name="nome" maxlength="60" placeholder="Plano da aula"></label><label>Modelo<select name="modelo">${Object.entries(MODELOS_Q).map(([k, m]) => `<option value="${k}">${m.nome}</option>`).join("")}</select></label><button>Criar</button></form>
      <div class="painel"><ul class="lista">${l.map((q) => `<li><a href="#/quadro/${q.id}"><strong>${esc(q.nome)}</strong></a><span class="pequeno">${esc(q.atualizado)}</span></li>`).join("") || '<li class="pequeno">Ainda não tens quadros.</li>'}</ul></div>`);
    $("#f-quadro").onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target), m = MODELOS_Q[f.get("modelo")] || MODELOS_Q.branco;
      const r = await api("POST", "/api/quadros", { nome: f.get("nome") || (m.colunas.length ? m.nome : "") });
      // As colunas do modelo são notas de título (cor 3, no topo de cada coluna).
      if (m.colunas.length) await api("PUT", `/api/quadros/${r.id}`, { notas: m.colunas.map((c, i) => ({ id: "col" + i, x: 20 + i * COL_W, y: 10, cor: 3, texto: c })) });
      location.hash = "#/quadro/" + r.id;
    };
  }
  const CORES_Q = ["Amarelo", "Rosa", "Verde", "Azul", "Laranja", "Roxo"];
  async function quadro(id) {
    const Q = await api("GET", `/api/quadros/${id}`);
    let notas = Q.notas, t = null;
    const gravar = () => { clearTimeout(t); t = setTimeout(() => api("PUT", `/api/quadros/${id}`, { notas }).catch(() => {}), 700); };
    mostrar(`<p class="nao-projetar"><a href="#/quadros">← Quadros</a></p><div class="linha cab-ferr"><h1 style="margin:0">${esc(Q.nome)}</h1>${EINK.botaoProjetar()}<button class="sec nao-projetar" id="q-nota">+ Nota</button><button class="sec nao-projetar" id="q-alunos">Abrir aos alunos</button><button class="sec nao-projetar" id="q-nome">Mudar nome</button><button class="perigo nao-projetar" id="q-apagar">Apagar quadro</button></div>
      <div class="q-tela" id="q-tela"></div><p class="pequeno nao-projetar">Arrasta a barra de cada nota (ou usa as setas do teclado nela) para a mover.</p>`);
    const tela = $("#q-tela");
    const desenhar = () => {
      tela.innerHTML = notas.map((n) => `<div class="q-nota cq${n.cor} ${String(n.id).startsWith("col") ? "q-col" : ""}" style="left:${n.x}px;top:${n.y}px" data-id="${esc(n.id)}"><div class="q-barra" tabindex="0" role="group" aria-label="Mover a nota"><select class="q-cor" aria-label="Cor da nota">${CORES_Q.map((c, i) => `<option value="${i}" ${n.cor === i ? "selected" : ""}>${c}</option>`).join("")}</select><button type="button" class="q-x" aria-label="Apagar a nota">✕</button></div><textarea maxlength="500" aria-label="Texto da nota">${esc(n.texto)}</textarea></div>`).join("");
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
    $("#q-nota").onclick = () => { if (notas.length >= 100) return aviso("Um quadro leva até 100 notas.", true); const i = notas.length; notas.push({ id: "n" + Date.now().toString(36), x: 20 + (i % 6) * 30, y: 80 + (i % 6) * 30, cor: i % 6, texto: "" }); gravar(); desenhar(); };
    $("#q-alunos").onclick = async () => {
      const colunas = notas.filter((n) => String(n.id).startsWith("col")).sort((a, b) => a.x - b.x).map((n) => n.texto.trim()).filter(Boolean).slice(0, 4);
      if (!confirm(`Criar um mural «${Q.nome}»${colunas.length ? ` com as colunas ${colunas.join(", ")}` : ""}? Os alunos escrevem no telemóvel com um código.`)) return;
      const r = await api("POST", "/api/sondagens", { tipo: "mural", pergunta: Q.nome, opcoes: colunas, extra: { modo: "ideias" } });
      location.hash = "#/sondagem/" + r.id;
    };
    $("#q-nome").onclick = async () => { const nome = prompt("Nome do quadro", Q.nome); if (nome) { await api("PUT", `/api/quadros/${id}`, { nome }); quadro(id); } };
    $("#q-apagar").onclick = async () => { if (confirm("Apagar este quadro e as suas notas?")) { await api("DELETE", `/api/quadros/${id}`); location.hash = "#/quadros"; } };
    pararDepois.push(() => { clearTimeout(t); api("PUT", `/api/quadros/${id}`, { notas }).catch(() => {}); });
    desenhar();
  }

  EINK.rotas.push([/^\/sondagens$/, sondagens], [/^\/sondagem\/(\d+)$/, (id) => sondagem(+id)], [/^\/mapa$/, mapa], [/^\/quadros$/, quadros], [/^\/quadro\/(\d+)$/, (id) => quadro(+id)]);
})();
