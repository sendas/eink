"use strict";
// Quizzes estilo Kahoot: editor de perguntas (portado do tic.techpro.pt) e ecrã do docente no jogo ao vivo.
(() => {
  const { api, aviso, mostrar, esc, $, $$ } = EINK;
  const voltar = EINK.voltarSala;
  const FORMAS = ["▲", "◆", "●", "■", "★"];
  const parar = [];
  const aoSairAnt = EINK.aoSair;
  EINK.aoSair = () => { aoSairAnt && aoSairAnt(); while (parar.length) parar.pop()(); };
  const qrSvg = (url) => { try { const qr = window.qrcode(0, "M"); qr.addData(url); qr.make(); return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); } catch { return ""; } };

  // ---------- lista ----------
  async function lista() {
    const [qs, modelos, vivas, parts] = await Promise.all([api("GET", "/api/quizzes"), api("GET", "/api/quiz-modelos"), api("GET", "/api/vivo"), api("GET", "/api/partilhas?tipo=quiz")]);
    mostrar(`${voltar}<h1>Quizzes</h1>
      <p class="pequeno">Cria perguntas de escolha múltipla e joga com a turma: os alunos entram no telemóvel com um código e uma alcunha (sem conta), respondem a tempo e há ranking por pontos.</p>
      ${vivas.length ? `<section class="painel"><strong>Jogos em curso</strong><ul class="lista">${vivas.map((v) => `<li><span>${esc(v.titulo)} <span class="pequeno">código ${esc(v.pin)} · ${v.jogadores} jogadores</span></span><a class="botao sec" href="#/vivo/${v.pin}">Voltar ao jogo</a></li>`).join("")}</ul></section>` : ""}
      <p class="linha"><a class="botao" href="#/quiz/novo">Novo quiz</a></p>
      <div class="painel"><ul class="lista">${qs.map((q) => `<li><span><a href="#/quiz/${q.id}"><strong>${esc(q.titulo)}</strong></a> <span class="pequeno">${q.perguntas} perguntas</span></span><span class="linha"><button data-vivo="${q.id}">Jogar ao vivo</button><button class="sec" data-opcoes="${q.id}" aria-expanded="false">Outras formas de jogar</button><a class="botao sec" href="#/quiz-resultados/${q.id}">Resultados</a><button class="sec" data-dup="${q.id}">Duplicar</button><button class="sec" data-part="${q.id}" data-t="${esc(q.titulo)}">Partilhar com o grupo</button></span></li>`).join("") || '<li class="pequeno">Ainda não tens quizzes. Cria um novo ou começa por um modelo.</li>'}</ul></div>
      ${parts.length ? `<h2>Partilhados pelo meu grupo disciplinar</h2><div class="painel"><ul class="lista">${parts.map((x) => `<li><span>${esc(x.titulo)} <span class="pequeno">${x.n} perguntas · ${esc(x.autor)}</span></span><span class="linha"><button class="sec" data-usar="${x.id}">Copiar para os meus quizzes</button>${x.minha || EINK.eu.admin ? `<button class="perigo" data-retirar="${x.id}">Retirar</button>` : ""}</span></li>`).join("")}</ul></div>` : ""}
      <h2>Modelos</h2><p class="pequeno">Quizzes prontos (feitos para a disciplina de TIC). Ao escolher um, fica uma cópia tua, que podes editar.</p>
      <div class="painel"><ul class="lista">${modelos.map((m) => `<li><span>${esc(m.titulo)} <span class="pequeno">${m.perguntas} perguntas</span></span><button class="sec" data-mod="${esc(m.id)}">Usar este modelo</button></li>`).join("")}</ul></div>`);
    $$("[data-vivo]").forEach((b) => { b.onclick = async () => { try { const r = await api("POST", `/api/quizzes/${b.dataset.vivo}/vivo`, {}); location.hash = "#/vivo/" + r.pin; } catch { /* aviso mostrado */ } }; });
    // Outras formas de jogar: por equipas, com perguntas baralhadas, revisão ao próprio ritmo ou no projetor sem telemóveis.
    $$("[data-opcoes]").forEach((b) => { b.onclick = () => {
      const li = b.closest("li"), ja = li.nextElementSibling && li.nextElementSibling.classList.contains("q-opcoes");
      $$(".q-opcoes").forEach((x) => x.remove()); $$("[data-opcoes]").forEach((x) => x.setAttribute("aria-expanded", "false"));
      if (ja) return;
      b.setAttribute("aria-expanded", "true");
      li.insertAdjacentHTML("afterend", `<li class="q-opcoes"><form class="painel" id="q-op-f"><fieldset class="sem-borda"><legend><strong>Como queres jogar?</strong></legend>
        <label class="inline"><input type="radio" name="modo" value="vivo" checked> Ao vivo, todos ao mesmo tempo</label>
        <label class="inline"><input type="radio" name="modo" value="ritmo"> Revisão ao próprio ritmo <span class="pequeno">(cada aluno avança sozinho, sem tempo, e vê a explicação; bom para trabalho de casa)</span></label></fieldset>
        <div class="linha"><label>Equipas (só ao vivo)<select name="equipas"><option value="0">Sem equipas</option><option value="2">2 equipas</option><option value="3">3 equipas</option><option value="4">4 equipas</option></select></label>
        <label>Fica aberto (revisão)<select name="horas"><option value="1">1 hora</option><option value="4" selected>4 horas</option><option value="12">12 horas</option><option value="24">24 horas</option></select></label>
        <label class="inline"><input type="checkbox" name="baralhar"> Baralhar perguntas e opções</label></div>
        <p class="linha"><button>Abrir o jogo</button><a class="botao sec" href="#/quiz-projetor/${b.dataset.opcoes}">Jogar no projetor, sem telemóveis</a></p></form></li>`);
      $("#q-op-f").onsubmit = async (e) => {
        e.preventDefault(); const f = new FormData(e.target);
        try { const r = await api("POST", `/api/quizzes/${b.dataset.opcoes}/vivo`, { equipas: Number(f.get("equipas")), ritmo: f.get("modo") === "ritmo", horas: Number(f.get("horas")), baralhar: !!f.get("baralhar") }); location.hash = "#/vivo/" + r.pin; } catch { /* aviso mostrado */ }
      };
    }; });
    $$("[data-dup]").forEach((b) => { b.onclick = async () => { await api("POST", `/api/quizzes/${b.dataset.dup}/duplicar`, {}); lista(); }; });
    $$("[data-part]").forEach((b) => { b.onclick = async () => { const titulo = prompt("Título da partilha:", b.dataset.t); if (titulo) { try { await api("POST", "/api/partilhas", { tipo: "quiz", quiz: Number(b.dataset.part), titulo }); aviso("Quiz partilhado com o teu grupo disciplinar (sem imagens)."); lista(); } catch { /* aviso mostrado */ } } }; });
    $$("[data-usar]").forEach((b) => { b.onclick = async () => { const r = await api("POST", "/api/quizzes/de-partilha", { partilha: Number(b.dataset.usar) }); location.hash = "#/quiz/" + r.id; }; });
    $$("[data-retirar]").forEach((b) => { b.onclick = async () => { if (confirm("Retirar esta partilha? Quem já a copiou fica com a cópia.")) { await api("DELETE", "/api/partilhas/" + b.dataset.retirar); lista(); } }; });
    $$("[data-mod]").forEach((b) => { b.onclick = async () => { const r = await api("POST", "/api/quizzes/de-modelo", { modelo: b.dataset.mod }); location.hash = "#/quiz/" + r.id; }; });
  }

  // Reduz a imagem no navegador (máx. 1000 px, JPEG) para ficar leve para os telemóveis dos alunos; devolve base64.
  function reduzirImagem(ficheiro) {
    // Lê-se como «data:» (e não como «blob:»), porque a política de segurança da página só deixa carregar imagens do próprio sítio e data:.
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onerror = () => reject(new Error("imagem"));
      leitor.onload = () => {
        const img = new Image();
        img.onload = () => {
          const f = Math.min(1, 1000 / Math.max(img.width, img.height)), c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.width * f)); c.height = Math.max(1, Math.round(img.height * f));
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/jpeg", 0.82).split(",")[1]);
        };
        img.onerror = () => reject(new Error("imagem"));
        img.src = leitor.result;
      };
      leitor.readAsDataURL(ficheiro);
    });
  }

  // ---------- editor ----------
  const perguntaVazia = () => ({ texto: "", opcoes: ["", "", "", ""], certa: 0, explicacao: "", tempo: "" });
  async function editor(id) {
    const Q = id ? await api("GET", `/api/quizzes/${id}`) : { titulo: "", intro: "", tempo: 20, perguntas: [perguntaVazia()] };
    let perg = Q.perguntas.map((p) => ({ ...p, tempo: p.tempo || "" }));
    const desenhar = () => {
      mostrar(`<p><a href="#/quizzes">← Quizzes</a></p><h1>${id ? "Editar quiz" : "Novo quiz"}</h1>
        <form id="f-quiz"><div class="painel linha"><label>Título<input id="q-titulo" required maxlength="100" value="${esc(Q.titulo)}" style="min-width:18rem"></label><label>Tempo por pergunta (s)<input id="q-tempo" type="number" min="0" max="120" value="${Q.tempo ?? 20}" style="width:6rem"></label></div>
        <label>Introdução (opcional)<input id="q-intro" maxlength="600" value="${esc(Q.intro || "")}"></label>
        <p><label class="inline"><input type="checkbox" id="q-baralhar" ${Q.baralhar ? "checked" : ""}> Baralhar sempre as perguntas e as opções quando se joga</label></p>
        ${perg.map((p, i) => `<section class="painel" data-i="${i}"><div class="linha"><strong>Pergunta ${i + 1}</strong><button type="button" class="sec" data-sobe="${i}" aria-label="Subir">↑</button><button type="button" class="sec" data-desce="${i}" aria-label="Descer">↓</button><button type="button" class="perigo" data-del="${i}">Apagar</button></div>
          <label>Pergunta<input class="p-texto" maxlength="300" value="${esc(p.texto)}"></label>
          <div class="linha">${p.imagem && id ? `<img class="img-pergunta" style="max-height:8rem;margin:0" src="/api/quizzes/${id}/imagens/${p.imagem}" alt="Imagem da pergunta ${i + 1}"><button type="button" class="perigo" data-sem-img="${i}">Tirar a imagem</button>` : id ? `<label>Imagem (opcional)<input type="file" accept="image/jpeg,image/png,image/webp" data-img="${i}"></label>` : '<span class="pequeno">Guarda o quiz para poderes juntar imagens às perguntas.</span>'}</div>
          <fieldset class="sem-borda"><legend class="pequeno">Opções (marca a certa)</legend>${p.opcoes.map((o, k) => `<div class="linha"><label class="inline"><input type="radio" name="certa${i}" value="${k}" ${p.certa === k ? "checked" : ""} aria-label="Opção ${k + 1} é a certa"> ${FORMAS[k]}</label><input class="p-op" data-k="${k}" maxlength="150" value="${esc(o)}" style="flex:1;min-width:12rem" aria-label="Opção ${k + 1}">${p.opcoes.length > 2 ? `<button type="button" class="sec" data-tirar="${i}.${k}" aria-label="Tirar opção ${k + 1}">✕</button>` : ""}</div>`).join("")}<div class="linha">${p.opcoes.length < 5 ? `<button type="button" class="sec" data-mais="${i}">+ Opção</button>` : ""}<button type="button" class="sec" data-vf="${i}">Verdadeiro ou falso</button></div></fieldset>
          <div class="linha"><label>Tempo desta pergunta (s, opcional)<input class="p-tempo" type="number" min="0" max="120" value="${p.tempo}" style="width:7rem"></label><label style="flex:1">Explicação (aparece depois da resposta)<input class="p-exp" maxlength="500" value="${esc(p.explicacao || "")}"></label></div></section>`).join("")}
        <p class="linha"><button type="button" class="sec" id="q-add">+ Pergunta</button><button type="button" class="sec" id="q-importar">Importar perguntas (JSON)</button><button>Guardar quiz</button></p></form>
        <div id="q-imp" hidden class="painel"><label>Cola uma lista JSON: [{"texto": "...", "opcoes": ["a","b"], "certa": 0, "explicacao": "..."}]<textarea id="q-imp-t" rows="6"></textarea></label><p><button type="button" id="q-imp-ok">Acrescentar</button></p></div>`);
      const ler = () => $$("section[data-i]").map((s, i) => ({ ...perg[i], texto: $(".p-texto", s).value, opcoes: $$(".p-op", s).map((x) => x.value), certa: Number((($("input[type=radio]:checked", s)) || { value: 0 }).value), tempo: $(".p-tempo", s).value, explicacao: $(".p-exp", s).value }));
      const refrescar = (f) => { perg = ler(); Q.titulo = $("#q-titulo").value; Q.intro = $("#q-intro").value; Q.tempo = $("#q-tempo").value; Q.baralhar = $("#q-baralhar").checked; f(); desenhar(); };
      $$("[data-img]").forEach((f) => { f.onchange = async () => {
        const ficheiro = f.files[0]; if (!ficheiro) return;
        try {
          const base64 = await reduzirImagem(ficheiro);
          const r = await api("POST", `/api/quizzes/${id}/imagens`, { base64 });
          refrescar(() => { perg[Number(f.dataset.img)].imagem = r.id; });
        } catch (e) { if (!e.message || e.message === "Error") aviso("Não consegui ler a imagem.", true); }
      }; });
      $$("[data-sem-img]").forEach((b) => { b.onclick = () => refrescar(() => { const p = perg[Number(b.dataset.semImg)]; api("DELETE", `/api/quizzes/${id}/imagens/${p.imagem}`).catch(() => {}); delete p.imagem; }); });
      $$("[data-sobe]").forEach((b) => { b.onclick = () => refrescar(() => { const i = +b.dataset.sobe; if (i > 0) [perg[i - 1], perg[i]] = [perg[i], perg[i - 1]]; }); });
      $$("[data-desce]").forEach((b) => { b.onclick = () => refrescar(() => { const i = +b.dataset.desce; if (i < perg.length - 1) [perg[i + 1], perg[i]] = [perg[i], perg[i + 1]]; }); });
      $$("[data-del]").forEach((b) => { b.onclick = () => refrescar(() => { if (perg.length > 1 && confirm("Apagar esta pergunta?")) perg.splice(+b.dataset.del, 1); }); });
      $$("[data-mais]").forEach((b) => { b.onclick = () => refrescar(() => perg[+b.dataset.mais].opcoes.push("")); });
      $$("[data-tirar]").forEach((b) => { b.onclick = () => refrescar(() => { const [i, k] = b.dataset.tirar.split(".").map(Number); perg[i].opcoes.splice(k, 1); if (perg[i].certa >= perg[i].opcoes.length || perg[i].certa === k) perg[i].certa = 0; }); });
      $$("[data-vf]").forEach((b) => { b.onclick = () => refrescar(() => { const p = perg[+b.dataset.vf]; p.opcoes = ["Verdadeiro", "Falso"]; if (p.certa > 1) p.certa = 0; }); });
      $("#q-add").onclick = () => refrescar(() => { if (perg.length < 40) perg.push(perguntaVazia()); });
      $("#q-importar").onclick = () => { $("#q-imp").hidden = !$("#q-imp").hidden; };
      $("#q-imp-ok").onclick = () => {
        try { const l = JSON.parse($("#q-imp-t").value); if (!Array.isArray(l)) throw new Error("Tem de ser uma lista."); refrescar(() => { for (const x of l.slice(0, 40 - perg.length)) perg.push({ texto: String(x.texto || ""), opcoes: (x.opcoes || []).map(String).slice(0, 5), certa: Number(x.certa) || 0, explicacao: String(x.explicacao || ""), tempo: x.tempo || "" }); if (perg.length > 1 && !perg[0].texto) perg.shift(); }); }
        catch (e) { aviso("JSON inválido: " + e.message, true); }
      };
      $("#f-quiz").onsubmit = async (e) => {
        e.preventDefault(); perg = ler();
        const corpo = { titulo: $("#q-titulo").value, intro: $("#q-intro").value, tempo: $("#q-tempo").value, baralhar: $("#q-baralhar").checked, perguntas: perg.map((p) => ({ texto: p.texto, opcoes: p.opcoes, certa: p.certa, explicacao: p.explicacao, tempo: p.tempo, imagem: p.imagem })) };
        try { await api(id ? "PUT" : "POST", id ? `/api/quizzes/${id}` : "/api/quizzes", corpo); aviso("Quiz guardado."); location.hash = "#/quizzes"; } catch { /* aviso mostrado */ }
      };
    };
    desenhar();
  }

  // Análise por pergunta: % de acertos, a opção errada mais escolhida e as perguntas a rever (menos de 50 % de acertos).
  const analisePerguntas = (ps) => {
    if (!ps || !ps.length) return "";
    if (!ps[0].texto) return `<p class="pequeno">Acertos por pergunta: ${ps.map((p, i) => `${i + 1}: ${p.pct} %`).join(" · ")}</p>`;
    const rever = ps.map((p, i) => [p, i]).filter(([p]) => p.pct < 50);
    return `${rever.length ? `<div class="q-rever"><strong>Perguntas a rever:</strong> ${rever.map(([p, i]) => `${i + 1} (${p.pct} %)`).join(", ")}</div>` : '<p class="pequeno">Todas as perguntas tiveram pelo menos metade de acertos.</p>'}
      <details><summary>Análise por pergunta</summary><div class="tabela-rolagem"><table><thead><tr><th>#</th><th>Pergunta</th><th class="num">Acertos</th><th>Resposta errada mais escolhida</th></tr></thead><tbody>${ps.map((p, i) => `<tr class="${p.pct < 50 ? "q-fraca" : ""}"><td>${i + 1}</td><td>${esc(p.texto)}<br><span class="pequeno">Certa: ${esc(p.opcoes[p.certa] || "")}</span></td><td class="num">${p.pct} %</td><td>${p.errada >= 0 ? `${esc(p.opcoes[p.errada])} <span class="pequeno">(${p.contagem[p.errada]} de ${p.respostas})</span>` : "–"}</td></tr>`).join("")}</tbody></table></div></details>`;
  };

  // ---------- resultados guardados ----------
  async function resultados(id) {
    const [q, r] = await Promise.all([api("GET", `/api/quizzes/${id}`), api("GET", `/api/quizzes/${id}/resultados`)]);
    mostrar(`<p><a href="#/quizzes">← Quizzes</a></p><h1>Resultados: ${esc(q.titulo)}</h1>${r.map((x) => `<section class="painel"><strong>${esc(x.quando)}</strong> · ${x.jogadores} jogadores
      <div class="tabela-rolagem"><table><thead><tr><th>#</th><th>Alcunha</th><th class="num">Pontos</th><th class="num">Certas</th></tr></thead><tbody>${x.ranking.slice(0, 10).map((j, i) => `<tr><td>${i + 1}</td><td>${esc(j.nome)}</td><td class="num">${j.pontos}</td><td class="num">${j.certas}</td></tr>`).join("")}</tbody></table></div>
      ${x.equipas && x.equipas.length ? `<p><strong>Equipas:</strong> ${x.equipas.map((e, i) => `${i + 1}.º ${esc(e.nome)} (média ${e.media} pontos, ${e.membros} alunos)`).join(" · ")}</p>` : ""}
      ${analisePerguntas(x.perguntas)}</section>`).join("") || '<p class="pequeno">Ainda não jogaste este quiz até ao fim.</p>'}`);
  }

  // ---------- ecrã do docente no jogo ao vivo ----------
  async function vivo(pin) {
    let rev = -1, V = null, recebido = 0, parado = false, chaveAnt = "", temporizador = null;
    const urlJogo = `${location.origin}/j/${pin}`;
    const chave = (v) => [v.fase, v.idx, v.respondidos, v.jogadores.length, v.ritmo ? JSON.stringify(v.ranking.map((x) => x.pontos)) + v.concluiram : ""].join("|");
    const acao = async (a) => { try { const d = await api("POST", `/api/vivo/${pin}/acao`, { acao: a }); if (a === "fechar") { parado = true; location.hash = "#/quizzes"; return; } aplicar(d); } catch { /* aviso mostrado */ } };
    const imagem = (v) => (v.pergunta.imagem ? `<img class="img-pergunta" src="/j/img/${pin}/${v.pergunta.imagem}" alt="">` : "");
    const opcoes = (v, revelar) => `<div class="pv-opcoes">${v.pergunta.opcoes.map((o, k) => `<div class="pv-op c${k % 5} ${revelar ? (v.certa === k ? "certa" : "apagada") : ""}"><span aria-hidden="true">${FORMAS[k % 5]}</span><span class="pv-txt">${esc(o)}</span>${revelar && v.contagem ? `<b>${v.contagem[k]}</b>` : ""}</div>`).join("")}</div>`;
    const rankEq = (v) => (v.equipas && v.equipas.length ? `<div class="pl-equipas">${v.equipas.map((e, i) => `<div class="pl-eq eq${e.equipa}"><span>${i + 1}.º ${esc(e.nome)}</span><b>${e.media}</b><small>média · ${e.membros} alunos</small></div>`).join("")}</div>` : "");
    const rank = (v, n) => `<ol class="topo-jogo">${v.ranking.slice(0, n).map((x, i) => `<li><span>${i + 1}. ${esc(x.nome)}${x.ult ? ` <span class="pequeno">+${x.ult}</span>` : ""}</span><b>${x.pontos}</b></li>`).join("")}</ol>`;
    function desenhar(v) {
      clearInterval(temporizador);
      const cab = `<p class="linha"><a href="#/quizzes">← Quizzes</a><span class="pequeno">Código ${esc(pin)} · ${esc(v.titulo)}</span></p>`;
      if (v.ritmo) {
        const exp = new Date(v.expira).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
        mostrar(`${cab}<h1>Revisão ao próprio ritmo</h1><p>Os alunos entram em <strong>${esc(urlJogo.replace(/^https?:\/\//, ""))}</strong> com o código <strong class="pv-codigo">${esc(pin)}</strong> até às ${exp} (hora de Lisboa).</p><div class="s-qr">${qrSvg(urlJogo)}</div>
          <p><strong>${v.jogadores.length}</strong> aluno(s) entraram · <strong>${v.concluiram}</strong> concluíram</p>${rankEq(v)}
          <h2>Classificação</h2>${rank(v, 10)}${analisePerguntas(v.perguntas)}
          <p class="linha">${v.fase === "fim" ? '<span class="pequeno">Revisão terminada: o resumo ficou em «Resultados» do quiz.</span><button id="v-fechar">Fechar a sala</button>' : '<button id="v-terminar">Terminar e guardar os resultados</button>'}</p>`);
        if ($("#v-terminar")) $("#v-terminar").onclick = () => { if (confirm("Terminar a revisão? Os alunos deixam de poder responder.")) acao("terminar"); };
        if ($("#v-fechar")) $("#v-fechar").onclick = () => acao("fechar");
        return;
      }
      if (v.fase === "sala") {
        mostrar(`${cab}<div class="pv-sala"><h1>Entrem em <span class="pv-pin">${esc(urlJogo.replace(/^https?:\/\//, ""))}</span></h1><p>ou em <strong>${esc(location.host)}/jogar</strong> com o código <strong class="pv-codigo">${esc(pin)}</strong></p><div class="s-qr" style="margin:0 auto">${qrSvg(urlJogo)}</div>
          <h2>${v.jogadores.length} jogador(es)</h2><div class="m-pool" style="justify-content:center">${v.jogadores.map((n) => `<span class="m-chip">${esc(n)}</span>`).join("") || '<span class="pequeno">À espera dos alunos…</span>'}</div>
          <p class="linha" style="justify-content:center"><button class="grande" id="v-comecar" ${v.jogadores.length ? "" : "disabled"}>Começar</button><button class="perigo" id="v-fechar">Cancelar o jogo</button></p></div>`);
        $("#v-comecar").onclick = () => acao("comecar");
        $("#v-fechar").onclick = () => { if (confirm("Cancelar o jogo? Os alunos saem da sala.")) acao("fechar"); };
      } else if (v.fase === "pergunta") {
        mostrar(`${cab}<p class="pequeno">Pergunta ${v.idx + 1} de ${v.total} · ${v.respondidos} de ${v.jogadores.length} responderam</p><h1 class="pv-pergunta">${esc(v.pergunta.texto)}</h1>${imagem(v)}<div class="barra-tempo"><div id="bt"></div></div>${opcoes(v, false)}
          <p class="linha"><button id="v-mais" class="sec">+10 segundos</button><button id="v-mostrar">Mostrar a resposta</button></p>`);
        $("#v-mais").onclick = () => acao("mais"); $("#v-mostrar").onclick = () => acao("mostrar");
        const bt = $("#bt"), total = v.tempo;
        temporizador = setInterval(() => { const r = Math.max(0, v.restante - (performance.now() - recebido)); if (bt) bt.style.width = Math.min(100, (r / total) * 100) + "%"; }, 100);
      } else if (v.fase === "resposta") {
        mostrar(`${cab}<p class="pequeno">Pergunta ${v.idx + 1} de ${v.total} · ${v.semResposta} sem resposta</p><h1 class="pv-pergunta">${esc(v.pergunta.texto)}</h1>${imagem(v)}${opcoes(v, true)}${v.explicacao ? `<p>${esc(v.explicacao)}</p>` : ""}
          ${rankEq(v)}<h2>Classificação</h2>${rank(v, 5)}<p class="linha"><button id="v-prox">${v.idx + 1 >= v.total ? "Terminar" : "Próxima pergunta"}</button></p>`);
        $("#v-prox").onclick = () => acao("proxima");
      } else {
        mostrar(`${cab}<h1>Fim do jogo!</h1>${v.equipas && v.equipas.length ? `<h2>Ganhou a equipa ${esc(v.equipas[0].nome)}!</h2>${rankEq(v)}` : ""}<h2>Classificação final</h2>${rank(v, 10)}${analisePerguntas(v.perguntas)}<p class="linha"><button id="v-csv" class="sec">Descarregar (CSV)</button><button id="v-fechar">Fechar a sala</button></p><p class="pequeno">O resumo ficou guardado em «Resultados» do quiz.</p>`);
        $("#v-fechar").onclick = () => acao("fechar");
        $("#v-csv").onclick = () => {
          const nEq = v.nomesEquipas || [], linhas = [["Posição", "Alcunha", "Pontos", "Certas", ...(nEq.length ? ["Equipa"] : [])], ...v.ranking.map((x, i) => [i + 1, x.nome, x.pontos, x.certas, ...(nEq.length ? [nEq[x.equipa] || ""] : [])])].map((l) => l.map((c) => { let s = String(c); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(";")).join("\r\n");
          const a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8,%EF%BB%BF" + encodeURIComponent(linhas); a.download = "quiz-resultados.csv"; a.click();
        };
      }
    }
    function aplicar(d) {
      if (d.mudou === false) { rev = d.revisao; return; }
      V = d; rev = d.revisao; recebido = performance.now();
      const c = chave(d);
      if (c !== chaveAnt || d.fase === "fim") { chaveAnt = c; desenhar(d); }
    }
    const consultar = async () => {
      if (parado) return;
      try { aplicar(await api("GET", `/api/vivo/${pin}?v=${rev}`)); } catch { parado = true; mostrar(`${voltar}<h1>Jogo terminado</h1><p>Esta sessão já não existe.</p><p><a href="#/quizzes">Voltar aos quizzes</a></p>`); return; }
      setTimeout(consultar, 1000);
    };
    parar.push(() => { parado = true; clearInterval(temporizador); });
    consultar();
  }

  EINK.rotas.push([/^\/quizzes$/, lista], [/^\/quiz\/novo$/, () => editor(null)], [/^\/quiz\/(\d+)$/, (id) => editor(+id)], [/^\/quiz-resultados\/(\d+)$/, (id) => resultados(+id)], [/^\/vivo\/(\d{6})$/, (pin) => vivo(pin)]);
})();
