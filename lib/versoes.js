"use strict";
// Histórico de versões (mais recente primeiro). A cada versão nova: subir "version" no package.json e acrescentar a entrada no topo.
// `data` é a data e a hora (hora de Lisboa) em que a versão foi publicada. Tipos: novidade, melhoria, correção.
module.exports = [
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
