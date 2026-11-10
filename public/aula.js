"use strict";
// Gestão da aula: página «Sala de aula» (biblioteca de atividades por categoria), «Começar a aula» (chamada, plano de hoje e lembretes),
// lembretes da turma (as antigas listas) e registo rápido de participação (só para o docente; nunca no projetor).
(() => {
  const { api, aviso, mostrar, esc, $, $$ } = EINK;

  // ---------- sala de aula: biblioteca de atividades ----------
  const FAV_PADRAO = ["#/temporizador", "#/sorteio", "#/sondagens", "#/quizzes"];
  EINK.favoritas = () => { const f = EINK.ler("favoritas", FAV_PADRAO); return EINK.FERRAMENTAS.filter((x) => f.includes(x[3])).slice(0, 4); };
  function sala() {
    const fav = EINK.ler("favoritas", FAV_PADRAO);
    mostrar(`<h1>Sala de aula</h1><p class="pequeno">Atividades para usar com os alunos e para conduzir a aula. Os alunos nunca precisam de conta. Marca até 4 favoritas com ☆ para as teres no Início.</p>
      <a class="sala-comecar" href="#/aula"><span class="icone" aria-hidden="true">▶️</span><span><strong>Começar a aula</strong><small>Escolhe a turma: chamada, plano de hoje e lembretes num só ecrã.</small></span></a>
      ${EINK.CATEGORIAS.map(([k, i, n, d]) => `<section class="sala-cat"><h2><span aria-hidden="true">${i}</span> ${n}</h2><p class="pequeno">${d}</p><div class="cartoes ferramentas">${EINK.FERRAMENTAS.filter((f) => f[4] === k).map((f) => `<div class="cartao-fav">${EINK.cartaoFerramenta(f)}<button type="button" class="estrela" data-fav="${f[3]}" aria-pressed="${fav.includes(f[3])}" aria-label="${fav.includes(f[3]) ? "Tirar das favoritas" : "Marcar como favorita"}: ${esc(f[1])}">${fav.includes(f[3]) ? "★" : "☆"}</button></div>`).join("")}</div></section>`).join("")}`);
    $$("[data-fav]").forEach((b) => { b.onclick = () => {
      let f = EINK.ler("favoritas", FAV_PADRAO); const h = b.dataset.fav;
      if (f.includes(h)) f = f.filter((x) => x !== h); else { if (f.length >= 4) return aviso("Só podes ter 4 favoritas: tira uma primeiro.", true); f = [...f, h]; }
      EINK.guardar("favoritas", f); sala();
    }; });
  }

  // ---------- começar a aula ----------
  const PASSOS = { chamada: ["✅", "Chamada", null], temporizador: ["⏱", "Temporizador", "#/temporizador"], sorteio: ["🔀", "Sorteio", "#/sorteio"], sondagem: ["📊", "Sondagem", "#/sondagens"], quiz: ["🎮", "Quiz", "#/quizzes"], mural: ["🧱", "Mural", "#/mural"], bilhete: ["🎟", "Bilhete de saída", "#/bilhete"], roda: ["🎡", "Pergunta e roda", "#/roda"], tarefa: ["📋", "Ecrã da tarefa", "#/tarefa"], placar: ["🏆", "Placar", "#/placar"], "quiz-projetor": ["📽", "Quiz no projetor", "#/quiz-projetor"], mapa: ["🪑", "Mapa de sala", "#/mapa"], texto: ["📝", "Nota", null] };
  // Sugere a turma pelo dia da semana e pela hora das aulas anteriores (guardado só neste navegador).
  const sugerirTurma = (ts) => {
    const h = EINK.ler("aula.hist", []), d = new Date(), dia = d.getDay(), hora = d.getHours();
    const conta = new Map(); for (const x of h) if (x.dia === dia && Math.abs(x.hora - hora) <= 1) conta.set(x.turma, (conta.get(x.turma) || 0) + 1);
    const melhor = [...conta.entries()].sort((a, b) => b[1] - a[1]).find(([id]) => ts.some((t) => t.id === id));
    return melhor ? melhor[0] : null;
  };
  async function aula() {
    const ts = await api("GET", "/api/turmas");
    const sug = sugerirTurma(ts); if (sug) EINK.guardar("turma", sug);
    await EINK.escolherTurma("Começar a aula", async (t, el) => {
      const h = EINK.ler("aula.hist", []), d = new Date();
      if (!h.length || h[h.length - 1].turma !== t.id || h[h.length - 1].data !== EINK.hoje()) EINK.guardar("aula.hist", [...h, { turma: t.id, dia: d.getDay(), hora: d.getHours(), data: EINK.hoje() }].slice(-60));
      const r = await api("GET", `/api/turmas/${t.id}/aula?data=${EINK.hoje()}`);
      let plano = r.plano;
      el.innerHTML = `<p class="pequeno">${esc(new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" }))} · ${t.alunos.length} alunos${sug === t.id ? " · turma sugerida pelo horário habitual" : ""}</p>
        <div class="aula-grelha"><section class="painel aula-ch"><h2>1. Chamada</h2><div id="au-ch"></div></section>
        <div><section class="painel"><h2>2. Plano de hoje</h2><ol class="au-plano" id="au-plano"></ol>
          <form class="linha" id="au-f"><label>Atividade<select name="tipo">${Object.entries(PASSOS).filter(([k]) => k !== "chamada").map(([k, [i, n]]) => `<option value="${k}">${i} ${n}</option>`).join("")}</select></label><label style="flex:1">Nota (opcional)<input name="texto" maxlength="120" placeholder="Revisão dos exercícios 3 a 5"></label><button class="sec">Acrescentar</button></form>
          ${r.anterior && !plano.length ? `<p><button type="button" class="sec" id="au-ant">Copiar o plano da aula de ${esc(r.anterior.data.slice(8, 10) + "/" + r.anterior.data.slice(5, 7))} (${r.anterior.plano.length} passos)</button></p>` : ""}</section>
          <section class="painel"><h2>3. Lembretes da turma</h2><div id="au-lem"></div></section>
          <section class="painel aula-fim"><h2>4. No fim</h2><p class="pequeno">Nos últimos minutos, um bilhete de saída mostra o que ficou da aula.</p><p class="linha"><a class="botao" href="#/bilhete" data-lancar>Terminar com bilhete de saída</a><a class="botao sec" href="#/participacao" data-lancar>Registo de participação</a></p></section></div></div>`;
      const gravar = () => api("PUT", `/api/turmas/${t.id}/aula`, { data: EINK.hoje(), plano }).catch(() => {});
      const pintar = () => {
        $("#au-plano").innerHTML = plano.map((p, i) => { const [ic, n, h] = PASSOS[p.tipo] || PASSOS.texto; return `<li class="${p.feito ? "feito" : ""}"><label class="inline"><input type="checkbox" data-feito="${i}" ${p.feito ? "checked" : ""}> <span aria-hidden="true">${ic}</span> <strong>${n}</strong>${p.texto ? ` · ${esc(p.texto)}` : ""}</label><span class="linha">${h ? `<a class="botao" href="${h}" data-lancar>Abrir</a>` : ""}<button type="button" class="sec" data-sobe="${i}" aria-label="Subir">↑</button><button type="button" class="perigo" data-tira="${i}" aria-label="Tirar">✕</button></span></li>`; }).join("") || '<li class="pequeno">Acrescenta as atividades da aula: ficam com um botão para as abrires já com esta turma.</li>';
        $$("[data-feito]").forEach((c) => { c.onchange = () => { plano[Number(c.dataset.feito)].feito = c.checked; gravar(); pintar(); }; });
        $$("[data-tira]").forEach((b) => { b.onclick = () => { plano.splice(Number(b.dataset.tira), 1); gravar(); pintar(); }; });
        $$("[data-sobe]").forEach((b) => { b.onclick = () => { const i = Number(b.dataset.sobe); if (i > 0) { [plano[i - 1], plano[i]] = [plano[i], plano[i - 1]]; gravar(); pintar(); } }; });
      };
      $("#au-f").onsubmit = (e) => { e.preventDefault(); if (plano.length >= 12) return aviso("O plano leva até 12 passos.", true); const f = new FormData(e.target); plano.push({ tipo: f.get("tipo"), texto: String(f.get("texto") || "").trim(), feito: false }); e.target.reset(); gravar(); pintar(); };
      if ($("#au-ant")) $("#au-ant").onclick = () => { plano = r.anterior.plano; gravar(); pintar(); $("#au-ant").remove(); };
      // Abrir uma atividade a partir do plano: a turma fica escolhida (as ferramentas usam «eink.turma»).
      el.addEventListener("click", (e) => { if (e.target.closest("[data-lancar]")) EINK.guardar("turma", t.id); });
      pintar();
      EINK.chamadaEm(t, $("#au-ch"));
      lembretesEm(t, $("#au-lem"), true);
    });
  }

  // ---------- lembretes da turma ----------
  async function lembretesEm(t, el, compacto) {
    const desenhar = async () => {
      const l = await api("GET", `/api/turmas/${t.id}/lembretes`);
      el.innerHTML = `<ul class="lista lem-lista">${l.map((x) => `<li class="${x.feito ? "feito" : ""}"><label class="inline"><input type="checkbox" data-c="${x.id}" ${x.feito ? "checked" : ""}> ${esc(x.texto)}</label><button class="sec" data-d="${x.id}" aria-label="Apagar o lembrete ${esc(x.texto)}">✕</button></li>`).join("") || '<li class="pequeno">Sem lembretes para esta turma.</li>'}</ul>
        <form class="linha" data-f><label style="flex:1">Novo lembrete<input name="t" required maxlength="140" placeholder="${compacto ? "Recolher as autorizações da visita" : "Testes para entregar na quinta-feira"}"></label><button class="sec">Acrescentar</button></form>`;
      $("[data-f]", el).onsubmit = async (e) => { e.preventDefault(); await api("POST", `/api/turmas/${t.id}/lembretes`, { texto: new FormData(e.target).get("t") }); desenhar(); };
      $$("[data-c]", el).forEach((c) => { c.onchange = async () => { await api("PUT", `/api/lembretes/${c.dataset.c}`, { feito: c.checked }); desenhar(); }; });
      $$("[data-d]", el).forEach((b) => { b.onclick = async () => { await api("DELETE", `/api/lembretes/${b.dataset.d}`); desenhar(); }; });
    };
    await desenhar();
  }
  async function lembretes() {
    await EINK.escolherTurma("Lembretes da turma", async (t, el) => {
      el.innerHTML = `<p class="pequeno">Ficam guardados por turma e aparecem em «Começar a aula». Só tu os vês.</p><div class="painel" id="lem"></div><div id="lem-antigas"></div>`;
      await lembretesEm(t, $("#lem"), false);
      // As antigas listas de verificação ficavam só neste navegador: podem passar para esta turma.
      const antigas = EINK.ler("listas", []).flatMap((x) => (x.itens || []).filter((i) => !i.feito).map((i) => i.texto)).filter(Boolean);
      if (antigas.length) {
        $("#lem-antigas").innerHTML = `<div class="painel"><p><strong>Tens ${antigas.length} item(ns) das antigas listas de verificação</strong> guardados neste navegador.</p><p class="linha"><button id="lem-imp">Passar para os lembretes de ${esc(t.nome)}</button><button class="sec" id="lem-esq">Esquecer as listas antigas</button></p></div>`;
        $("#lem-imp").onclick = async () => { await api("POST", `/api/turmas/${t.id}/lembretes`, { textos: antigas.slice(0, 100) }); EINK.guardar("listas", []); aviso("Lembretes importados."); lembretes(); };
        $("#lem-esq").onclick = () => { if (confirm("Apagar as listas antigas deste navegador?")) { EINK.guardar("listas", []); $("#lem-antigas").innerHTML = ""; } };
      }
    });
  }

  // ---------- registo rápido de participação (só o docente) ----------
  async function participacao() {
    await EINK.escolherTurma("Registo de participação", async (t, el) => {
      let data = EINK.hoje(), dados = null, aberto = null, vista = EINK.ler("participacao.vista", "cartoes"), mapa = null;
      el.innerHTML = `<p class="pequeno aviso-privado">🔒 Só tu vês estes registos: nunca aparecem no projetor nem aos alunos. Servem de apoio quando dás o nível de comportamento ou participação; não entram no cálculo das notas. Apagam-se com o prazo de retenção da escola.</p>
        <div role="tablist" class="linha ch-tabs"><button type="button" role="tab" class="sec" aria-selected="true" data-tab="hoje">Registar</button><button type="button" role="tab" class="sec" aria-selected="false" data-tab="totais">Totais</button><button type="button" role="tab" class="sec" aria-selected="false" data-tab="tipos">Tipos de registo</button></div><div id="pa"></div>`;
      const carregar = async () => { dados = await api("GET", `/api/turmas/${t.id}/registos?dia=${data}`); };
      const doDia = (id) => dados.dia.filter((r) => r.aluno_id === id);
      const cartao = (a, curto) => { const d = doDia(a.id), p = d.filter((r) => r.positivo).length, n = d.length - p; return `<button type="button" class="pa-al ${aberto === a.id ? "aberto" : ""}" data-a="${a.id}">${curto ? "" : EINK.foto(a, "foto-ch")}<span class="ch-nome">${esc(curto ? EINK.nomeCurto(a) : a.nome)}</span><span class="pa-cont">${p ? `<b class="pa-pos">+${p}</b>` : ""}${n ? ` <b class="pa-neg">−${n}</b>` : ""}</span></button>`; };
      const registar = () => {
        const al = t.alunos.find((a) => a.id === aberto);
        const menu = al ? `<div class="painel pa-menu" role="dialog" aria-label="Registar para ${esc(al.nome)}"><p><strong>${esc(al.nome)}</strong></p><p class="linha">${dados.tipos.map((x) => `<button type="button" class="${x.positivo ? "" : "sec pa-neg-bt"}" data-tipo="${esc(x.nome)}">${x.positivo ? "+" : "−"} ${esc(x.nome)}</button>`).join("")}</p>
          ${doDia(al.id).length ? `<p class="pequeno">Hoje: ${doDia(al.id).map((r) => `<span class="pa-reg">${r.positivo ? "+" : "−"} ${esc(r.tipo)} <button type="button" class="ligacao" data-tirar="${r.id}" aria-label="Tirar ${esc(r.tipo)}">✕</button></span>`).join(" ")}</p>` : ""}<p><button type="button" class="sec" data-fechar>Fechar</button></p></div>` : "";
        let grelha;
        if (vista === "mapa" && mapa && Object.values(mapa.lugares).some((v) => v !== "x")) {
          const por = new Map(t.alunos.map((a) => [a.id, a]));
          grelha = `<div class="m-quadro">Quadro</div><div class="ch-mapa" style="grid-template-columns:repeat(${mapa.colunas},minmax(4.5rem,1fr))">${Array.from({ length: mapa.linhas }, (_, r) => Array.from({ length: mapa.colunas }, (_, c) => { const v = mapa.lugares[`${r},${c}`]; return v && v !== "x" && por.get(v) ? cartao(por.get(v), true) : `<span class="ch-vazio ${v === "x" ? "corr" : ""}"></span>`; }).join("")).join("")}</div>`;
        } else grelha = `<div class="ch-grelha">${t.alunos.map((a) => cartao(a)).join("")}</div>`;
        $("#pa").innerHTML = `<div class="linha"><label>Data<input type="date" id="pa-dt" value="${data}"></label><span class="linha" role="group" aria-label="Vista"><button type="button" class="sec" data-vista="cartoes" aria-pressed="${vista === "cartoes"}">Cartões</button><button type="button" class="sec" data-vista="mapa" aria-pressed="${vista === "mapa"}">Pelo mapa de sala</button></span></div>${menu}${grelha}<p class="pequeno">Toca num aluno e escolhe o registo. Para desfazer, toca outra vez e usa ✕.</p>`;
        $("#pa-dt").onchange = async (e) => { data = e.target.value; await carregar(); registar(); };
        $$("[data-vista]", $("#pa")).forEach((b) => { b.onclick = async () => { vista = b.dataset.vista; EINK.guardar("participacao.vista", vista); if (vista === "mapa" && !mapa) mapa = await api("GET", `/api/turmas/${t.id}/mapa`); registar(); }; });
      };
      el.addEventListener("click", async (e) => {
        if (!e.target.closest("#pa")) return;
        const a = e.target.closest("[data-a]"), tipo = e.target.closest("[data-tipo]"), tirar = e.target.closest("[data-tirar]");
        if (a) { aberto = aberto === Number(a.dataset.a) ? null : Number(a.dataset.a); registar(); return; }
        if (tipo && aberto) { await api("POST", `/api/turmas/${t.id}/registos`, { aluno: aberto, tipo: tipo.dataset.tipo, data }); await carregar(); aviso(`Registado: ${tipo.dataset.tipo}.`); registar(); return; }
        if (tirar) { await api("DELETE", `/api/registos/${tirar.dataset.tirar}`); await carregar(); registar(); return; }
        if (e.target.closest("[data-fechar]")) { aberto = null; registar(); }
      });
      const totais = async () => {
        const r = await api("GET", `/api/turmas/${t.id}/registos`);
        $("#pa").innerHTML = `<div class="tabela-rolagem"><table><thead><tr><th>N.º</th><th>Aluno</th><th class="num">+</th><th class="num">−</th>${r.tipos.map((x) => `<th class="num">${esc(x.nome)}</th>`).join("")}</tr></thead><tbody>${t.alunos.map((a) => { const x = r.alunos[a.id] || { pos: 0, neg: 0, tipos: {} }; return `<tr><td>${a.numero ?? ""}</td><td>${esc(a.nome)}</td><td class="num pa-pos">${x.pos}</td><td class="num pa-neg">${x.neg}</td>${r.tipos.map((k) => `<td class="num">${x.tipos[k.nome] || ""}</td>`).join("")}</tr>`; }).join("")}</tbody></table></div><p class="pequeno">Totais de todos os registos desta turma. Também aparecem na pauta, ao lado dos níveis.</p>`;
      };
      const tipos = async () => {
        const l = await api("GET", "/api/eu/registo-tipos");
        $("#pa").innerHTML = `<form class="painel" id="pa-tipos"><p class="pequeno">Até 8 tipos, iguais para todas as tuas turmas.</p>${Array.from({ length: 8 }, (_, i) => { const x = l[i] || { nome: "", positivo: true }; return `<p class="linha"><input name="n${i}" maxlength="40" value="${esc(x.nome)}" aria-label="Tipo ${i + 1}" style="flex:1"><label class="inline"><input type="radio" name="p${i}" value="1" ${x.positivo ? "checked" : ""}> Positivo</label><label class="inline"><input type="radio" name="p${i}" value="0" ${x.positivo ? "" : "checked"}> A melhorar</label></p>`; }).join("")}<button>Guardar</button></form>`;
        $("#pa-tipos").onsubmit = async (e) => { e.preventDefault(); const f = new FormData(e.target); await api("PUT", "/api/eu/registo-tipos", { tipos: Array.from({ length: 8 }, (_, i) => ({ nome: String(f.get("n" + i) || "").trim(), positivo: f.get("p" + i) === "1" })).filter((x) => x.nome) }); aviso("Tipos guardados."); };
      };
      $$("[data-tab]", el).forEach((b) => { b.onclick = async () => { $$("[data-tab]", el).forEach((x) => x.setAttribute("aria-selected", String(x === b))); if (b.dataset.tab === "hoje") { await carregar(); registar(); } else if (b.dataset.tab === "totais") totais(); else tipos(); }; });
      if (vista === "mapa") mapa = await api("GET", `/api/turmas/${t.id}/mapa`).catch(() => null);
      await carregar(); registar();
    });
  }

  // Na pauta: totais do registo de participação (só para o docente), como apoio a dar o nível.
  EINK.registosNaPauta = async (periodoId) => {
    const el = $("#pauta-registos"); if (!el) return;
    try {
      const r = await api("GET", `/api/periodos/${periodoId}/registos`), ids = Object.keys(r.alunos);
      if (!ids.length) return;
      const pauta = await api("GET", `/api/periodos/${periodoId}/pauta`);
      el.innerHTML = `<details class="painel"><summary><strong>Registo de participação</strong> <span class="pequeno">apoio para o nível de comportamento · só tu vês</span></summary><div class="tabela-rolagem"><table><thead><tr><th>Aluno</th><th class="num">+</th><th class="num">−</th><th>Por tipo</th></tr></thead><tbody>${pauta.alunos.map((a) => { const x = r.alunos[a.id]; return x ? `<tr><td>${esc(a.nome)}</td><td class="num pa-pos">${x.pos}</td><td class="num pa-neg">${x.neg}</td><td class="pequeno">${Object.entries(x.tipos).map(([k, n]) => `${esc(k)} ${n}`).join(" · ")}</td></tr>` : ""; }).join("")}</tbody></table></div><p class="pequeno"><a href="#/participacao">Abrir o registo de participação</a></p></details>`;
    } catch { /* não é essencial */ }
  };

  EINK.rotas.push([/^\/sala$/, sala], [/^\/aula$/, aula], [/^\/lembretes$/, lembretes], [/^\/participacao$/, participacao]);
})();
