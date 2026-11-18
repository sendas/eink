"use strict";
// Ajuda, «Como se faz»: uma lista de tarefas com os passos por palavras e o botão «Mostrar-me no ecrã», que abre o ecrã certo e
// aponta para o sítio onde se clica (usa o guia de `guia.js`). Cada entrada: `tit`, `palavras` (para a procura), `passos`,
// `ir` (um endereço «#/...», ou «pauta» / «turma» = a turma escolhida no cimo da página) e `guia` = [ecrã, título do passo do guia].
(() => {
  const { api, mostrar, esc, $ } = EINK;
  const GRUPOS = [
    { nome: "Começar", itens: [
      { tit: "Criar uma turma", palavras: "nova turma adicionar turma ano letivo", ir: "#/turmas", guia: ["turmas", "Cria uma turma"],
        passos: ["Abre «Turmas» no menu do cimo.", "Escreve o nome (por exemplo «7.º A»), o ano letivo e o ano de escolaridade.", "Clica em «Criar turma»."] },
      { tit: "Pôr os alunos na turma", palavras: "lista alunos colar excel importar adicionar", ir: "turma", guia: ["turma", "Adiciona os alunos"],
        passos: ["Abre «Turmas» e clica na turma.", "Cola a lista, um aluno por linha, com o número e o nome (por exemplo «12 Ana Silva»), ou escolhe um ficheiro Excel.", "Clica em «Adicionar alunos»."] },
      { tit: "Pôr as fotografias dos alunos", palavras: "fotos retratos pdf imagem", ir: "turma", guia: ["turma", "Fotografias dos alunos"],
        passos: ["Abre a turma.", "Abre «Fotografias da turma a partir de um PDF ou imagem» e escolhe o ficheiro da turma.", "Confirma na tabela a que aluno pertence cada fotografia e guarda."] },
      { tit: "Escolher as disciplinas que leciono", palavras: "disciplina critérios documentos grupo", ir: "#/turmas", guia: ["turmas", "As tuas disciplinas"],
        passos: ["Abre «Turmas».", "Clica em «Escolher as minhas disciplinas».", "Escolhe o ciclo e marca as disciplinas. A plataforma passa a usar os critérios de avaliação dessas disciplinas."] },
    ] },
    { nome: "Notas e pauta", itens: [
      { tit: "Criar um teste, uma ficha ou um trabalho", palavras: "avaliação nova coluna peso adicionar", ir: "pauta", guia: ["pauta", "Cria um teste, ficha ou trabalho"],
        passos: ["Abre «Notas» e escolhe o período da turma.", "No cabeçalho do critério (por exemplo «Testes e trabalhos») clica em «+ Adicionar avaliação».", "Escreve o título, o peso e a nota máxima e guarda. Aparece uma coluna nova na pauta."] },
      { tit: "Lançar as notas de um teste", palavras: "escrever nota classificação percentagem", ir: "pauta", guia: ["pauta", "Lança as notas"],
        passos: ["Abre a pauta do período.", "Clica na célula do aluno, na coluna do teste, e escreve a nota.", "Carrega em Enter ou Tab para passar ao aluno seguinte. Guarda-se sozinho e a cor do nível aparece logo."] },
      { tit: "Colar notas copiadas do Excel", palavras: "copiar colar bloco folha ctrl v", ir: "pauta", guia: ["pauta", "Lança as notas"],
        passos: ["No Excel, seleciona as notas (uma coluna ou um bloco) e copia com Ctrl+C.", "Na pauta, clica na primeira célula onde as notas devem ficar.", "Cola com Ctrl+V. Se te enganares, Ctrl+Z desfaz."] },
      { tit: "Corrigir um teste questão a questão (grelha)", palavras: "grelha cotações questões pontuação perguntas", ir: "pauta", guia: ["pauta", "Opções de cada avaliação"],
        passos: ["Na pauta, clica nos três pontos «⋯» do cabeçalho do teste e escolhe a grelha.", "Em «Questões e cotações» escreve as questões e quanto vale cada uma (a soma deve dar 100).", "Lança a pontuação de cada aluno em cada questão. A nota do teste passa sozinha para a pauta."] },
      { tit: "Dar a nota de comportamento", palavras: "atitudes nível comportamento escala", ir: "pauta", guia: ["pauta", "Comportamento"],
        passos: ["Na pauta, vai à coluna do comportamento.", "Por cima da tabela escolhe a escala: nível de 1 a 5, percentagem ou classificação de 0 a 20.", "Clica na célula do aluno e escreve o valor."] },
      { tit: "Ver a nota final de cada aluno", palavras: "final nível 1 a 5 0 a 20 valores secundário cartões menção", ir: "pauta", guia: ["pauta", "Tabela ou cartões"],
        passos: ["Abre a pauta do período. A última coluna mostra a nota final, calculada pelos pesos dos critérios.", "No ensino básico aparece o nível de 1 a 5; do 10.º ao 12.º ano e nos cursos profissionais, a classificação de 0 a 20.", "Clica em «Pauta final em cartões» para ver cada aluno com a fotografia, a nota e a escala."] },
      { tit: "Levar a pauta para o Excel", palavras: "descarregar exportar xlsx csv imprimir", ir: "pauta", guia: ["pauta", "Leva a pauta contigo"],
        passos: ["Abre a pauta do período.", "No fundo da página clica em «Descarregar Excel (.xlsx)» ou «Descarregar CSV».", "Abre o ficheiro no Excel."] },
    ] },
    { nome: "Avaliações intercalares", itens: [
      { tit: "Escrever as avaliações intercalares", palavras: "intercalar menção descritiva satisfaz apreciação", ir: "pauta", guia: ["pauta", "Avaliações intercalares"],
        passos: ["Na pauta do período, clica em «Avaliações intercalares».", "Escolhe a 1.ª ou a 2.ª intercalar e clica em «Propor menções pelas notas».", "Muda a menção de quem quiseres e usa «Sugerir texto» para teres uma descritiva de partida, que podes editar."] },
    ] },
    { nome: "Grelhas e colegas", itens: [
      { tit: "Guardar uma grelha como modelo", palavras: "modelo reutilizar estrutura cotações", ir: "#/modelos", guia: ["modelos", "Cria um modelo"],
        passos: ["Abre «Modelos» no menu do cimo.", "Abre «Criar um modelo novo» e escreve uma questão por linha, com a cotação.", "Guarda. Numa grelha de teste podes depois aplicar esse modelo em «Reutilizar e partilhar»."] },
      { tit: "Enviar uma grelha a um colega", palavras: "partilhar enviar colega docente email", ir: "#/modelos", guia: ["modelos", "Envia a um colega"],
        passos: ["Abre «Modelos» e clica em «Enviar a colegas» no modelo.", "Escreve o nome do colega e escolhe-o na lista (aparecem os docentes da escola).", "Envia. O colega recebe uma cópia das questões e cotações, sem alunos nem notas."] },
    ] },
    { nome: "Na aula", itens: [
      { tit: "Começar a aula (chamada, plano e lembretes)", palavras: "aula hoje plano lembretes iniciar", ir: "#/aula", guia: ["aula", "A turma desta aula"],
        passos: ["Abre «Sala de aula» e clica em «Começar a aula».", "Confirma a turma.", "Faz a chamada, junta as atividades de hoje e vê os lembretes, tudo no mesmo ecrã."] },
      { tit: "Fazer a chamada", palavras: "faltas presenças atraso", ir: "#/chamada", guia: ["chamada", "Toca em quem faltou"],
        passos: ["Abre «Sala de aula» e escolhe «Chamada».", "Toca no cartão de quem faltou; um segundo toque marca atraso.", "Se estão todos, clica em «Todos presentes». Guarda-se sozinho."] },
      { tit: "Sortear um aluno ou formar grupos", palavras: "sorteio aleatório grupos equipas ao acaso", ir: "#/sorteio", guia: ["sorteio", "Sortear um aluno"],
        passos: ["Abre «Sala de aula» e escolhe «Sorteio».", "Clica em «Sortear um aluno» (não repete ninguém até saírem todos).", "Para grupos, escolhe quantos queres e clica em «Formar grupos»."] },
      { tit: "Mostrar um temporizador no projetor", palavras: "relógio tempo cronómetro contagem projetar", ir: "#/temporizador", guia: ["temporizador", "Projetar"],
        passos: ["Abre «Sala de aula» e escolhe «Temporizador».", "Escolhe os minutos e clica em «Iniciar».", "Clica em «Projetar» (ou na tecla F) para ecrã inteiro; Esc para sair."] },
      { tit: "Fazer uma pergunta rápida à turma", palavras: "sondagem votação pergunta telemóvel código", ir: "#/sondagens", guia: ["sondagens", "Pergunta rápida"],
        passos: ["Abre «Sala de aula» e escolhe «Sondagens».", "Escreve a pergunta e as opções.", "Abre a sondagem: os alunos entram no telemóvel com o código que aparece no ecrã, sem conta."] },
      { tit: "Jogar um quiz ao vivo", palavras: "quiz jogo kahoot pin alcunha perguntas", ir: "#/quizzes", guia: ["quizzes", "Jogar ao vivo"],
        passos: ["Abre «Sala de aula» e escolhe «Quizzes». Se ainda não tens nenhum, cria um em «Novo quiz».", "Clica em «Jogar ao vivo» no quiz.", "Os alunos entram no telemóvel com o código e uma alcunha; tu avanças as perguntas."] },
      { tit: "Fazer um bilhete de saída", palavras: "fim da aula balanço anónimo respostas", ir: "#/bilhete", guia: ["bilhete", "Bilhete de saída"],
        passos: ["Abre «Sala de aula» e escolhe «Bilhete de saída».", "Revê as perguntas e clica em «Abrir o bilhete».", "Nos últimos minutos, cada aluno responde no telemóvel, sem nome. Ficas com as respostas por turma e data."] },
      { tit: "Registar quem participou", palavras: "participação registo positivo melhorar", ir: "#/participacao", guia: ["participacao", "Um toque por registo"],
        passos: ["Abre «Sala de aula» e escolhe «Registo de participação».", "Toca no aluno e escolhe o tipo de registo (por exemplo «Participou»).", "Só tu vês estes registos. Os totais aparecem na pauta, como apoio à nota de comportamento."] },
    ] },
    { nome: "Fim do ano", itens: [
      { tit: "Arquivar as turmas do ano que acabou", palavras: "arquivo ano letivo novo ano limpar", ir: "#/turmas", guia: ["turmas", "No fim do ano letivo"],
        passos: ["Abre «Turmas».", "Clica em «Arquivar um ano letivo» e escolhe o ano.", "As turmas ficam guardadas e deixam de aparecer na lista."] },
    ] },
  ];
  const limpo = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const TODOS = GRUPOS.flatMap((g) => g.itens);
  TODOS.forEach((x, i) => { x.n = i; x.onde = limpo([x.tit, x.palavras, ...x.passos].join(" ")); });
  const turmaGuardada = () => { try { return +localStorage.getItem("eink.ajudaTurma") || 0; } catch { return 0; } };

  async function ajuda() {
    const turmas = await api("GET", "/api/atalhos");
    const escolhida = (turmas.find((t) => t.id === turmaGuardada()) || turmas[0] || {}).id || 0;
    mostrar(`<h1>Ajuda: como se faz</h1>
      <p class="pequeno">Escolhe o que queres fazer. Cada resposta tem os passos e o botão «Mostrar-me no ecrã», que abre o sítio certo e aponta para onde deves clicar.</p>
      <div class="painel aj-topo">
        <label class="aj-procura"><span>O que queres fazer?</span><input type="search" id="aj-q" placeholder="Por exemplo: lançar notas, chamada, grelha" autocomplete="off"></label>
        ${turmas.length > 1 ? `<label class="aj-turma"><span>Mostrar com a turma</span><select id="aj-t">${turmas.map((t) => `<option value="${t.id}"${t.id === escolhida ? " selected" : ""}>${esc(t.nome)}</option>`).join("")}</select></label>` : ""}
      </div>
      <p id="aj-vazio" class="painel" hidden>Não encontrei nada com essas palavras. Experimenta outra palavra ou <button type="button" class="ligacao" data-sugestao>diz-nos o que falta</button>.</p>
      ${GRUPOS.map((g) => `<section class="aj-grupo"><h2>${esc(g.nome)}</h2>${g.itens.map((x) => `<details class="aj-item" data-n="${x.n}"><summary>${esc(x.tit)}</summary>
        <ol>${x.passos.map((p) => `<li>${esc(p)}</li>`).join("")}</ol><p><button type="button" class="aj-mostrar" data-mostrar="${x.n}">Mostrar-me no ecrã</button></p></details>`).join("")}</section>`).join("")}
      <section class="aj-grupo"><h2>Outras ajudas</h2><div class="painel aj-outras">
        <p><button type="button" class="sec" id="aj-tut">Rever o tutorial de boas-vindas</button> <button type="button" class="sec" id="aj-repor">Voltar a mostrar os guias de cada ecrã</button> <button type="button" class="sec" data-sugestao>Não encontro o que procuro</button></p>
        <p class="pequeno">Em cada ecrã, o botão «Guia do ecrã» (no cimo, ou no fundo da página no telemóvel) explica o que lá está. A lista do que mudou em cada versão está em <a href="#/versoes">Versões</a>.</p></div></section>`);

    const q = $("#aj-q");
    q.oninput = () => {
      const pal = limpo(q.value).split(/\s+/).filter(Boolean); let n = 0;
      document.querySelectorAll("#vista .aj-item").forEach((d) => { const ok = pal.every((p) => TODOS[+d.dataset.n].onde.includes(p)); d.hidden = !ok; if (ok) n++; d.open = !!pal.length && ok && n <= 3; });
      document.querySelectorAll("#vista .aj-grupo").forEach((g) => { if (g.querySelector(".aj-item")) g.hidden = !g.querySelector(".aj-item:not([hidden])"); });
      $("#aj-vazio").hidden = n > 0;
    };
    const sel = $("#aj-t"); if (sel) sel.onchange = () => { try { localStorage.setItem("eink.ajudaTurma", sel.value); } catch { /* sem localStorage */ } };
    document.querySelectorAll("#vista [data-mostrar]").forEach((b) => { b.onclick = () => {
      const x = TODOS[+b.dataset.mostrar]; let destino = x.ir, guia = x.guia;
      if (x.ir === "pauta" || x.ir === "turma") {
        const t = turmas.find((y) => y.id === (sel ? +sel.value : escolhida));
        const per = t && (t.periodos.find((p) => !p.fechado) || t.periodos[0]);
        if (!t || (x.ir === "pauta" && !per)) { EINK.aviso("Para te mostrar isto é preciso teres uma turma. Começa por criar uma."); destino = "#/turmas"; guia = ["turmas", "Cria uma turma"]; }
        else destino = x.ir === "pauta" ? "#/pauta/" + per.id : "#/turma/" + t.id;
      }
      EINK.guia.pedir(guia[0], guia[1]); location.hash = destino;
    }; });
    $("#aj-tut").onclick = () => EINK.tutorial.abrir();
    $("#aj-repor").onclick = async () => { await api("POST", "/api/eu/guia", { repor: true }); EINK.eu.guias = []; EINK.aviso("Pronto. O guia volta a aparecer na primeira vez que abrires cada ecrã."); };
  }
  EINK.rotas.push([/^\/ajuda$/, ajuda]);
  EINK.ajuda = { GRUPOS };
})();
