"use strict";
// Tutorial de boas-vindas em janela (popup): aparece uma vez no primeiro início de sessão de cada docente e pode ser aberto outra vez
// pelo botão «Tutorial» do cabeçalho. As imagens são capturas da própria plataforma, com dados inventados (public/img/tut-*.jpg).
(() => {
  const { esc } = EINK;
  const PASSOS = [
    { tit: "Bem-vindo ao Eça Avalia", sub: "Em poucos minutos fica a saber o essencial.", capa: true,
      txt: "É a plataforma da escola para lançares notas, avaliares com grelhas, escreveres as avaliações intercalares e animares as aulas. Cada docente só vê as suas turmas e os seus alunos.",
      lista: [["1", "Turmas e alunos", "Cria a turma e cola a lista de alunos."], ["2", "Pauta", "Lança notas como numa folha de Excel."], ["3", "Grelhas", "Pontua cada questão de um teste."], ["4", "Colegas", "Partilha grelhas e modelos."], ["5", "Intercalares", "Menções e descritivas."], ["6", "Sala de aula", "Quizzes, sondagens e sorteios."]] },
    { tit: "As tuas turmas, num só lugar", img: "tut-turmas.jpg", alt: "Cartões das turmas com a média, os alunos por nível e as notas lançadas",
      txt: "Em «Turmas» crias a turma e colas a lista de alunos (ou importas de um Excel). Podes juntar fotografias para reconheceres cada aluno.",
      pontos: ["Cada cartão mostra a média, os alunos por nível e quantas notas já lançaste.", "Para lançar notas, escolhe o período da turma, por exemplo «1.º período». Tocar no cartão abre o período atual."] },
    { tit: "Lança as notas como no Excel", img: "tut-pauta.jpg", alt: "Pauta com notas, níveis coloridos e média de cada aluno",
      txt: "A pauta funciona como uma folha de cálculo: escreve a nota, carrega em Enter ou Tab e passa para a seguinte. Também podes colar blocos copiados do Excel.",
      pontos: ["As cores e os nomes dos níveis aparecem sozinhos em cada nota e em cada média.", "Em «Testes e trabalhos», o botão «+ Adicionar avaliação» cria um teste, uma ficha ou um trabalho.", "Descarrega a pauta em Excel ou CSV quando precisares."] },
    { tit: "Grelhas de teste por questão", img: "tut-grelha.jpg", alt: "Grelha de um teste com questões, cotações e pontuação de cada aluno",
      txt: "Em vez de uma nota única, pontua cada questão. A grelha soma o total e passa-o para a pauta.",
      pontos: ["Define a cotação por baixo de cada questão. Se a soma der 100, as pontuações ajustam-se na mesma proporção.", "Copia a estrutura de outro teste ou guarda-a como modelo para usares outra vez."] },
    { tit: "Partilha com os colegas", img: "tut-colegas.jpg", ajuste: "tut-centro", alt: "Janela para enviar um modelo de grelha a colegas, com sugestões de nomes",
      txt: "Envia um modelo de grelha a quem quiseres: escreve o nome e escolhe na lista, como no Outlook. Aparecem todos os docentes da escola, mesmo os que ainda não entraram.",
      pontos: ["O colega recebe só as questões e as cotações, nunca notas nem alunos.", "Os modelos recebidos ficam em «Modelos», com um aviso no menu."] },
    { tit: "Avaliações intercalares", img: "tut-intercalar.jpg", alt: "Tabela das avaliações intercalares com menção e descritiva de cada aluno",
      txt: "Na pauta, abre «Avaliações intercalares» para escreveres a menção e a descritiva de cada aluno.",
      pontos: ["«Propor menções pelas notas» preenche as menções a partir da pauta.", "O botão «Sugerir» dá-te um texto de partida, que podes editar à vontade."] },
    { tit: "Ferramentas para a sala de aula", img: "tut-ferramentas.jpg", alt: "Cartões das ferramentas de sala: temporizador, sorteio, chamada, sondagem, mapa de sala, quadros e quizzes",
      txt: "Na página inicial tens ferramentas para usar com os alunos, sem eles precisarem de conta.",
      pontos: ["Quizzes ao vivo no estilo Kahoot e sondagens com código de entrada.", "Temporizador, sorteio de alunos ou grupos, chamada, mapa de sala e quadros de ideias."] },
    { tit: "Está pronto para começar", fim: true,
      txt: "Podes voltar a este tutorial quando quiseres, no botão «Tutorial» do cabeçalho.",
      lista: [["?", "Encontraste um erro ou tens uma ideia?", "Usa o botão «Sugestões», no canto do ecrã. É uma versão em testes e as tuas sugestões contam."], ["↻", "Novidades", "Em «Versões» vês o que mudou em cada atualização."]] },
  ];
  let dlg = null;

  function abrir(opc = {}) {
    if (dlg) return;
    let i = 0;
    dlg = document.createElement("dialog"); dlg.className = "tut-dlg"; dlg.setAttribute("aria-labelledby", "tut-titulo");
    document.body.append(dlg);
    const marcarVisto = () => { if (EINK.eu && EINK.eu.tutorial) { EINK.eu.tutorial = false; EINK.api("POST", "/api/eu/tutorial", {}).catch(() => {}); } };
    const fechar = () => { marcarVisto(); const d = dlg; dlg = null; try { d.close(); } catch { /* já fechada */ } d.remove(); };
    const desenhar = () => {
      const x = PASSOS[i], ultimo = i === PASSOS.length - 1;
      dlg.innerHTML = `
        <div class="tut-topo"><span class="tut-passo">${x.capa ? "Tutorial" : `Passo ${i} de ${PASSOS.length - 1}`}</span><button type="button" class="tut-x" aria-label="Fechar o tutorial">×</button></div>
        <div class="tut-corpo ${x.capa ? "tut-capa" : ""}">
          ${x.img ? `<figure class="tut-fig${x.ajuste ? " " + x.ajuste : ""}"><img src="/img/${esc(x.img)}" alt="${esc(x.alt)}"></figure>` : ""}
          <div class="tut-texto">
            <h2 id="tut-titulo">${esc(x.tit)}</h2>
            ${x.sub ? `<p class="tut-sub">${esc(x.sub)}</p>` : ""}
            <p>${esc(x.txt)}</p>
            ${x.pontos ? `<ul class="tut-pontos">${x.pontos.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
            ${x.lista ? `<ul class="tut-lista">${x.lista.map(([n, t, d]) => `<li><span class="tut-n" aria-hidden="true">${esc(n)}</span><span><strong>${esc(t)}</strong><small>${esc(d)}</small></span></li>`).join("")}</ul>` : ""}
          </div>
        </div>
        <div class="tut-pe">
          <div class="tut-pontinhos" role="tablist" aria-label="Passos do tutorial">${PASSOS.map((_, k) => `<button type="button" role="tab" class="${k === i ? "ativo" : ""}" aria-selected="${k === i}" aria-label="Passo ${k + 1}: ${esc(PASSOS[k].tit)}" data-i="${k}"></button>`).join("")}</div>
          <div class="tut-botoes">
            ${i === 0 ? '<button type="button" class="sec" id="tut-saltar">Saltar</button>' : '<button type="button" class="sec" id="tut-ant">Anterior</button>'}
            <button type="button" id="tut-seg">${i === 0 ? "Começar o tutorial" : ultimo ? "Começar a usar" : "Seguinte"}</button>
          </div>
        </div>`;
      dlg.querySelector(".tut-x").onclick = fechar;
      const sk = dlg.querySelector("#tut-saltar"); if (sk) sk.onclick = fechar;
      const an = dlg.querySelector("#tut-ant"); if (an) an.onclick = () => { i--; desenhar(); };
      dlg.querySelector("#tut-seg").onclick = () => { if (ultimo) fechar(); else { i++; desenhar(); } };
      dlg.querySelectorAll(".tut-pontinhos button").forEach((b) => { b.onclick = () => { i = Number(b.dataset.i); desenhar(); }; });
      const alvo = dlg.querySelector("#tut-seg"); if (alvo) alvo.focus({ preventScroll: true });
      const corpo = dlg.querySelector(".tut-corpo"); if (corpo) corpo.scrollTop = 0;
    };
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); fechar(); });
    dlg.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" && i < PASSOS.length - 1) { i++; desenhar(); } else if (e.key === "ArrowLeft" && i > 0) { i--; desenhar(); }
    });
    dlg.addEventListener("click", (e) => { if (e.target === dlg) fechar(); });
    desenhar(); dlg.showModal();
    // Pré-carrega as imagens dos passos seguintes para a mudança de passo ser instantânea.
    setTimeout(() => PASSOS.forEach((x) => { if (x.img) new Image().src = "/img/" + x.img; }), 800);
  }
  EINK.tutorial = { abrir };
})();
