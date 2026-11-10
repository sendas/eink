"use strict";
// Atividades novas de sala: mural da turma e bilhete de saída (com telemóvel); placar de equipas, quiz no projetor com cartões,
// pergunta e roda de respostas e ecrã da tarefa (sem telemóvel). O mural e o bilhete são anónimos, como as sondagens.
(() => {
  const { api, aviso, mostrar, esc, $, $$ } = EINK;
  const voltar = EINK.voltarSala;
  const FORMAS = ["▲", "◆", "●", "■", "★"];
  const parar = [];
  const aoSairAnt = EINK.aoSair;
  EINK.aoSair = () => { aoSairAnt && aoSairAnt(); while (parar.length) parar.pop()(); };
  const turmas = () => api("GET", "/api/turmas").catch(() => []);

  // ---------- mural da turma ----------
  async function mural() {
    const [l, ts] = await Promise.all([api("GET", "/api/sondagens?tipo=mural"), turmas()]);
    mostrar(`${voltar}<h1>Mural da turma</h1>
      <p class="pequeno">Os alunos escrevem ideias ou dúvidas curtas no telemóvel (até 5 cada, anónimas) e elas aparecem no ecrã. Podes esconder, destacar, mudar de coluna ou apagar. No modo «Dúvidas», os alunos dão 👍 às dúvidas dos colegas e as mais votadas sobem.</p>
      <form class="painel" id="f-mural"><label>Título ou pergunta<input name="pergunta" maxlength="200" placeholder="O que já sabes sobre a Revolução de 1820?"></label>
        <p class="linha"><label class="inline"><input type="radio" name="modo" value="ideias" checked> Ideias</label><label class="inline"><input type="radio" name="modo" value="duvidas"> Dúvidas (com 👍)</label><label class="inline"><input type="checkbox" name="aprovar"> Aprovar cada nota antes de aparecer</label></p>
        <label>Colunas (opcional, uma por linha, até 4)<textarea name="colunas" rows="3" placeholder="Sei&#10;Quero saber&#10;Aprendi"></textarea></label>
        <p class="linha">${EINK.seletorTurmaOpcional(ts, EINK.ler("turma", null))}<button>Abrir o mural</button></p></form>
      <h2>Anteriores</h2>${EINK.listaAnteriores(l, "Ainda não abriste murais.")}`);
    $("#f-mural").onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      const r = await api("POST", "/api/sondagens", { tipo: "mural", pergunta: f.get("pergunta"), opcoes: String(f.get("colunas")).split(/\r?\n/).map((x) => x.trim()).filter(Boolean), extra: { modo: f.get("modo"), aprovar: !!f.get("aprovar") }, turma: f.get("turma") || null });
      location.hash = "#/sondagem/" + r.id;
    };
    EINK.ligarCopiar();
  }
  EINK.vistaMural = async (id) => {
    let primeira = true;
    const desenhar = (s, atualizar) => {
      const cols = s.opcoes.length ? s.opcoes : [""], duvidas = s.extra.modo === "duvidas";
      const notas = [...s.respostas].sort((a, b) => (b.destaque - a.destaque) || (duvidas ? b.gostos - a.gostos : 0) || b.id - a.id);
      const nota = (n) => `<article class="mu-nota cq${n.id % 6} ${n.oculta ? "mu-oculta" : ""} ${n.destaque ? "mu-destaque" : ""}" data-n="${n.id}"><p>${esc(n.texto)}</p>${duvidas ? `<span class="mu-gostos" title="Votos">👍 ${n.gostos}</span>` : ""}
        <div class="mu-acoes nao-projetar">${n.oculta ? `<button type="button" class="sec" data-ac="mostrar">Mostrar</button>` : `<button type="button" class="sec" data-ac="esconder" title="Esconder" aria-label="Esconder">🙈</button>`}<button type="button" class="sec" data-ac="destacar" aria-pressed="${n.destaque}" title="Destacar" aria-label="Destacar">★</button>${cols.length > 1 ? `<button type="button" class="sec" data-ac="esq" aria-label="Coluna anterior">←</button><button type="button" class="sec" data-ac="dir" aria-label="Coluna seguinte">→</button>` : ""}<button type="button" class="perigo" data-ac="apagar" aria-label="Apagar">✕</button></div></article>`;
      if (primeira) {
        primeira = false;
        mostrar(`<p class="nao-projetar"><a href="#/mural">← Mural</a></p><div class="linha cab-ferr"><h1>${esc(s.pergunta)}</h1>${EINK.botaoProjetar()}</div>${EINK.blocoCodigo(s.codigo)}
          <p class="linha nao-projetar"><span class="pequeno" id="mu-info"></span><button class="sec" id="mu-aprovar" hidden>Mostrar todas as pendentes</button><button id="mu-fechar" class="sec"></button><button id="mu-copiar" class="sec">Usar outra vez</button><button id="mu-apagar" class="perigo">Apagar o mural</button></p>
          <div id="mu-cols"></div>`);
        $("#mu-fechar").onclick = async () => { await api("POST", `/api/sondagens/${id}/estado`, { aberta: !V.ultima().aberta }); atualizar(); };
        $("#mu-copiar").onclick = async () => { const r = await api("POST", `/api/sondagens/${id}/copiar`, {}); location.hash = "#/sondagem/" + r.id; };
        $("#mu-apagar").onclick = async () => { if (confirm("Apagar este mural e as notas?")) { await api("DELETE", `/api/sondagens/${id}`); location.hash = "#/mural"; } };
        $("#mu-aprovar").onclick = async () => { for (const n of V.ultima().respostas.filter((x) => x.oculta)) await api("PUT", `/api/sondagens/${id}/respostas/${n.id}`, { oculta: false }); atualizar(); };
        $("#mu-cols").onclick = async (e) => {
          const b = e.target.closest("[data-ac]"); if (!b) return;
          const n = V.ultima().respostas.find((x) => x.id === Number(b.closest("[data-n]").dataset.n)), ncol = Math.max(1, V.ultima().opcoes.length);
          const a = b.dataset.ac;
          if (a === "apagar") { if (!confirm("Apagar esta nota?")) return; await api("DELETE", `/api/sondagens/${id}/respostas/${n.id}`); }
          else await api("PUT", `/api/sondagens/${id}/respostas/${n.id}`, a === "mostrar" ? { oculta: false } : a === "esconder" ? { oculta: true } : a === "destacar" ? { destaque: !n.destaque } : { coluna: (n.coluna + (a === "dir" ? 1 : ncol - 1)) % ncol });
          atualizar();
        };
      }
      $("#mu-cols").innerHTML = `<div class="mu-grelha" style="grid-template-columns:repeat(${cols.length},minmax(14rem,1fr))">${cols.map((c, i) => `<section class="mu-col">${c ? `<h2>${esc(c)}</h2>` : ""}${notas.filter((n) => Math.min(n.coluna, cols.length - 1) === i).map(nota).join("") || '<p class="pequeno">À espera das primeiras notas…</p>'}</section>`).join("")}</div>`;
      $("#mu-info").textContent = `${s.total} nota(s)${s.pendentes ? ` · ${s.pendentes} à espera de aprovação` : ""}`;
      $("#mu-aprovar").hidden = !s.pendentes;
      $("#s-estado").textContent = s.aberta ? "mural aberto" : s.expirada ? "fechado (passaram 12 horas: usa «Usar outra vez»)" : "mural fechado";
      $("#mu-fechar").textContent = s.aberta ? "Fechar o mural" : "Reabrir o mural"; $("#mu-fechar").disabled = s.expirada;
    };
    const V = await EINK.vigiarSondagem(id, desenhar);
  };

  // ---------- bilhete de saída ----------
  const PADRAO = [["escala", "Quanto percebeste da aula de hoje?"], ["texto", "Uma coisa que aprendeste"], ["texto", "Uma dúvida que ficou"]];
  async function bilhete() {
    const [l, ts] = await Promise.all([api("GET", "/api/sondagens?tipo=bilhete"), turmas()]);
    const meu = EINK.ler("bilhete.modelo", PADRAO);
    const linha = (q, i) => `<div class="linha bi-q"><select name="t${i}" aria-label="Tipo da pergunta ${i + 1}"><option value="escala" ${q[0] === "escala" ? "selected" : ""}>Escala 1 a 5</option><option value="texto" ${q[0] === "texto" ? "selected" : ""}>Texto curto</option><option value="" ${!q[1] ? "selected" : ""}>(sem pergunta)</option></select><input name="q${i}" maxlength="120" value="${esc(q[1])}" style="flex:1;min-width:14rem" aria-label="Pergunta ${i + 1}"></div>`;
    mostrar(`${voltar}<h1>Bilhete de saída</h1>
      <p class="pequeno">Nos últimos 3 minutos da aula, os alunos respondem no telemóvel (anónimo, um bilhete por aluno). Vês a média, o gráfico e as respostas. Fica guardado por turma e data.</p>
      <form class="painel" id="f-bil"><label>Título<input name="pergunta" maxlength="200" value="Bilhete de saída"></label>
        ${[0, 1, 2, 3].map((i) => linha(meu[i] || ["", ""], i)).join("")}
        <p class="linha">${EINK.seletorTurmaOpcional(ts, EINK.ler("turma", null))}<label class="inline"><input type="checkbox" name="modelo"> Guardar estas perguntas como o meu modelo</label><button>Abrir o bilhete</button></p></form>
      <h2>Anteriores</h2>${EINK.listaAnteriores(l, "Ainda não abriste bilhetes de saída.")}`);
    $("#f-bil").onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      const qs = [0, 1, 2, 3].map((i) => [f.get("t" + i), String(f.get("q" + i) || "").trim()]).filter(([t, q]) => t && q);
      if (!qs.length) return aviso("Escreve pelo menos uma pergunta.", true);
      if (f.get("modelo")) EINK.guardar("bilhete.modelo", qs);
      const r = await api("POST", "/api/sondagens", { tipo: "bilhete", pergunta: f.get("pergunta"), extra: { perguntas: qs.map(([tipo, texto]) => ({ tipo, texto })) }, turma: f.get("turma") || null });
      location.hash = "#/sondagem/" + r.id;
    };
    EINK.ligarCopiar();
  }
  EINK.vistaBilhete = async (id) => {
    let primeira = true;
    const desenhar = (s, atualizar) => {
      if (primeira) {
        primeira = false;
        mostrar(`<p class="nao-projetar"><a href="#/bilhete">← Bilhete de saída</a></p><div class="linha cab-ferr"><h1>${esc(s.pergunta)}</h1>${EINK.botaoProjetar()}</div>${EINK.blocoCodigo(s.codigo)}
          <p class="s-contador" id="bi-n"></p><div id="bi-res"></div>
          <p class="linha nao-projetar"><button id="bi-fechar" class="sec"></button><button id="bi-copiar" class="sec">Usar outra vez</button><button id="bi-repor" class="sec">Repor</button><button id="bi-apagar" class="perigo">Apagar</button></p>
          <div id="bi-hist" class="nao-projetar"></div>`);
        $("#bi-fechar").onclick = async () => { await api("POST", `/api/sondagens/${id}/estado`, { aberta: !V.ultima().aberta }); atualizar(); };
        $("#bi-copiar").onclick = async () => { const r = await api("POST", `/api/sondagens/${id}/copiar`, {}); location.hash = "#/sondagem/" + r.id; };
        $("#bi-repor").onclick = async () => { if (confirm("Apagar todas as respostas deste bilhete?")) { await api("POST", `/api/sondagens/${id}/repor`, {}); atualizar(); } };
        $("#bi-apagar").onclick = async () => { if (confirm("Apagar este bilhete de saída?")) { await api("DELETE", `/api/sondagens/${id}`); location.hash = "#/bilhete"; } };
        $("#bi-res").onclick = async (e) => { const x = e.target.closest("[data-rm]"); if (x) { await api("DELETE", `/api/sondagens/${id}/respostas/${x.dataset.rm}`); atualizar(); } };
        if (s.turma_id) api("GET", `/api/sondagens?tipo=bilhete&turma=${s.turma_id}`).then((l) => { if (l.length > 1) $("#bi-hist").innerHTML = `<h2>Bilhetes anteriores desta turma</h2>${EINK.listaAnteriores(l.filter((x) => x.id !== s.id), "")}`; EINK.ligarCopiar(); }).catch(() => {});
      }
      $("#bi-n").innerHTML = `<strong>${s.total}</strong> bilhete${s.total === 1 ? "" : "s"} entregue${s.total === 1 ? "" : "s"}`;
      $("#bi-res").innerHTML = s.resultados.map((r) => r.tipo === "escala" ? `<section class="painel"><h2>${esc(r.texto)}</h2><div class="bi-escala"><div class="bi-media"><strong>${r.media === null ? "–" : String(r.media).replace(".", ",")}</strong><span class="pequeno">média de ${r.n}</span></div><div class="bi-barras">${r.dist.map((x, k) => `<div class="bi-barra"><span class="bi-col lv${k + 1}" style="height:${r.n ? Math.max(4, (x / Math.max(1, ...r.dist)) * 100) : 4}%"></span><b>${x}</b><small>${k + 1}</small></div>`).join("")}</div></div></section>`
        : `<section class="painel"><h2>${esc(r.texto)}</h2>${EINK.nuvem(r.palavras, r.respostas)}</section>`).join("");
      $("#s-estado").textContent = s.aberta ? "aberto" : s.expirada ? "fechado (passaram 12 horas)" : "fechado";
      $("#bi-fechar").textContent = s.aberta ? "Fechar o bilhete" : "Reabrir o bilhete"; $("#bi-fechar").disabled = s.expirada;
    };
    const V = await EINK.vigiarSondagem(id, desenhar);
  };

  // ---------- placar de equipas ----------
  // Fica guardado no navegador (por turma), sem dados pessoais. Também se usa dentro do quiz no projetor.
  const NOMES_EQ = ["Vermelha", "Azul", "Amarela", "Verde", "Roxa", "Laranja"];
  EINK.placar = (el, estado, aoMudar, opc = {}) => {
    const hist = [];
    const pintar = () => {
      const ordem = [...estado.equipas.keys()].sort((a, b) => estado.equipas[b].pontos - estado.equipas[a].pontos);
      const max = Math.max(...estado.equipas.map((e) => e.pontos));
      el.innerHTML = `<div class="pl-grelha">${ordem.map((i, pos) => { const e = estado.equipas[i]; return `<div class="pl-eq c${i % 5}-borda ${estado.fim && e.pontos === max ? "pl-vence" : ""}" style="order:${pos}"><p class="pl-nome"><span class="pl-cor c${i % 5}"></span>${esc(e.nome)}${estado.fim && e.pontos === max ? " 🏆" : ""}</p><p class="pl-pontos" aria-live="polite">${e.pontos}</p>${e.membros ? `<p class="pequeno pl-membros">${esc(e.membros)}</p>` : ""}
        ${opc.semBotoes ? "" : `<p class="linha centro pl-bt"><button type="button" class="sec" data-eq="${i}" data-d="-1" aria-label="Menos 1 para ${esc(e.nome)}">−1</button><button type="button" data-eq="${i}" data-d="1" class="grande" aria-label="Mais 1 para ${esc(e.nome)}">+1</button><button type="button" class="sec" data-eq="${i}" data-d="5" aria-label="Mais 5 para ${esc(e.nome)}">+5</button></p>`}</div>`; }).join("")}</div>`;
    };
    el.onclick = (e) => { const b = e.target.closest("[data-eq]"); if (!b) return; const i = Number(b.dataset.eq), d = Number(b.dataset.d); hist.push([i, d]); estado.equipas[i].pontos = Math.max(0, estado.equipas[i].pontos + d); pintar(); aoMudar && aoMudar(); };
    pintar();
    return { pintar, desfazer: () => { const x = hist.pop(); if (x) { estado.equipas[x[0]].pontos = Math.max(0, estado.equipas[x[0]].pontos - x[1]); pintar(); aoMudar && aoMudar(); } }, somar: (i, d) => { hist.push([i, d]); estado.equipas[i].pontos += d; pintar(); aoMudar && aoMudar(); } };
  };
  async function placar() {
    await EINK.escolherTurma("Placar de equipas", async (t, el) => {
      const chave = "placar." + t.id;
      let estado = EINK.ler(chave, null);
      const grupos = await api("GET", `/api/turmas/${t.id}/grupos`).catch(() => []);
      const por = new Map(t.alunos.map((a) => [a.id, a]));
      const configurar = () => {
        el.innerHTML = `<form class="painel" id="pl-f"><p class="linha"><label>Número de equipas<input name="n" type="number" min="2" max="6" value="4" style="width:5rem"></label>
          ${grupos.length ? `<label>Ou usar grupos guardados<select name="g"><option value="">—</option>${grupos.map((g) => `<option value="${g.id}">${esc(g.nome)} (${g.dados.length})</option>`).join("")}</select></label>` : '<span class="pequeno">Podes guardar grupos no Sorteio e usá-los aqui.</span>'}</p><button>Começar</button></form>`;
        $("#pl-f").onsubmit = (e) => {
          e.preventDefault(); const f = new FormData(e.target), g = grupos.find((x) => x.id === Number(f.get("g")));
          const eqs = g ? g.dados.slice(0, 6).map((m, i) => ({ nome: `Grupo ${i + 1}`, pontos: 0, membros: m.map((id) => por.get(id)).filter(Boolean).map(EINK.nomeCurto).join(", ") })) : Array.from({ length: Math.min(6, Math.max(2, Number(f.get("n")) || 4)) }, (_, i) => ({ nome: NOMES_EQ[i], pontos: 0 }));
          estado = { equipas: eqs, fim: false }; EINK.guardar(chave, estado); jogar();
        };
      };
      const jogar = () => {
        el.innerHTML = `<div id="pl"></div><p class="linha centro nao-projetar"><button class="sec" id="pl-undo">Desfazer</button><button class="sec" id="pl-nomes">Mudar nomes</button><button id="pl-fim">${estado.fim ? "Continuar" : "Terminar"}</button><button class="perigo" id="pl-novo">Novo placar</button></p>`;
        const P = EINK.placar($("#pl"), estado, () => EINK.guardar(chave, estado));
        $("#pl-undo").onclick = () => P.desfazer();
        $("#pl-fim").onclick = () => { estado.fim = !estado.fim; EINK.guardar(chave, estado); jogar(); };
        $("#pl-nomes").onclick = () => { estado.equipas.forEach((e) => { const n = prompt(`Nome da equipa «${e.nome}»:`, e.nome); if (n) e.nome = n.slice(0, 30); }); EINK.guardar(chave, estado); P.pintar(); };
        $("#pl-novo").onclick = () => { if (confirm("Começar um placar novo? Os pontos atuais perdem-se.")) { estado = null; EINK.guardar(chave, null); configurar(); } };
      };
      if (estado && estado.equipas) jogar(); else configurar();
    }, { projetar: true });
  }

  // ---------- quiz no projetor (sem telemóveis) ----------
  async function quizProjetorLista() {
    const qs = await api("GET", "/api/quizzes");
    mostrar(`${voltar}<h1>Quiz no projetor</h1><p class="pequeno">Joga qualquer quiz sem telemóveis: a pergunta aparece no projetor e as equipas respondem a levantar o cartão com a forma certa (▲ ◆ ● ■ ★). Tu marcas as equipas que acertaram e o placar sobe.</p>
      <p><a class="botao sec" href="#/cartoes">Imprimir os cartões de resposta</a></p>
      <div class="painel"><ul class="lista">${qs.map((q) => `<li><span><strong>${esc(q.titulo)}</strong> <span class="pequeno">${q.perguntas} perguntas</span></span><a class="botao" href="#/quiz-projetor/${q.id}">Jogar no projetor</a></li>`).join("") || '<li class="pequeno">Ainda não tens quizzes. <a href="#/quizzes">Cria um ou usa um modelo</a>.</li>'}</ul></div>`);
  }
  async function quizProjetor(id) {
    const Q = await api("GET", `/api/quizzes/${id}`);
    let estado = null, i = 0, fase = "config", relogio = null, acertaram = new Set();
    const pararRelogio = () => { clearInterval(relogio); relogio = null; };
    parar.push(pararRelogio);
    const cab = () => `<p class="nao-projetar"><a href="#/quiz-projetor">← Quiz no projetor</a></p><div class="linha cab-ferr"><h1>${esc(Q.titulo)}</h1>${EINK.botaoProjetar()}</div>`;
    const desenhar = () => {
      pararRelogio();
      if (fase === "config") {
        mostrar(`${cab()}<form class="painel" id="qp-f"><p class="linha"><label>Equipas<input name="n" type="number" min="2" max="5" value="4" style="width:5rem"></label><label class="inline"><input type="checkbox" name="baralhar"> Baralhar as perguntas</label></p><p class="pequeno">${Q.perguntas.length} perguntas. Cada equipa precisa dos cartões das formas (<a href="#/cartoes">imprimir</a>).</p><button class="grande">Começar</button></form>`);
        $("#qp-f").onsubmit = (e) => { e.preventDefault(); const f = new FormData(e.target); if (f.get("baralhar")) Q.perguntas = EINK.baralhar(Q.perguntas); estado = { equipas: Array.from({ length: Math.min(5, Math.max(2, Number(f.get("n")) || 4)) }, (_, k) => ({ nome: NOMES_EQ[k], pontos: 0 })), fim: false }; i = 0; fase = "pergunta"; desenhar(); };
        return;
      }
      if (fase === "fim") {
        estado.fim = true;
        mostrar(`${cab()}<h2 class="centro">Fim do quiz!</h2><div id="qp-pl"></div><p class="linha centro nao-projetar"><button id="qp-outra">Jogar outra vez</button><a class="botao sec" href="#/quiz-projetor">Outro quiz</a></p>`);
        EINK.placar($("#qp-pl"), estado, null, { semBotoes: true });
        $("#qp-outra").onclick = () => { fase = "config"; desenhar(); };
        return;
      }
      const q = Q.perguntas[i], revelar = fase === "resposta", tempo = (q.tempo || Q.tempo || 20) * 1000;
      mostrar(`${cab()}<p class="pequeno">Pergunta ${i + 1} de ${Q.perguntas.length}</p><h2 class="pv-pergunta">${esc(q.texto)}</h2>${q.imagem ? `<img class="img-pergunta" src="/api/quizzes/${id}/imagens/${q.imagem}" alt="">` : ""}
        ${revelar ? "" : '<div class="barra-tempo"><div id="bt"></div></div>'}
        <div class="pv-opcoes">${q.opcoes.map((o, k) => `<div class="pv-op c${k % 5} ${revelar ? (q.certa === k ? "certa" : "apagada") : ""}"><span aria-hidden="true">${FORMAS[k % 5]}</span><span class="pv-txt">${esc(o)}</span></div>`).join("")}</div>
        ${revelar && q.explicacao ? `<p class="qp-exp">${esc(q.explicacao)}</p>` : ""}
        ${revelar ? `<p class="pequeno">Que equipas acertaram?</p><p class="linha centro qp-eqs">${estado.equipas.map((e, k) => `<button type="button" class="sec qp-eq c${k % 5}-borda" data-k="${k}" aria-pressed="${acertaram.has(k)}">${esc(e.nome)}${acertaram.has(k) ? " ✓" : ""}</button>`).join("")}</p>` : ""}
        <p class="linha centro">${revelar ? `<button id="qp-prox" class="grande">${i + 1 >= Q.perguntas.length ? "Ver o vencedor" : "Próxima pergunta"}</button>` : '<button id="qp-mais" class="sec">+10 segundos</button><button id="qp-mostrar" class="grande">Mostrar a resposta</button>'}</p>
        <div id="qp-pl" class="qp-placar"></div>`);
      EINK.placar($("#qp-pl"), estado, null, { semBotoes: true });
      if (!revelar) {
        let fimT = Date.now() + tempo;
        relogio = setInterval(() => { const r = Math.max(0, fimT - Date.now()), bt = $("#bt"); if (bt) bt.style.width = (r / tempo) * 100 + "%"; if (r <= 0) pararRelogio(); }, 100);
        $("#qp-mais").onclick = () => { fimT += 10000; };
        $("#qp-mostrar").onclick = () => { fase = "resposta"; acertaram = new Set(); desenhar(); };
      } else {
        $$("[data-k]").forEach((b) => { b.onclick = () => { const k = Number(b.dataset.k); if (acertaram.has(k)) acertaram.delete(k); else acertaram.add(k); desenhar(); }; });
        $("#qp-prox").onclick = () => { for (const k of acertaram) estado.equipas[k].pontos++; acertaram = new Set(); i++; fase = i >= Q.perguntas.length ? "fim" : "pergunta"; desenhar(); };
      }
    };
    desenhar();
  }
  // Cartões de resposta para imprimir: uma folha por equipa, um cartão por forma.
  function cartoes() {
    mostrar(`<p class="nao-imprimir"><a href="#/quiz-projetor">← Quiz no projetor</a></p><h1 class="nao-imprimir">Cartões de resposta</h1>
      <p class="pequeno nao-imprimir">Imprime uma folha por equipa e recorta os cartões. Na pergunta, a equipa levanta o cartão da forma da resposta que escolheu.</p>
      <p class="linha nao-imprimir"><label>Folhas<input id="ct-n" type="number" min="1" max="10" value="4" style="width:5rem"></label><button id="ct-imp">Imprimir</button></p>
      <div id="ct-folhas"></div>`);
    const pintar = () => { const n = Math.min(10, Math.max(1, Number($("#ct-n").value) || 1)); $("#ct-folhas").innerHTML = Array.from({ length: n }, (_, f) => `<section class="ct-folha"><p class="pequeno">Equipa ${NOMES_EQ[f % NOMES_EQ.length]}</p><div class="ct-grelha">${FORMAS.map((x, k) => `<div class="ct-cartao c${k}"><span>${x}</span></div>`).join("")}</div></section>`).join(""); };
    $("#ct-n").oninput = pintar; $("#ct-imp").onclick = () => window.print(); pintar();
  }

  // ---------- pergunta e roda de respostas ----------
  // Pergunta no ecrã, tempo para pensar e só depois o sorteio de quem responde (sem repetir, sem quem faltou).
  async function roda() {
    await EINK.escolherTurma("Pergunta e roda", async (t, el) => {
      const qs = await api("GET", "/api/quizzes").catch(() => []);
      const pref = EINK.ler("roda", { pensar: 20, perguntas: "" });
      el.innerHTML = `<form class="painel nao-projetar" id="ro-f"><label>Perguntas (uma por linha)<textarea name="perguntas" rows="5" placeholder="O que é a fotossíntese?&#10;Dá um exemplo de energia renovável.">${esc(pref.perguntas || "")}</textarea></label>
        <p class="linha">${qs.length ? `<label>Ou usar as perguntas de um quiz<select name="quiz"><option value="">—</option>${qs.map((q) => `<option value="${q.id}">${esc(q.titulo)}</option>`).join("")}</select></label>` : ""}<label>Tempo para pensar (s)<input name="pensar" type="number" min="0" max="120" value="${pref.pensar}" style="width:5rem"></label>
          <label class="inline"><input type="checkbox" name="registar"> Registar «Participou» quando acerta</label></p><button class="grande">Começar</button></form><div id="ro"></div>`;
      $("#ro-f").onsubmit = async (e) => {
        e.preventDefault(); const f = new FormData(e.target);
        let perguntas = String(f.get("perguntas")).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
        if (f.get("quiz")) perguntas = (await api("GET", `/api/quizzes/${f.get("quiz")}`)).perguntas.map((q) => q.texto);
        if (!perguntas.length) return aviso("Escreve pelo menos uma pergunta, ou escolhe um quiz.", true);
        EINK.guardar("roda", { pensar: Number(f.get("pensar")) || 0, perguntas: f.get("quiz") ? pref.perguntas : f.get("perguntas") });
        $("#ro-f").hidden = true; iniciar(perguntas, Number(f.get("pensar")) || 0, !!f.get("registar"));
      };
      const iniciar = async (perguntas, pensar, registar) => {
        const ausentes = new Set(); try { const p = await api("GET", `/api/turmas/${t.id}/presencas?data=${EINK.hoje()}`); for (const [id, x] of Object.entries(p)) if (x === "F") ausentes.add(Number(id)); } catch { /* sem chamada */ }
        const disp = t.alunos.filter((a) => !ausentes.has(a.id)); let saidos = new Set(), i = 0, rel = null, aluno = null;
        const res = []; // { pergunta, aluno, resultado } (só para o professor)
        const cartao = (a) => `<span class="sort-al">${EINK.foto(a, "foto-sort")}<span>${esc(a.nome)}</span></span>`;
        const pararR = () => { clearInterval(rel); rel = null; }; parar.push(pararR);
        const resumo = () => `<details class="painel nao-projetar"><summary>Quem já respondeu (${res.length}) · só tu vês</summary><ul class="lista">${res.map((r) => `<li><span>${esc(r.aluno)}</span><span class="pequeno">${r.resultado} · ${esc(r.pergunta.slice(0, 60))}</span></li>`).join("")}</ul></details>`;
        const passo = () => {
          pararR(); aluno = null;
          if (i >= perguntas.length) { $("#ro").innerHTML = `<h2 class="centro">Acabaram as perguntas!</h2>${resumo()}<p class="linha centro nao-projetar"><button id="ro-nova">Novas perguntas</button></p>`; $("#ro-nova").onclick = () => { $("#ro-f").hidden = false; $("#ro").innerHTML = ""; }; return; }
          $("#ro").innerHTML = `<p class="pequeno">Pergunta ${i + 1} de ${perguntas.length}</p><h2 class="ro-pergunta">${esc(perguntas[i])}</h2>
            <div class="ro-pensar" id="ro-pensar"></div><div class="sorteado" id="ro-al" aria-live="polite"></div>
            <p class="linha centro" id="ro-bt"><button id="ro-sort" class="grande">${pensar ? "Sortear já" : "Sortear quem responde"}</button><button class="sec" id="ro-salta">Saltar pergunta</button></p>${resumo()}`;
          let resta = pensar;
          const sortear = async () => {
            pararR(); $("#ro-pensar").textContent = "";
            let l = disp.filter((a) => !saidos.has(a.id)); if (!l.length) { saidos = new Set(); l = disp; }
            if (!l.length) return aviso("A turma não tem alunos disponíveis.", true);
            aluno = l[EINK.acaso(l.length)]; saidos.add(aluno.id);
            $("#ro-bt").innerHTML = "";
            await EINK.animarSorteio($("#ro-al"), disp, aluno, cartao);
            $("#ro-bt").innerHTML = `<button class="grande" data-r="Certo">✓ Certo</button><button class="sec grande" data-r="Errado">✗ Errado</button><button class="sec grande" data-r="Passa">Passa</button>`;
            $$("[data-r]", $("#ro-bt")).forEach((b) => { b.onclick = async () => {
              const r = b.dataset.r; res.push({ pergunta: perguntas[i], aluno: aluno.nome, resultado: r });
              if (r === "Passa") { sortear(); return; }
              if (registar && r === "Certo") api("POST", `/api/turmas/${t.id}/registos`, { aluno: aluno.id, tipo: "Participou", data: EINK.hoje() }).catch(() => {});
              i++; passo();
            }; });
          };
          if (pensar) { $("#ro-pensar").textContent = `A pensar… ${resta} s`; rel = setInterval(() => { resta--; if (resta <= 0) sortear(); else if ($("#ro-pensar")) $("#ro-pensar").textContent = `A pensar… ${resta} s`; }, 1000); }
          $("#ro-sort").onclick = sortear; $("#ro-salta").onclick = () => { i++; passo(); };
        };
        passo();
      };
    }, { projetar: true });
  }

  // ---------- ecrã da tarefa ----------
  const MODOS = [["individual", "🤫", "Individual, em silêncio"], ["pares", "👥", "Em pares"], ["grupo", "🧑‍🤝‍🧑", "Em grupo"], ["ouvir", "✋", "Ouvir o professor"]];
  function tarefa() {
    const pref = EINK.ler("tarefa", { modo: "individual", passos: "", min: 10, modelos: [] });
    let t = null, fim = null;
    mostrar(`${voltar}<div class="linha cab-ferr"><h1>Ecrã da tarefa</h1>${EINK.botaoProjetar()}</div>
      <div class="ta-ecra"><div class="ta-modo" id="ta-modo"></div><ol class="ta-passos" id="ta-passos"></ol><p class="ta-tempo" id="ta-tempo" hidden></p></div>
      <div class="painel nao-projetar"><p class="linha" role="group" aria-label="Modo de trabalho">${MODOS.map(([k, i, n]) => `<button type="button" class="sec ta-bt" data-modo="${k}" aria-pressed="${pref.modo === k}"><span aria-hidden="true">${i}</span> ${n}</button>`).join("")}</p>
        <label>Passos da tarefa (um por linha)<textarea id="ta-txt" rows="4" placeholder="Lê o texto da página 42&#10;Sublinha as ideias principais&#10;Responde às perguntas 1 a 3">${esc(pref.passos)}</textarea></label>
        <p class="linha"><label>Tempo (min, opcional)<input id="ta-min" type="number" min="0" max="120" value="${pref.min}" style="width:5rem"></label><button class="sec" id="ta-ini">Iniciar o tempo</button>
          <button class="sec" id="ta-gmod">Guardar como modelo</button>${pref.modelos.length ? `<label>Modelos<select id="ta-mods"><option value="">Escolher…</option>${pref.modelos.map((m, i) => `<option value="${i}">${esc(m.nome)}</option>`).join("")}</select></label>` : ""}</p></div>`);
    const gravar = () => EINK.guardar("tarefa", pref);
    const pintar = () => {
      const m = MODOS.find((x) => x[0] === pref.modo) || MODOS[0];
      $("#ta-modo").innerHTML = `<span class="ta-icone" aria-hidden="true">${m[1]}</span><span>${m[2]}</span>`;
      $("#ta-passos").innerHTML = pref.passos.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join("");
      $$("[data-modo]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.modo === pref.modo)));
    };
    $$("[data-modo]").forEach((b) => { b.onclick = () => { pref.modo = b.dataset.modo; gravar(); pintar(); }; });
    $("#ta-txt").oninput = (e) => { pref.passos = e.target.value; gravar(); pintar(); };
    $("#ta-min").onchange = (e) => { pref.min = Math.max(0, Math.min(120, Number(e.target.value) || 0)); gravar(); };
    $("#ta-ini").onclick = () => {
      clearInterval(t); if (!pref.min) { $("#ta-tempo").hidden = true; return; }
      fim = Date.now() + pref.min * 60000; $("#ta-tempo").hidden = false;
      const passo = () => { const s = Math.max(0, Math.ceil((fim - Date.now()) / 1000)); $("#ta-tempo").textContent = `⏱ ${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; $("#ta-tempo").classList.toggle("fim", s === 0); if (!s) clearInterval(t); };
      passo(); t = setInterval(passo, 500);
    };
    $("#ta-gmod").onclick = () => { const nome = prompt("Nome do modelo:"); if (!nome) return; pref.modelos = [...pref.modelos.filter((m) => m.nome !== nome), { nome, modo: pref.modo, passos: pref.passos, min: pref.min }].slice(-12); gravar(); tarefa(); };
    if ($("#ta-mods")) $("#ta-mods").onchange = (e) => { const m = pref.modelos[Number(e.target.value)]; if (m) { Object.assign(pref, { modo: m.modo, passos: m.passos, min: m.min }); gravar(); tarefa(); } };
    parar.push(() => clearInterval(t));
    pintar();
  }

  EINK.rotas.push([/^\/mural$/, mural], [/^\/bilhete$/, bilhete], [/^\/placar$/, placar], [/^\/quiz-projetor$/, quizProjetorLista], [/^\/quiz-projetor\/(\d+)$/, (id) => quizProjetor(+id)], [/^\/cartoes$/, cartoes], [/^\/roda$/, roda], [/^\/tarefa$/, tarefa]);
})();
