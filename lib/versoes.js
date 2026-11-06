"use strict";
// Histórico de versões (mais recente primeiro). A cada versão nova: subir "version" no package.json e acrescentar a entrada no topo.
// `data` é a data e a hora (hora de Lisboa) em que a versão foi publicada. Tipos: novidade, melhoria, correção.
module.exports = [
  { versao: "0.25.0", data: "2026-11-06 13:00", tipo: "melhoria", itens: [
    "Enviar um modelo a colegas: ao escrever um nome, aparecem todos os docentes da escola, mesmo os que ainda não entraram na plataforma (ficam marcados «ainda não entrou» e recebem o modelo no primeiro início de sessão).",
    "Gestão, Docentes, «Lista de docentes da escola»: o administrador importa os membros do grupo do Entra (CSV, Excel ou texto colado), vê primeiro o que vai ser importado e pode apagar a lista quando quiser. Só guarda nome e email institucional.",
  ] },
  { versao: "0.24.0", data: "2026-11-06 11:30", tipo: "melhoria", itens: [
    "Página de entrada: cartão com «Instruções de acesso» (usa as mesmas credenciais do email institucional), botão grande «Entrar com email ou conta da escola» com o logótipo da Microsoft e a nota «Autenticação segura via Microsoft Entra ID». A entrada com utilizador e palavra-passe continua a funcionar, mas fica minimizada em «Sem conta Office da escola?».",
    "Grelha de um teste: copiar de outro teste, modelos e partilhar (com o grupo ou com colegas) passaram para um painel próprio, «Reutilizar e partilhar», fora de «Questões e cotações».",
    "As minhas turmas: a página diz que se escolhe o período para abrir a pauta, cada cartão tem «Abrir a pauta de:» e botões com seta, e tocar no cartão abre o período atual.",
    "Telemóvel: o cabeçalho deixou de sair do ecrã (todas as páginas ficavam mais largas do que o telemóvel), tabelas largas deslizam dentro da página, as listas de docentes e de critérios empilham-se, os botões do menu têm 44 px e o botão de sugestões passa a ser um círculo pequeno.",
  ] },
  { versao: "0.23.1", data: "2026-11-05 13:20", tipo: "correção", itens: [
    "Enviar um modelo de grelha: o campo «Para» só sugeria colegas que já tinham entrado na plataforma, por isso muitas vezes não aparecia ninguém. Agora podes escrever o email completo de um colega que ainda não entrou: o modelo fica à espera e chega-lhe quando entrar pela primeira vez. A mensagem diz-te quando ainda não há outros docentes registados.",
  ] },
  { versao: "0.23.0", data: "2026-11-05 11:40", tipo: "novidade", itens: [
    "Ao enviar um modelo de grelha, o campo «Para» sugere os colegas enquanto escreves as primeiras letras do nome ou do email, como no Outlook: escolhes com as setas e Enter ou Tab, ou com o clique, cada colega fica numa etiqueta que se retira com × ou Backspace, e podes colar uma lista de emails. No aviso do email das sugestões, em Gestão, o endereço também sugere os docentes.",
    "Aviso de versão nova: quando a plataforma é atualizada com a página aberta, aparece uma faixa com o que há de novo e o botão «Atualizar agora» (ou «Mais tarde»). Depois de atualizar, mostra-se uma vez o que mudou.",
    "Mais clareza sobre quem vê os dados: a página de entrada, o aviso de privacidade e o rodapé explicam que cada docente só vê as suas turmas, que os alunos não têm conta, que o acesso técnico é só dos administradores indicados pela escola e que os dados não são vendidos nem partilhados com terceiros.",
  ] },
  { versao: "0.22.0", data: "2026-11-05 09:30", tipo: "novidade", itens: [
    "Grelha de cada teste: a cotação de cada questão escreve-se por baixo do nome da questão, com a percentagem do teste. Por cima da tabela aparece a soma das cotações (100 % ✓, «Faltam X para 100» ou «Passa 100 em X») e os botões «Fazer somar 100» e «Dividir por igual», que ajustam as pontuações já lançadas na mesma proporção.",
    "Modelos de grelha: guarda a estrutura de um teste como modelo, usa-o noutros testes e turmas e envia-o a colegas dentro da plataforma (página «Modelos»). O colega recebe uma cópia, vê-a como «recebida de…» e pode usá-la ou apagá-la sem afetar o original. Os modelos não levam notas nem alunos.",
    "Alunos por nível mais legível: segmentos mais altos, números maiores e com contraste, e legenda com o número e o nome de cada nível.",
    "O cabeçalho cabe numa só linha em ecrãs médios, com a etiqueta beta mais curta.",
  ] },
  { versao: "0.21.0", data: "2026-11-03 23:10", tipo: "novidade", itens: [
    "Cada sugestão enviada por um docente gera um email para o endereço definido pelo administrador (por defeito, pedropereira@queiroz.pt). O endereço muda-se em Gestão, Sugestões dos docentes, e cada sugestão mostra se o email seguiu. O envio usa a conta ligada em Email e avisos.",
    "Novo registo de acessos dos docentes (Gestão, Acessos dos docentes): endereço IP, navegador, sistema, tipo de aparelho (móvel, tablet ou computador) e tamanho do ecrã, com filtros, CSV e prazo de conservação (por defeito 180 dias). O aviso de privacidade foi atualizado.",
    "A indicação «Versão beta · em testes» fica sempre visível no cabeçalho, também na página de entrada, e encurta-se em ecrãs estreitos.",
  ] },
  { versao: "0.20.2", data: "2026-11-03 22:10", tipo: "melhoria", itens: [
    "A grelha de cada teste (pontuação por questão) tem agora o mesmo aspeto calmo da pauta e as cores dos níveis: cada pontuação ganha a cor do nível pela fração da cotação da questão, e o total e a percentagem de cada aluno mostram o nível e o seu nome (Muito insuficiente a Muito bom).",
  ] },
  { versao: "0.20.1", data: "2026-11-03 21:30", tipo: "melhoria", itens: [
    "Pauta mais calma e legível: fundos neutros, linhas mais finas, cabeçalhos sem cores fortes, nome e fotografia do aluno na mesma linha e botões do topo mais discretos.",
    "Cada teste e a média de cada critério ganham a cor do nível e a avaliação qualitativa por baixo do valor (Muito insuficiente, Insuficiente, Suficiente, Bom, Muito bom). O nível e a menção da nota final usam as mesmas cores, e o nível 5 passa a um verde suave.",
  ] },
  { versao: "0.20.0", data: "2026-11-03 20:10", tipo: "melhoria", itens: [
    "Nova identidade visual, em linha com o Agrupamento: logótipo de cinco barras (a última em laranja), verde do agrupamento, títulos em Fraunces e texto em Public Sans, botões em pílula e a régua dos cinco níveis por baixo do cabeçalho.",
    "Página de entrada refeita segundo o desenho: apresentação, cinco passos, como se calcula a nota, ferramentas de sala e proteção de dados. O tema escuro usa a versão escura da mesma paleta.",
    "Novos ícone do separador, ícone da aplicação e imagem de partilha.",
  ] },
  { versao: "0.19.0", data: "2026-11-03 18:30", tipo: "novidade", itens: [
    "Sugestões: cada docente pode enviar uma sugestão, a qualquer momento, pelo botão «Sugestões» sempre visível no canto do ecrã ou pela faixa do topo. Os administradores leem-nas, e marcam-nas como lidas ou feitas, em Gestão, Sugestões dos docentes.",
    "A plataforma assinala em todas as páginas que está em «Versão beta · em testes», incluindo a página de entrada.",
  ] },
  { versao: "0.18.10", data: "2026-11-03 17:40", tipo: "correção", itens: [
    "Grupo de docentes do Entra: quando o Microsoft Graph recusa a verificação (código 403), tenta-se uma segunda via (checkMemberGroups, só precisa de User.Read) e aceita-se a reivindicação «groups» do id_token, se estiver configurada no Entra.",
    "Se o grupo não puder ser verificado, os administradores continuam a entrar e a mensagem diz o que se passa, em vez de bloquear tudo.",
  ] },
  { versao: "0.18.9", data: "2026-11-03 16:50", tipo: "melhoria", itens: [
    "Quem tenta entrar e não é reconhecido como docente aparece em Gestão, Docentes, com o que o Microsoft 365 diz dessa conta (nome, cargo, departamento) e um botão «Dar acesso».",
    "O reconhecimento automático passou a aceitar também «Professor», «Professora», «Educador» e «Educadora» no nome, cargo ou departamento.",
  ] },
  { versao: "0.18.8", data: "2026-11-03 16:10", tipo: "melhoria", itens: [
    "Os docentes entram sozinhos, sem ninguém os acrescentar: se o Microsoft 365 identifica a conta como docente (por exemplo «Docente-550 - Informática» no nome, cargo ou departamento) e o domínio é o da escola, a conta é criada no primeiro acesso. Os alunos e outras contas continuam sem acesso.",
    "Quem um administrador retirar continua retirado. Quem prefere controlar por grupo do Entra pode continuar a usar GRUPO_DOCENTES_ID.",
  ] },
  { versao: "0.18.7", data: "2026-11-03 15:20", tipo: "correção", itens: [
    "Corrigido: a pauta não abria quando já havia comportamento lançado em nível (a página ficava na página inicial, sem aviso). Passou a abrir normalmente.",
    "Quando uma página falha por erro do programa, aparece agora um aviso em vez de ficar parada sem explicação.",
  ] },
  { versao: "0.18.6", data: "2026-11-03 14:40", tipo: "melhoria", itens: [
    "Nova opção «Automático» na escala do comportamento: um inteiro de 1 a 5 é um nível e qualquer outro valor (ou escrito com %) é uma percentagem de 0 a 100. Para lançar 4 %, escreve «4 %».",
    "Na escala automática, as células em percentagem aparecem a negrito e a cor, com o «%» visível, para se ver onde se misturam as duas escalas. «1 a 5» e «0 a 100 %» continuam disponíveis e são as mais seguras.",
  ] },
  { versao: "0.18.5", data: "2026-11-03 14:00", tipo: "melhoria", itens: [
    "Cada docente escolhe a escala do comportamento: «1 a 5» (níveis) ou «0 a 100 %» (percentagem). O botão está por cima da pauta e a escolha fica guardada para as tuas turmas.",
    "Na escala 1 a 5 só se aceitam inteiros de 1 a 5; na escala 0 a 100, «3» vale 3 %. Os valores já lançados mantêm-se e mudar de escala não os apaga.",
  ] },
  { versao: "0.18.4", data: "2026-11-03 13:10", tipo: "melhoria", itens: [
    "O comportamento pode ser lançado em percentagem (0 a 100 %): escreve «85», «72,5 %» ou, como antes, um nível de 1 a 5. Um número de 1 a 5 sem % é um nível; com % ou acima de 5 é percentagem. Entra no cálculo da nota final tal como escreveste e fica no histórico de alterações.",
    "Os valores das tabelas estilo Excel (pauta e grelha) ficam centrados, incluindo os cabeçalhos.",
  ] },
  { versao: "0.18.3", data: "2026-11-03 12:05", tipo: "correção", itens: [
    "Critérios no telemóvel: a barra dos pesos já não sai do ecrã com muitos critérios, a janela «Ver na totalidade» deixa de deslizar para o lado e a tabela passa a cartões legíveis.",
    "Os anos com critérios iguais aparecem juntos (por exemplo, 1.º a 4.º ano), e a legenda mostra o peso de cada critério. Sem turmas, vês os critérios de todos os anos da disciplina.",
  ] },
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
