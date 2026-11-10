"use strict";
// Guia de cada ecrã: pequenos avisos que apontam para o sítio certo, dizem o que fazer e onde clicar. Aparecem sozinhos na primeira vez que o docente
// abre cada ecrã (depois do tutorial de boas-vindas) e podem ser vistos outra vez no botão «Guia do ecrã» do cabeçalho.
(() => {
  const { esc } = EINK;
  // Procura um elemento da vista pelo seletor e, se quiseres, pelo texto.
  const q = (sel, re) => () => { const l = [...document.querySelectorAll("#vista " + sel)]; return re ? l.find((e) => re.test(e.textContent)) : l[0]; };

  // Cada passo: onde (`alvo`), título, explicação (`txt`) e o que fazer (`acao`).
  const GUIAS = {
    inicio: [
      { alvo: q("#heroi-acoes a.botao", /Abrir|Continuar/), tit: "Atalho para continuar", txt: "Abre logo a pauta onde estavas. Para ver todas as turmas e períodos, usa «Todas as notas».", acao: "Clica no botão grande para continuar o trabalho." },
      { alvo: q("button", /Criar (a primeira )?turma/), tit: "Cria a tua primeira turma", txt: "Sem turmas não há pauta. Depois de criada, colas a lista de alunos e podes começar a lançar notas.", acao: "Clica em «Criar a primeira turma»." },
      { alvo: q("#turmas .turma-cartao .botao.periodo"), tit: "Escolhe o período", txt: "A pauta abre-se pelo período da turma. Tocar no cartão abre o período atual.", acao: "Clica em «1.º período» (ou no que quiseres) para lançar notas." },
      { alvo: q("#cg-escolher"), tit: "Diz que disciplina lecionas", txt: "Com a disciplina escolhida, vês os critérios de avaliação e os documentos da escola.", acao: "Clica em «Escolher disciplinas»." },
      { alvo: q("h2", /Ferramentas de sala/), tit: "Ferramentas para a aula", txt: "«Começar a aula» junta a chamada, o plano de hoje e os lembretes. As tuas 4 favoritas aparecem aqui; as outras estão em «Sala de aula». Os alunos não precisam de conta.", acao: "Clica em «Começar a aula» ou em «Todas as ferramentas»." },
    ],
    notas: [
      { alvo: q("a.botao.sec"), tit: "Escolhe a turma e o período", txt: "Cada linha é uma turma. Os botões abrem a pauta do período.", acao: "Clica em «1.º período» para lançar notas." },
    ],
    turmas: [
      { alvo: q("#f-turma"), tit: "Cria uma turma", txt: "Escreve o nome (por exemplo «7.º A»), o ano letivo e o ano de escolaridade.", acao: "Preenche e clica em «Criar turma»." },
      { alvo: q("#esc-disc"), tit: "As tuas disciplinas", txt: "Escolhe o ciclo e a disciplina para que a plataforma use os critérios certos.", acao: "Clica em «Escolher as minhas disciplinas»." },
      { alvo: q("#arq-ano"), tit: "No fim do ano letivo", txt: "Arquiva as turmas do ano que acabou. Ficam guardadas e deixam de aparecer na lista.", acao: "Clica em «Arquivar um ano letivo» quando for altura." },
    ],
    turma: [
      { alvo: q("#f-alunos"), tit: "Adiciona os alunos", txt: "Cola a lista, um aluno por linha, com o número e o nome (por exemplo «12 Ana Silva»). Também podes escolher um ficheiro Excel.", acao: "Cola a lista e clica em «Adicionar alunos»." },
      { alvo: q("a.botao", /Abrir pauta/), tit: "Abre a pauta", txt: "A pauta é onde lanças as notas de cada período.", acao: "Clica em «Abrir pauta» no período que quiseres." },
      { alvo: q("#fotos-pdf summary"), tit: "Fotografias dos alunos", txt: "Se tiveres um PDF da turma com fotografias, a plataforma associa cada fotografia ao aluno. É opcional.", acao: "Clica aqui para abrir e escolher o ficheiro." },
    ],
    pauta: [
      { alvo: q("#troca"), tit: "Muda de turma sem sair daqui", txt: "Em vez de voltares atrás, escolhe outra turma ou outro período.", acao: "Clica na lista e escolhe." },
      { alvo: q("button.add-aval"), tit: "Cria um teste, ficha ou trabalho", txt: "Cada avaliação é uma coluna da pauta. Escolhe o título, o peso e a nota máxima.", acao: "Clica em «+ Adicionar avaliação»." },
      { alvo: q("input.nota[data-aval]"), tit: "Lança as notas", txt: "Escreve a nota e carrega em Enter ou Tab para passar à seguinte. Também podes colar um bloco copiado do Excel. A cor e o nome do nível aparecem sozinhos.", acao: "Clica numa célula e escreve a nota." },
      { alvo: q("input[data-nivel]"), tit: "Comportamento", txt: "Escreve o nível de 1 a 5 (ou uma percentagem, conforme a escala que escolheres por cima da tabela).", acao: "Clica na célula do aluno e escreve." },
      { alvo: q("details.menu-col summary"), tit: "Opções de cada avaliação", txt: "Abre a grelha por questões, muda o peso, importa notas ou apaga a avaliação.", acao: "Clica nos três pontos «⋯» do cabeçalho." },
      { alvo: q("[data-vista]"), tit: "Tabela ou cartões", txt: "A «Pauta final em cartões» mostra cada aluno com a nota final e a escala, ótima para consultar.", acao: "Clica em «Pauta final em cartões»." },
      { alvo: q("a.botao", /Avaliações intercalares/), tit: "Avaliações intercalares", txt: "Aqui escreves a menção e a descritiva de cada aluno a meio do período.", acao: "Clica em «Avaliações intercalares»." },
      { alvo: q("a.botao", /Descarregar Excel/), tit: "Leva a pauta contigo", txt: "Descarrega a pauta em Excel ou em CSV.", acao: "Clica em «Descarregar Excel (.xlsx)»." },
    ],
    grelha: [
      { alvo: q("details > summary"), tit: "Questões e cotações", txt: "Define as questões do teste e quanto vale cada uma. A soma deve dar 100.", acao: "Clica aqui para abrir e editar as questões." },
      { alvo: q("#cot-soma"), tit: "A soma das cotações", txt: "Mostra se as cotações somam 100. Se não somarem, a plataforma ajusta-as por ti e as pontuações já lançadas mudam na mesma proporção.", acao: "Clica em «Fazer somar 100» se for preciso." },
      { alvo: q("#g-partilha h2"), tit: "Reutilizar e partilhar", txt: "Copia a estrutura de outro teste, usa ou guarda um modelo, ou envia a grelha a colegas. Nunca se copiam as pontuações dos alunos.", acao: "Usa as três colunas deste painel: copiar de outro teste, modelos e partilhar." },
      { alvo: q("#i-enviar-colegas"), tit: "Enviar a colegas", txt: "Escreve o nome do colega e escolhe na lista. Aparecem todos os docentes da escola.", acao: "Clica em «Enviar a colegas»." },
    ],
    modelos: [
      { alvo: q("details > summary"), tit: "Cria um modelo", txt: "Um modelo guarda as questões e as cotações de um teste para usares quando quiseres.", acao: "Clica aqui e escreve uma questão por linha." },
      { alvo: q("button", /Enviar a colegas/), tit: "Envia a um colega", txt: "O colega recebe uma cópia da estrutura, sem notas nem alunos.", acao: "Clica em «Enviar a colegas»." },
    ],
    intercalares: [
      { alvo: q("a.botao"), tit: "1.ª ou 2.ª intercalar", txt: "Escolhe a intercalar a que queres escrever as menções e as descritivas.", acao: "Clica em «1.ª intercalar» ou «2.ª intercalar»." },
      { alvo: q("#propor"), tit: "Propor menções pelas notas", txt: "Preenche as menções de todos os alunos a partir da nota atual. Depois podes mudar uma a uma.", acao: "Clica em «Propor menções pelas notas»." },
      { alvo: q("td select"), tit: "Menção de cada aluno", txt: "«Não satisfaz», «Satisfaz» ou «Satisfaz bastante». Guarda-se sozinha.", acao: "Clica e escolhe a menção." },
      { alvo: q("button", /Sugerir/), tit: "Texto de partida", txt: "Dá-te uma descritiva para o nível do aluno, que podes editar à vontade.", acao: "Clica em «Sugerir texto»." },
    ],
    sala: [
      { alvo: q(".sala-comecar"), tit: "Começar a aula", txt: "Escolhe a turma e tens num só ecrã a chamada, o plano de hoje e os lembretes.", acao: "Clica em «Começar a aula» no início de cada aula." },
      { alvo: q(".sala-cat h2"), tit: "Três tipos de atividade", txt: "Com telemóvel (os alunos entram com um código), sem telemóvel (para projetar) e gestão da turma (só para ti).", acao: "Escolhe a atividade no cartão." },
      { alvo: q(".estrela"), tit: "As tuas favoritas", txt: "Marca até 4 atividades com a estrela: ficam no Início.", acao: "Clica na estrela ☆ de uma atividade." },
    ],
    aula: [
      { alvo: q("#t"), tit: "A turma desta aula", txt: "Sugerimos a turma que costumas ter a esta hora. Muda aqui se for outra.", acao: "Escolhe a turma na lista." },
      { alvo: q("#au-ch .ch-grelha"), tit: "Chamada com um toque", txt: "Toca em quem faltou (falta) e outra vez para atraso. Guarda sozinha.", acao: "Toca nos cartões dos alunos que faltaram." },
      { alvo: q("#au-f"), tit: "Plano de hoje", txt: "Junta as atividades da aula; cada uma fica com um botão «Abrir» já com esta turma. Na próxima aula podes copiar o plano.", acao: "Escolhe a atividade e clica em «Acrescentar»." },
      { alvo: q("#au-lem"), tit: "Lembretes da turma", txt: "Coisas a não esquecer com esta turma, como recolher autorizações.", acao: "Escreve o lembrete e clica em «Acrescentar»." },
    ],
    chamada: [
      { alvo: q(".ch-grelha"), tit: "Toca em quem faltou", txt: "Um toque marca falta, outro marca atraso, outro volta a presente. Guarda sozinha.", acao: "Toca no cartão do aluno." },
      { alvo: q("#ch-todos"), tit: "Estão todos?", txt: "Se ninguém faltou, guarda a chamada de uma vez.", acao: "Clica em «Todos presentes»." },
      { alvo: q("[data-tab]", /Resumo/), tit: "Resumo da turma", txt: "Faltas e atrasos de cada aluno, com aviso a partir de 5 faltas.", acao: "Clica em «Resumo da turma»." },
    ],
    sorteio: [
      { alvo: q("#um"), tit: "Sortear um aluno", txt: "Não repete ninguém até saírem todos e não escolhe quem faltou hoje.", acao: "Clica em «Sortear um aluno»." },
      { alvo: q("#gr"), tit: "Grupos ao acaso", txt: "Por número de grupos ou por alunos em cada grupo, equilibrados. Podes separar dois alunos e guardar os grupos para o placar.", acao: "Escolhe o número e clica em «Formar grupos»." },
    ],
    temporizador: [
      { alvo: q("#ini"), tit: "Iniciar", txt: "O anel mostra o tempo que falta e muda de cor no último minuto. O som no fim pode ser desligado.", acao: "Escolhe os minutos e clica em «Iniciar»." },
      { alvo: q("[data-projetar]"), tit: "Projetar", txt: "Põe o ecrã inteiro só com o relógio e a tarefa. Também podes carregar na tecla F.", acao: "Clica em «Projetar»; Esc para sair." },
    ],
    sondagens: [
      { alvo: q("#f-sond"), tit: "Pergunta rápida", txt: "Escolha múltipla, resposta curta ou «só na sala» (de braço no ar, sem telemóveis). Podes marcar a resposta certa e esconder os resultados até os revelares.", acao: "Escreve a pergunta, escolhe um modelo e abre a sondagem." },
    ],
    mural: [
      { alvo: q("#f-mural"), tit: "Mural da turma", txt: "Os alunos escrevem ideias ou dúvidas curtas no telemóvel, sem nome. Podes aprovar antes de aparecerem e usar colunas como «Sei / Quero saber / Aprendi».", acao: "Escreve a pergunta e clica em «Abrir o mural»." },
    ],
    bilhete: [
      { alvo: q("#f-bil"), tit: "Bilhete de saída", txt: "Nos últimos minutos, cada aluno responde no telemóvel (anónimo). Vês a média e as respostas, guardadas por turma e data.", acao: "Revê as perguntas e clica em «Abrir o bilhete»." },
    ],
    placar: [
      { alvo: q("#pl-f"), tit: "Placar de equipas", txt: "Usa os grupos que guardaste no sorteio ou um número de equipas. Fica guardado neste navegador.", acao: "Escolhe e clica em «Começar»." },
    ],
    "quiz-projetor": [
      { alvo: q("a[href^='#/quiz-projetor/']"), tit: "Quiz sem telemóveis", txt: "As equipas respondem com os cartões A, B, C e D; tu marcas quem acertou e o placar soma.", acao: "Clica no quiz que queres projetar." },
    ],
    roda: [
      { alvo: q("#ro-f"), tit: "Pergunta e roda", txt: "Projeta a pergunta, dá tempo para pensar e só depois sorteia quem responde. Quem faltou hoje não sai.", acao: "Escreve as perguntas (ou escolhe um quiz) e clica em «Começar»." },
    ],
    tarefa: [
      { alvo: q("[data-modo]"), tit: "Como se trabalha agora", txt: "Individual, pares, grupo ou turma toda, com os passos e o tempo no ecrã.", acao: "Escolhe o modo e escreve os passos." },
    ],
    lembretes: [
      { alvo: q("#lem"), tit: "Lembretes da turma", txt: "Substituem as antigas listas de verificação e ficam guardados por turma. Aparecem em «Começar a aula».", acao: "Escreve o lembrete e clica em «Acrescentar»." },
    ],
    participacao: [
      { alvo: q(".aviso-privado"), tit: "Só para ti", txt: "Os registos nunca aparecem no projetor nem aos alunos e não entram nas notas. Apagam-se com o prazo de retenção da escola.", acao: "Lê e continua." },
      { alvo: q(".pa-al"), tit: "Um toque por registo", txt: "Toca no aluno e escolhe o tipo (por exemplo «Participou»). Os totais aparecem na pauta, como apoio ao nível.", acao: "Toca no cartão de um aluno." },
      { alvo: q("[data-tab]", /Tipos/), tit: "Os teus tipos", txt: "Até 8 tipos, positivos ou a melhorar.", acao: "Clica em «Tipos de registo» para os mudar." },
    ],
    quizzes: [
      { alvo: q("[data-vivo]"), tit: "Jogar ao vivo", txt: "Os alunos entram no telemóvel com um código e uma alcunha.", acao: "Clica em «Jogar ao vivo»." },
      { alvo: q("[data-opcoes]"), tit: "Outras formas de jogar", txt: "Por equipas, com perguntas baralhadas, revisão ao próprio ritmo (para casa) ou no projetor sem telemóveis.", acao: "Clica em «Outras formas de jogar»." },
    ],
  };
  const NOMES = { "": "inicio" };
  const chaveDe = (hash) => { const k = (hash || location.hash).replace(/^#\/?/, "").split("/")[0]; return NOMES[k] || k || "inicio"; };

  let ativo = null; // { chave, passos, i, pop, anel, parar }
  const vistos = () => new Set((EINK.eu && EINK.eu.guias) || []);
  const encontrar = (chave) => (GUIAS[chave] || []).map((p) => ({ ...p, el: p.alvo() })).filter((p) => p.el && p.el.isConnected && p.el.getClientRects().length);

  function fechar(marcar = true) {
    if (!ativo) return;
    const a = ativo; ativo = null;
    a.pop.remove(); a.anel.remove(); window.removeEventListener("resize", a.parar); window.removeEventListener("scroll", a.parar, true); document.removeEventListener("keydown", a.tecla, true);
    if (marcar) marcarVisto(a.chave);
  }
  function marcarVisto(chave) {
    if (!EINK.eu) return;
    EINK.eu.guias = [...new Set([...(EINK.eu.guias || []), chave])];
    EINK.api("POST", "/api/eu/guia", { chave }).catch(() => {});
  }

  function abrir(chave, opc = {}) {
    fechar(false);
    const passos = encontrar(chave);
    if (!passos.length) { if (opc.manual) EINK.aviso("Este ecrã não tem guia, ou o que ele aponta ainda não está à vista."); return false; }
    const anel = document.createElement("div"); anel.className = "guia-anel"; anel.setAttribute("aria-hidden", "true");
    const pop = document.createElement("div"); pop.className = "guia-pop"; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Guia do ecrã");
    document.body.append(anel, pop);
    const a = ativo = { chave, passos, i: 0, pop, anel };
    const pos = () => {
      const p = a.passos[a.i]; if (!p || !p.el.isConnected) return;
      const r = p.el.getBoundingClientRect(), pad = 6, L = innerWidth, A = innerHeight;
      Object.assign(anel.style, { left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + 2 * pad + "px", height: r.height + 2 * pad + "px" });
      const w = Math.min(22 * 16, L - 24); pop.style.width = w + "px";
      const h = pop.offsetHeight, abaixo = A - r.bottom, acima = r.top;
      let top, seta = "cima";
      if (abaixo >= h + 24) top = r.bottom + pad + 12;
      else if (acima >= h + 24) { top = r.top - pad - 12 - h; seta = "baixo"; }
      else { top = Math.max(12, A - h - 12); seta = "nenhuma"; } // alvo muito grande: o aviso fica em baixo no ecrã
      const left = Math.min(Math.max(r.left + r.width / 2 - w / 2, 12), L - w - 12);
      pop.style.left = left + "px"; pop.style.top = top + "px"; pop.dataset.seta = seta;
      pop.style.setProperty("--seta-x", Math.min(Math.max(r.left + r.width / 2 - left, 20), w - 20) + "px");
    };
    let quadro = 0; a.parar = () => { cancelAnimationFrame(quadro); quadro = requestAnimationFrame(pos); };
    const mostrar = () => {
      const p = a.passos[a.i], ultimo = a.i === a.passos.length - 1;
      p.el.scrollIntoView({ block: "center", inline: "nearest" });
      pop.innerHTML = `<div class="guia-cab"><span>Guia do ecrã · ${a.i + 1} de ${a.passos.length}</span><button type="button" class="guia-x" aria-label="Fechar o guia">×</button></div>
        <h3>${esc(p.tit)}</h3><p>${esc(p.txt)}</p><p class="guia-acao"><strong>Faz assim:</strong> ${esc(p.acao)}</p>
        <div class="guia-pe"><button type="button" class="ligacao guia-nunca">Não mostrar mais guias</button><span class="guia-bot">${a.i ? '<button type="button" class="sec" id="guia-ant">Anterior</button>' : ""}<button type="button" id="guia-seg">${ultimo ? "Entendi" : "Seguinte"}</button></span></div>`;
      pop.querySelector(".guia-x").onclick = () => fechar();
      pop.querySelector(".guia-nunca").onclick = () => { fechar(false); if (EINK.eu) EINK.eu.guias = ["*"]; EINK.api("POST", "/api/eu/guia", { chave: "*" }).catch(() => {}); EINK.aviso("Pronto. Os guias não voltam a aparecer sozinhos. Podes vê-los no botão «Guia do ecrã»."); };
      const ant = pop.querySelector("#guia-ant"); if (ant) ant.onclick = () => { a.i--; mostrar(); };
      pop.querySelector("#guia-seg").onclick = () => { if (ultimo) fechar(); else { a.i++; mostrar(); } };
      pop.querySelector("#guia-seg").focus({ preventScroll: true });
      pos(); requestAnimationFrame(pos);
    };
    a.tecla = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); fechar(); }
      else if (e.key === "ArrowRight" && a.i < a.passos.length - 1 && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { a.i++; mostrar(); }
      else if (e.key === "ArrowLeft" && a.i > 0 && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { a.i--; mostrar(); }
    };
    window.addEventListener("resize", a.parar); window.addEventListener("scroll", a.parar, true); document.addEventListener("keydown", a.tecla, true);
    mostrar(); return true;
  }

  // Chamado depois de cada ecrã abrir: mostra o guia se ainda não foi visto (espera um pouco, porque os ecrãs carregam dados).
  let temporizador = 0;
  function aoAbrirEcra() {
    clearTimeout(temporizador); fechar(false);
    const chave = chaveDe();
    document.querySelectorAll("[data-guia-caixa]").forEach((cx) => { cx.hidden = !GUIAS[chave]; });
    if (!GUIAS[chave] || !EINK.eu || EINK.eu.trocar || EINK.eu.tutorial || vistos().has("*") || vistos().has(chave)) return;
    let tentativas = 0;
    const tenta = () => {
      if (document.querySelector("dialog[open]") || ativo) return;
      if (chaveDe() !== chave) return;
      if (encontrar(chave).length) { abrir(chave); return; }
      if (++tentativas < 8) temporizador = setTimeout(tenta, 400);
    };
    temporizador = setTimeout(tenta, 700);
  }
  const ligar = () => document.querySelectorAll("[data-abrir-guia]").forEach((bt) => { bt.onclick = () => abrir(chaveDe(), { manual: true }); });

  EINK.guia = { abrir, fechar, aoAbrirEcra, ligar, chaveDe, tem: (k) => !!GUIAS[k] };
})();
