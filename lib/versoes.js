"use strict";
// Histórico de versões (mais recente primeiro). A cada versão nova: subir "version" no package.json e acrescentar a entrada no topo.
// `data` é a data e a hora (hora de Lisboa) em que a versão foi publicada. Tipos: novidade, melhoria, correção.
module.exports = [
  { versao: "0.18.2", data: "2026-11-03 11:20", tipo: "novidade", itens: [
    "Os critérios de avaliação do Manual de Avaliação das Aprendizagens 2025/2026 (75 disciplinas, por ano) ficam carregados logo no primeiro arranque. Cada docente vê, na sua disciplina, os critérios e os pesos do manual, e as turmas novas usam-nos.",
  ] },
  { versao: "0.18.1", data: "2026-11-03 10:40", tipo: "correção", itens: [
    "As 75 disciplinas do manual de critérios (incluindo Tecnologias de Informação e Comunicação) passam a existir logo, sem importar nenhum ficheiro. O docente escolhe o ciclo e a disciplina e o administrador carrega o PDF dos critérios de cada uma.",
  ] },
  { versao: "0.18.0", data: "2026-11-03 10:05", tipo: "novidade", itens: [
    "Fotografias da turma a partir de um só PDF (ou imagem): o programa encontra cada fotografia, lê o nome que está por baixo e liga-a ao aluno. Mostra tudo para confirmares ou corrigires antes de guardar. A primeira leitura de uma imagem pode demorar alguns segundos.",
    "O ficheiro nunca sai do teu computador: só se guardam os recortes quadrados de cada aluno.",
  ] },
  { versao: "0.17.0", data: "2026-11-03 08:29", tipo: "novidade", itens: [
    "Cada docente escolhe o ciclo e as disciplinas que leciona (1.º, 2.º e 3.º ciclos, secundário e cursos profissionais, com procura). Os critérios dessas disciplinas aparecem na página inicial, com separadores quando há várias, e a primeira passa a ser a disciplina por defeito das turmas novas.",
    "Documentos PDF por disciplina: o administrador carrega os critérios aprovados em Gestão, Critérios, e os docentes abrem-nos na página inicial (máximo 12 MB e 30 por disciplina).",
    "Fotografias dos alunos em lote: escolhe várias de uma vez, cada ficheiro com o número do aluno (12.jpg) ou o nome (Ana Silva.jpg); vês a quem cada uma foi ligada, corriges se preciso e só depois se guardam.",
    "Gestão, Critérios: passa a escolher-se a disciplina numa lista, em vez de se mostrarem todas; as turmas podem ser do 1.º ao 12.º ano; a importação aceita a coluna «Nível» para marcar disciplinas de cursos profissionais.",
    "O Entra deixa de criar um grupo «550 Informática» avulso: mostra o grupo de recrutamento junto da saudação e o docente escolhe as suas disciplinas.",
  ] },
  { versao: "0.16.0", data: "2026-11-02 22:29", tipo: "novidade", itens: [
    "Importar os critérios de avaliação de todos os grupos disciplinares de uma só vez, a partir de um ficheiro Excel ou CSV, ou colando do Excel (Gestão, Critérios): uma linha por critério, com grupo, ano, tipo, peso e casas decimais.",
    "Antes de gravar mostra o que acontece em cada grupo e ano (novo, substitui, sem alterações ou bloqueado) e só grava se os pesos somarem 100 e não houver erros. Não retira nem muda o tipo de critérios que já têm avaliações lançadas.",
    "Descarregar os critérios atuais num ficheiro para editar no Excel e voltar a importar.",
  ] },
  { versao: "0.15.1", data: "2026-11-02 22:25", tipo: "correção", itens: [
    "Ao partilhar o endereço (por exemplo no WhatsApp), a pré-visualização mostra «Eça Avalia», uma descrição e uma imagem, em vez de «Entrar».",
    "Ícone da plataforma no separador do navegador e no ecrã principal do telemóvel.",
    "As imagens JPEG passam a ser servidas com o tipo correto.",
  ] },
  { versao: "0.15.0", data: "2026-11-02 22:23", tipo: "novidade", itens: [
    "O grupo de recrutamento do docente (por exemplo «550 Informática») é lido do Entra (nome, departamento ou cargo), aparece junto da saudação e associa o docente ao grupo disciplinar com esse código, que é criado se ainda não existir. O que o administrador escolher à mão não é desfeito.",
    "Página inicial com os critérios de avaliação do grupo do docente, resumidos por ano com a barra dos pesos, e uma janela para os ver na totalidade (critérios, pesos, casas decimais e níveis).",
    "O nome do docente deixa de mostrar o sufixo do grupo («Docente-550 - Informática»).",
  ] },
  { versao: "0.14.1", data: "2026-11-02 21:14", tipo: "melhoria", itens: [
    "Slideshow da página de entrada: as capturas ampliam-se (botão «Ampliar» ou clique na imagem) numa janela a toda a largura, com setas, legenda, passar com o teclado ou deslizando, e botão de ecrã inteiro. As capturas ampliadas têm o dobro da resolução.",
  ] },
  { versao: "0.14.0", data: "2026-11-02 21:07", tipo: "melhoria", itens: [
    "Interruptor de modo claro e escuro, no topo da aplicação e na página de entrada: um clique alterna e a escolha fica guardada neste navegador.",
    "Enquanto não escolheres, o tema segue o do dispositivo; o botão «Sistema» volta a esse comportamento.",
  ] },
  { versao: "0.13.2", data: "2026-11-02 21:00", tipo: "melhoria", itens: [
    "Página de entrada: os cinco passos de «Como funciona» passam a ter um ícone próprio, cada um na sua cor, em vez de números.",
  ] },
  { versao: "0.13.1", data: "2026-11-02 20:44", tipo: "correção", itens: [
    "Telemóvel: a página deixa de ficar mais larga do que o ecrã (o menu do topo alargava tudo e o telemóvel encolhia a página); o cabeçalho passa a ocupar uma linha, com o menu a deslizar por baixo.",
    "Telemóvel: números principais em duas colunas, ferramentas em dois mosaicos, pauta final em cartões de duas colunas, formulário «Adicionar avaliação» recolhido e tabela da pauta com as primeiras colunas mais estreitas.",
  ] },
  { versao: "0.13.0", data: "2026-11-02 20:34", tipo: "novidade", itens: [
    "O nome passa a «Eça Avalia».",
    "Nova página de entrada: explica o que a plataforma faz, com um infográfico dos cinco passos, outro de como se chega à nota (pesos dos critérios e escala de níveis de 1 a 5), o slideshow de capturas, as ferramentas de sala e uma nota sobre os dados dos alunos, tudo ao lado do login.",
  ] },
  { versao: "0.12.1", data: "2026-11-02 20:26", tipo: "correção", itens: [
    "Entrada no telemóvel: se a Microsoft devolver o utilizador a outro navegador ou separador, o pedido de entrada recupera-se no servidor (só do mesmo endereço IP, durante 10 minutos) em vez de falhar com «o pedido expirou».",
    "Os erros da entrada aparecem numa página com o botão «Voltar e tentar outra vez», em vez de texto simples que alguns navegadores do telemóvel descarregavam como ficheiro.",
  ] },
  { versao: "0.12.0", data: "2026-11-02 19:57", tipo: "novidade", itens: [
    "Escala de 1 a 5 em cada aluno, pelos limites dos níveis, com uma marca na nota final: aparece na coluna Final da pauta e na nova «Pauta final em cartões».",
    "Fotografias dos alunos por baixo de cada nome: carregam-se ao clicar na miniatura, são cortadas e reduzidas no navegador, só o docente da turma as vê e apagam-se com o aluno. Interruptor «Mostrar fotografias».",
    "Página de entrada com um slideshow de capturas de ecrã do projeto (com dados fictícios).",
  ] },
  { versao: "0.11.0", data: "2026-11-02 19:00", tipo: "novidade", itens: [
    "Nova página inicial: saudação, atalho para continuar a trabalhar, números grandes (turmas, alunos, média geral, alunos a acompanhar) e um cartão por turma com média num anel, alunos por nível e progresso das notas lançadas.",
    "Ferramentas de sala em mosaicos grandes e simples; menu mais curto (Início, Notas, Turmas, Gestão) com a secção atual destacada.",
    "Pauta com letra e células maiores e um resumo gráfico no topo (média da turma, níveis, notas lançadas); a explicação longa passa para «Como funciona».",
    "Tipografia, cartões e botões redesenhados, nos temas claro e escuro.",
  ] },
  { versao: "0.10.0", data: "2026-11-02 18:35", tipo: "melhoria", itens: [
    "Menos cliques até às notas: «Notas» no menu e no painel, com um botão por turma e período (um clique abre a pauta), «Continuar» no último período em que trabalhaste e, dentro da pauta, um seletor para mudar de turma ou período sem voltar atrás.",
    "O título de cada teste na pauta abre logo a respetiva grelha.",
    "Cores mais suaves: papel quente, verde-petróleo e terracota; os critérios (por exemplo 70 % e 30 %) passam a ter um tom leve e um filete na cor própria, em vez de faixas sólidas, e as cores dos níveis das linhas ficam atenuadas.",
  ] },
  { versao: "0.9.1", data: "2026-11-02 18:31", tipo: "correção", itens: [
    "Cada versão nova usa endereços novos para o CSS e o JS, para o navegador e o Cloudflare não mostrarem cópias antigas depois de uma atualização.",
  ] },
  { versao: "0.9.0", data: "2026-11-02 18:27", tipo: "melhoria", itens: [
    "Pauta: cada critério (por exemplo 70 % e 30 %) tem a sua cor, o seu cabeçalho e barras grossas a separá-lo dos outros, e a cor do nível da linha só aparece em Final, Nível e Menção.",
    "Pauta: cabeçalhos das avaliações compactos, com título, resumo numa linha e um menu «⋯» com Grelha, Importar notas, Peso e Apagar, para caberem muitos testes, fichas e trabalhos.",
    "Linhas da grelha mais fortes, nos temas claro e escuro.",
    "A marca passa a «Avaliar Eça» e o número da versão aparece no topo, com esta página do histórico.",
  ] },
  { versao: "0.8.0", data: "2026-11-02 17:35", tipo: "novidade", itens: [
    "Contas locais com utilizador e palavra-passe, ao lado do login Office: o administrador cria-as em Gestão, Docentes (palavra-passe gerada, vista uma só vez), e o docente muda-a na primeira entrada.",
    "Gestão dos docentes numa lista só: conta Office ou local, último acesso, grupo disciplinar, papel de administrador, nova palavra-passe, retirar e reativar acesso.",
    "Aviso por email, pelo Microsoft Graph, antes de o segredo do Entra expirar (60, 30, 14, 7, 3 e 1 dias), com ligação, teste e desligar em Gestão, Email e avisos.",
    "Instalação no Unraid: pasta dos dados configurável (EINK_DADOS) e guia para publicar e mudar de endereço.",
  ] },
  { versao: "0.7.0", data: "2026-11-01 21:40", tipo: "novidade", itens: [
    "Grelhas de preenchimento ao estilo do Excel online na pauta e na grelha de cada teste: letras de coluna, caixa de nome, cabeçalhos e primeiras colunas fixos, setas, Enter e Tab, seleção de intervalos, copiar e colar do Excel, Ctrl+D, Delete e Ctrl+Z.",
  ] },
  { versao: "0.6.0", data: "2026-11-01 15:50", tipo: "novidade", itens: [
    "Instalação no Unraid (compose próprio) e no servidor com Docker e Caddy, com scripts de deploy e de preparação de um servidor novo.",
  ] },
  { versao: "0.5.0", data: "2026-11-01 15:38", tipo: "novidade", itens: [
    "Cópia externa das cópias de segurança, aviso do segredo, bancos partilhados por grupo disciplinar, importar notas do Excel e vista do diretor de turma.",
    "Quizzes com imagens e sondagem aberta com nuvem de palavras.",
  ] },
  { versao: "0.4.0", data: "2026-11-01 15:23", tipo: "novidade", itens: [
    "Cópias de segurança, fecho de períodos, registo de alterações, importar alunos, arquivo e retenção, alertas e apreciações das intercalares.",
    "Estatísticas de acesso (só contagens, sem IP).",
  ] },
  { versao: "0.3.0", data: "2026-11-01 14:44", tipo: "novidade", itens: [
    "Avaliações intercalares com menção (Não satisfaz, Satisfaz, Satisfaz bastante) e descritiva, e exportação da pauta para Excel (.xlsx).",
    "Modo escuro com botão (automático, claro, escuro).",
  ] },
  { versao: "0.2.0", data: "2026-11-01 14:18", tipo: "novidade", itens: [
    "Critérios de avaliação por grupo disciplinar e por ano de escolaridade, vários testes por critério e nota final pela média ponderada.",
    "Grelha de cada teste, com questões e cotações, casas decimais da nota final e entrada pelo grupo «docentes» do Entra ID.",
  ] },
  { versao: "0.1.0", data: "2026-11-01 12:23", tipo: "novidade", itens: [
    "Primeira versão: painel, turmas, avaliação por períodos, pauta e ferramentas de sala (mapa de sala, quadros, sondagens e quizzes).",
  ] },
];
