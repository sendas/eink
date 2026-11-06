"use strict";
// Página inicial: saudação, o atalho principal, números grandes e um cartão por turma com média, níveis e progresso.
(() => {
  const { api, mostrar, esc, $ } = EINK;
  const FERRAMENTAS = [
    ["⏱", "Temporizador", "Contagem decrescente", "#/temporizador"], ["🔀", "Sorteio", "Aluno ou grupos ao acaso", "#/sorteio"],
    ["✅", "Chamada", "Presenças por aula", "#/chamada"], ["☑️", "Listas", "Listas de verificação", "#/listas"],
    ["📊", "Sondagem", "Pergunta rápida com código", "#/sondagens"], ["🪑", "Mapa de sala", "Lugares dos alunos", "#/mapa"],
    ["🖼", "Quadros", "Notas e ideias da aula", "#/quadros"], ["🎮", "Quizzes", "Jogo ao vivo estilo Kahoot", "#/quizzes"],
  ];
  const n1 = (v) => String(Math.round(v * 10) / 10).replace(".", ",");
  const saudacao = () => { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 20 ? "Boa tarde" : "Boa noite"; };
  const dataHoje = () => new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });

  const barraNiveis = (niv) => { const t = niv.reduce((z, x) => z + x, 0); return t ? `<div class="niveis" role="img" aria-label="Alunos por nível: ${niv.map((x, i) => `nível ${i + 1}: ${x}`).join(", ")}">${niv.map((x, i) => x ? `<span class="lv lv${i + 1}" style="flex:${x}" title="Nível ${i + 1}: ${x}">${x}</span>` : "").join("")}</div>
    <div class="niveis-leg">${[1, 2, 3, 4, 5].map((i) => `<span><i class="lv lv${i}">${i}</i>${["Muito insuf.", "Insuf.", "Suficiente", "Bom", "Muito bom"][i - 1]}</span>`).join("")}</div>` : `<p class="pequeno">Sem níveis ainda.</p>`; };

  const cartaoTurma = (t) => {
    const pc = t.esperadas ? Math.round((t.notas / t.esperadas) * 100) : 0;
    return `<article class="turma-cartao"${t.foco ? ` data-foco="${t.foco.id}"` : ""}>
      <header><div><h3>${esc(t.nome)}</h3><p class="pequeno">${t.ano ? t.ano + ".º ano · " : ""}${t.alunos} aluno${t.alunos === 1 ? "" : "s"}</p></div>
        ${t.acompanhar ? `<span class="selo-alerta" title="Alunos com nível 1 ou 2">${t.acompanhar} a acompanhar</span>` : ""}</header>
      <div class="turma-corpo">
        <div class="anel" style="--p:${t.media === null ? 0 : Math.min(100, t.media)}" role="img" aria-label="Média ${t.media === null ? "sem notas" : n1(t.media) + " %"}"><span class="anel-n">${t.media === null ? "–" : n1(t.media)}</span><span class="anel-u">média %</span></div>
        <div class="turma-niveis"><p class="rotulo">Alunos por nível</p>${barraNiveis(t.niveis)}</div>
      </div>
      <div><div class="progresso-topo"><span class="rotulo">Notas lançadas</span><span class="pequeno">${t.esperadas ? `${t.notas} de ${t.esperadas}` : "sem avaliações"}</span></div><div class="progresso"><div style="width:${pc}%"></div></div></div>
      <footer><p class="rotulo foot-rot">Abrir a pauta de:</p>${t.periodos.map((d) => `<a class="botao periodo ${t.foco && d.id === t.foco.id ? "" : "sec"}" href="#/pauta/${d.id}">${esc(d.nome)}${d.fechado ? " (fechado)" : ""}<span class="seta" aria-hidden="true"> →</span></a>`).join("")}<a class="botao fantasma" href="#/turma/${t.id}">Alunos</a></footer>
    </article>`;
  };

  const anosCompactos = (an) => { const l = [...an].sort((a, b) => a - b); if (l.length === 1 || !l[0]) return anoTxt(l[0]); return l.every((a, i) => !i || a === l[i - 1] + 1) && l.length > 2 ? `${l[0]}.º a ${l[l.length - 1]}.º ano` : l.map((a) => a + ".º").join(", ") + " ano"; };
  const anoTxt = (a) => (a ? `${a}.º ano` : "Todos os anos");
  const barraPesos = (cr) => `<div class="cg-barra" role="img" aria-label="${cr.map((k) => `${k.nome} ${k.peso} %`).join(", ")}">${cr.map((k, i) => `<span class="g${i % 3}" style="flex:${Math.max(1, k.peso)}" title="${esc(k.nome)}, ${k.peso} %">${k.peso >= 8 ? k.peso + " %" : ""}</span>`).join("")}</div>
    <div class="cg-leg">${cr.map((k, i) => `<span><i class="g${i % 3}"></i>${esc(k.nome)}, ${k.peso} % <small>${k.tipo === "nivel" ? "nível 1 a 5 dado por ti" : "média dos testes e trabalhos"}</small></span>`).join("")}</div>`;
  // Resumo dos critérios do grupo do docente: o esquema do ano de cada turma (ou o de «todos os anos»), com vista completa numa janela.
  const cartaoCriterios = (g, admin) => {
    const porAno = (ano) => g.esquemas.find((e) => e.ano === ano) || g.esquemas.find((e) => e.ano === 0);
    // Sem turmas, mostram-se os critérios de todos os anos da disciplina (os anos com critérios iguais juntos).
    const anos = g.anosTurmas.length ? g.anosTurmas : (g.esquemas.some((e) => e.ano) ? g.esquemas.filter((e) => e.ano).map((e) => e.ano) : [0]), usados = [];
    const igual = (a, b) => a === b || (a.casas === b.casas && JSON.stringify(a.criterios.map((k) => [k.nome, k.peso, k.tipo])) === JSON.stringify(b.criterios.map((k) => [k.nome, k.peso, k.tipo])));
    for (const a of anos) { const e = porAno(a); const u = e && usados.find((x) => igual(x.e, e)); if (u) u.anos.push(a); else if (e) usados.push({ e, anos: [a] }); }
    return `<div class="painel cg"><div class="cg-topo"><div><p class="rotulo">Critérios de avaliação</p><h2 style="margin:0">${esc(g.nome)}</h2></div><div class="linha"><button type="button" class="sec" id="cg-ver">Ver na totalidade</button><button type="button" class="sec" id="cg-mudar">Mudar de disciplina</button>${admin ? '<a class="botao fantasma" href="#/criterios">Editar</a>' : ""}</div></div>
      ${usados.map(({ e, anos: an }) => `<div class="cg-esq"><p class="pequeno"><strong>${anosCompactos(an)}</strong> · nota final com ${e.casas} casa${e.casas === 1 ? "" : "s"} decimal${e.casas === 1 ? "" : "is"}</p>${barraPesos(e.criterios)}</div>`).join("")}
      ${g.documentos && g.documentos.length ? `<div class="cg-docs"><p class="rotulo">Documentos</p>${g.documentos.map((d) => `<a class="cg-doc" href="/api/documentos/${d.id}/ficheiro" target="_blank" rel="noopener"><span class="cg-pdf" aria-hidden="true">PDF</span><span>${esc(d.titulo)} <small class="pequeno">${Math.max(1, Math.round(d.tamanho / 1024))} KB</small></span></a>`).join("")}</div>` : ""}
      <p class="pequeno">Definidos pelo administrador para esta disciplina${g.ad ? ` (no Entra: ${esc(g.ad)})` : ""}.</p></div>`;
  };
  const janelaCriterios = (g) => {
    const grupos = []; // anos com critérios iguais aparecem juntos
    for (const e of g.esquemas) { const chave = e.casas + JSON.stringify(e.criterios.map((k) => [k.nome, k.peso, k.tipo])), x = grupos.find((u) => u.chave === chave); if (x) x.anos.push(e.ano); else grupos.push({ chave, e, anos: [e.ano] }); }
    const dlg = document.createElement("dialog"); dlg.className = "cg-dlg";
    dlg.innerHTML = `<h2 style="margin-top:0">Critérios de avaliação · ${esc(g.nome)}</h2>
      ${grupos.map(({ e, anos: an }) => `<section class="cg-esq"><h3>${anosCompactos(an)} <small class="pequeno">nota final com ${e.casas} casa${e.casas === 1 ? "" : "s"} decimal${e.casas === 1 ? "" : "is"}</small></h3>${barraPesos(e.criterios)}
        <table class="cg-tab"><thead><tr><th>Critério</th><th>Como se calcula</th><th class="num">Peso</th></tr></thead><tbody>${e.criterios.map((k) => `<tr><td data-r="Critério">${esc(k.nome)}</td><td data-r="Como se calcula">${k.tipo === "nivel" ? "Nível de 1 a 5 dado pelo docente" : "Média ponderada dos testes e trabalhos lançados"}</td><td class="num" data-r="Peso">${k.peso} %</td></tr>`).join("")}</tbody></table></section>`).join("")}
      <p class="pequeno"><strong>Níveis:</strong> 1 (0 a 19 %), 2 (20 a 49 %), 3 (50 a 69 %), 4 (70 a 89 %) e 5 (90 a 100 %). Quando falta um critério, a nota final usa os que existem e fica marcada como parcial.</p>
      <p class="linha"><button type="button" class="sec" id="cg-fechar">Fechar</button></p>`;
    document.body.append(dlg); dlg.showModal();
    const fechar = () => { dlg.close(); dlg.remove(); }; dlg.querySelector("#cg-fechar").onclick = fechar; dlg.addEventListener("cancel", () => dlg.remove());
    dlg.addEventListener("click", (e) => { if (e.target === dlg) fechar(); });
  };

  EINK.inicio = async () => {
    const nome = (EINK.eu.nome || "").split(" ")[0];
    mostrar(`${EINK.avisoSegredo()}<section class="heroi"><div><p class="heroi-data">${esc(dataHoje())}</p><h1>${saudacao()}${nome ? ", " + esc(nome) : ""}</h1><p class="heroi-grupo" id="heroi-grupo"></p><p class="heroi-sub" id="heroi-sub">A preparar o teu resumo…</p></div>
        <div class="heroi-acoes" id="heroi-acoes"><a class="botao grande" href="#/notas">Abrir notas</a></div></section>
      <div class="kpis" id="kpis"></div><section id="criterios-grupo"></section><div id="alertas"></div>
      <h2>As minhas turmas</h2><p class="pequeno turmas-dica">Para lançar notas, escolhe o período da turma (por exemplo «1.º período»). Tocar no cartão abre o período atual.</p><div class="turmas-grelha" id="turmas"><p class="pequeno">A carregar…</p></div>
      <h2>Ferramentas de sala</h2><div class="cartoes ferramentas">${FERRAMENTAS.map(([i, n, d, h]) => `<a class="cartao" href="${h}"><span class="icone" aria-hidden="true">${i}</span><span>${n}<small>${d}</small></span></a>`).join("")}</div>`);
    try {
      const r = await api("GET", "/api/inicio"), T = r.totais;
      let ultima = null; try { ultima = JSON.parse(localStorage.getItem("eink.ultimaPauta") || "null"); } catch { /* sem armazenamento */ }
      const chips = (r.grupos || []).map((g) => `<span class="chip-grupo suave">${esc(g.nome)}</span>`).join(" ");
      $("#heroi-grupo").innerHTML = (EINK.eu.grupo_ad ? `<span class="chip-grupo">Grupo ${esc(EINK.eu.grupo_ad)}</span> ` : "") + chips;
      const depoisDeEscolher = () => EINK.inicio();
      if (r.grupos && r.grupos.length) {
        let ativo = 0; try { ativo = Math.min(Number(sessionStorage.getItem("eink.discAtiva")) || 0, r.grupos.length - 1); } catch { /* sem armazenamento */ }
        const desenhar = () => {
          const g = r.grupos[ativo];
          $("#criterios-grupo").innerHTML = (r.grupos.length > 1 ? `<div class="cg-tabs" role="tablist">${r.grupos.map((x, i) => `<button type="button" role="tab" class="sec ${i === ativo ? "ativo" : ""}" data-i="${i}">${esc(x.nome)}</button>`).join("")}</div>` : "") + cartaoCriterios(g, EINK.eu.admin);
          $("#cg-ver").onclick = () => janelaCriterios(g); $("#cg-mudar").onclick = () => EINK.escolherDisciplinas(depoisDeEscolher);
          document.querySelectorAll(".cg-tabs [data-i]").forEach((b) => { b.onclick = () => { ativo = Number(b.dataset.i); try { sessionStorage.setItem("eink.discAtiva", String(ativo)); } catch { /* sem armazenamento */ } desenhar(); }; });
        };
        desenhar();
      } else {
        $("#criterios-grupo").innerHTML = `<div class="painel cg convite-disc"><div><p class="rotulo">Para começar</p><h2 style="margin:0">Que disciplina lecionas?</h2><p class="pequeno">Escolhe o ciclo e a disciplina para veres os critérios de avaliação e usá-los nas tuas turmas. Podes escolher várias e mudar quando quiseres.</p></div><button type="button" class="grande" id="cg-escolher">Escolher disciplinas</button></div>`;
        $("#cg-escolher").onclick = () => EINK.escolherDisciplinas(depoisDeEscolher);
      }
      $("#heroi-sub").textContent = T.turmas ? `${T.turmas} turma${T.turmas === 1 ? "" : "s"} e ${T.alunos} aluno${T.alunos === 1 ? "" : "s"}${T.acompanhar ? `. ${T.acompanhar} a precisar de atenção.` : "."}` : "Começa por criar a tua primeira turma.";
      $("#heroi-acoes").innerHTML = (ultima ? `<a class="botao grande" href="#/pauta/${ultima.id}">Continuar: ${esc(ultima.nome)}</a>` : r.turmas.length && r.turmas[0].foco ? `<a class="botao grande" href="#/pauta/${r.turmas[0].foco.id}">Abrir a pauta de ${esc(r.turmas[0].nome)}</a>` : "") + (T.turmas ? `<a class="botao sec grande" href="#/notas">Todas as notas</a>` : `<a class="botao grande" href="#/turmas">Criar turma</a>`);
      $("#kpis").innerHTML = [[T.turmas, T.turmas === 1 ? "turma" : "turmas"], [T.alunos, T.alunos === 1 ? "aluno" : "alunos"], [T.media === null ? "–" : n1(T.media), "média geral (%)"], [T.acompanhar, "a acompanhar"]].map(([v, l], i) => `<div class="kpi k${i}"><strong>${v}</strong><span>${l}</span></div>`).join("");
      $("#turmas").onclick = (e) => { if (e.target.closest("a, button, summary, input, select")) return; const c = e.target.closest(".turma-cartao[data-foco]"); if (c) location.hash = "#/pauta/" + c.dataset.foco; };
      $("#turmas").innerHTML = r.turmas.length ? r.turmas.map(cartaoTurma).join("") : `<div class="vazio"><p><strong>Ainda não tens turmas.</strong></p><p class="pequeno">Cria uma turma, adiciona os alunos e começa a lançar notas.</p><a class="botao grande" href="#/turmas">Criar a primeira turma</a></div>`;
    } catch { /* o aviso de erro já foi mostrado */ }
    // Alunos a acompanhar (nota baixa ou muitas faltas), sem atrasar o resto.
    try {
      const r = await api("GET", "/api/alertas");
      if (r.alertas.length && $("#alertas")) $("#alertas").innerHTML = `<section class="painel aviso-alerta" aria-label="Alunos a acompanhar"><h2 style="margin-top:0">Alunos a acompanhar (${r.alertas.length})</h2><p class="pequeno">Nota abaixo de ${r.limiteNota} % ou ${r.limiteFaltas} ou mais faltas.</p>
        <ul class="lista">${r.alertas.slice(0, 6).map((a) => `<li><span><strong>${esc(a.aluno)}</strong> <span class="pequeno">${esc(a.turma)}</span></span><span>${a.periodo_id ? `<a href="#/pauta/${a.periodo_id}">${esc(a.motivos.join(" · "))}</a>` : esc(a.motivos.join(" · "))}</span></li>`).join("")}${r.alertas.length > 6 ? `<li class="pequeno">e mais ${r.alertas.length - 6}</li>` : ""}</ul></section>`;
    } catch { /* não é essencial */ }
  };
})();
