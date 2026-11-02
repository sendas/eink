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
    <div class="niveis-leg">${[1, 2, 3, 4, 5].map((i) => `<span><i class="lv lv${i}"></i>${i}</span>`).join("")}</div>` : `<p class="pequeno">Sem níveis ainda.</p>`; };

  const cartaoTurma = (t) => {
    const pc = t.esperadas ? Math.round((t.notas / t.esperadas) * 100) : 0;
    return `<article class="turma-cartao">
      <header><div><h3>${esc(t.nome)}</h3><p class="pequeno">${t.ano ? t.ano + ".º ano · " : ""}${t.alunos} aluno${t.alunos === 1 ? "" : "s"}</p></div>
        ${t.acompanhar ? `<span class="selo-alerta" title="Alunos com nível 1 ou 2">${t.acompanhar} a acompanhar</span>` : ""}</header>
      <div class="turma-corpo">
        <div class="anel" style="--p:${t.media === null ? 0 : Math.min(100, t.media)}" role="img" aria-label="Média ${t.media === null ? "sem notas" : n1(t.media) + " %"}"><span class="anel-n">${t.media === null ? "–" : n1(t.media)}</span><span class="anel-u">média %</span></div>
        <div class="turma-niveis"><p class="rotulo">Alunos por nível</p>${barraNiveis(t.niveis)}</div>
      </div>
      <div><div class="progresso-topo"><span class="rotulo">Notas lançadas</span><span class="pequeno">${t.esperadas ? `${t.notas} de ${t.esperadas}` : "sem avaliações"}</span></div><div class="progresso"><div style="width:${pc}%"></div></div></div>
      <footer>${t.periodos.map((d) => `<a class="botao ${t.foco && d.id === t.foco.id ? "" : "sec"}" href="#/pauta/${d.id}">${esc(d.nome)}${d.fechado ? " (fechado)" : ""}</a>`).join("")}<a class="botao fantasma" href="#/turma/${t.id}">Alunos</a></footer>
    </article>`;
  };

  EINK.inicio = async () => {
    const nome = (EINK.eu.nome || "").split(" ")[0];
    mostrar(`${EINK.avisoSegredo()}<section class="heroi"><div><p class="heroi-data">${esc(dataHoje())}</p><h1>${saudacao()}${nome ? ", " + esc(nome) : ""}</h1><p class="heroi-sub" id="heroi-sub">A preparar o teu resumo…</p></div>
        <div class="heroi-acoes" id="heroi-acoes"><a class="botao grande" href="#/notas">Abrir notas</a></div></section>
      <div class="kpis" id="kpis"></div><div id="alertas"></div>
      <h2>As minhas turmas</h2><div class="turmas-grelha" id="turmas"><p class="pequeno">A carregar…</p></div>
      <h2>Ferramentas de sala</h2><div class="cartoes ferramentas">${FERRAMENTAS.map(([i, n, d, h]) => `<a class="cartao" href="${h}"><span class="icone" aria-hidden="true">${i}</span><span>${n}<small>${d}</small></span></a>`).join("")}</div>`);
    try {
      const r = await api("GET", "/api/inicio"), T = r.totais;
      let ultima = null; try { ultima = JSON.parse(localStorage.getItem("eink.ultimaPauta") || "null"); } catch { /* sem armazenamento */ }
      $("#heroi-sub").textContent = T.turmas ? `${T.turmas} turma${T.turmas === 1 ? "" : "s"} e ${T.alunos} aluno${T.alunos === 1 ? "" : "s"}${T.acompanhar ? `. ${T.acompanhar} a precisar de atenção.` : "."}` : "Começa por criar a tua primeira turma.";
      $("#heroi-acoes").innerHTML = (ultima ? `<a class="botao grande" href="#/pauta/${ultima.id}">Continuar: ${esc(ultima.nome)}</a>` : r.turmas.length && r.turmas[0].foco ? `<a class="botao grande" href="#/pauta/${r.turmas[0].foco.id}">Abrir a pauta de ${esc(r.turmas[0].nome)}</a>` : "") + (T.turmas ? `<a class="botao sec grande" href="#/notas">Todas as notas</a>` : `<a class="botao grande" href="#/turmas">Criar turma</a>`);
      $("#kpis").innerHTML = [[T.turmas, T.turmas === 1 ? "turma" : "turmas"], [T.alunos, T.alunos === 1 ? "aluno" : "alunos"], [T.media === null ? "–" : n1(T.media), "média geral (%)"], [T.acompanhar, "a acompanhar"]].map(([v, l], i) => `<div class="kpi k${i}"><strong>${v}</strong><span>${l}</span></div>`).join("");
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
