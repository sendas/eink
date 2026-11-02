# Eça Avalia

Plataforma para docentes: ferramentas de sala de aula (como o TeacherStack) e avaliação (testes, períodos, pauta), no estilo do tic.techpro.pt.

- Node 22, sem dependências. Dados em SQLite (`lib/db.js`). `lib/auth.js` é o OIDC com Entra ID copiado do tic.techpro.pt.
- `lib/avaliacao.js`: cálculo puro da pauta (testado em `testes/avaliacao.test.js`). `server.js`: rotas da API, sempre filtradas pelo docente.
- `public/`: interface em JS simples (`app.js` núcleo e avaliação, `ferramentas.js` ferramentas de sala). Sem scripts inline (CSP).
- Português de Portugal, com o Acordo Ortográfico em vigor.
- Testes: `npm test`. Antes de fechar uma alteração, correr também o fumo no navegador se mexeres em `public/`.

## Módulos (server.js regista-os)

- `lib/m-admin.js`: cópias, fecho de períodos, auditoria, importação de alunos, arquivo e retenção, alertas. `lib/m-ferramentas.js`: mapa, quadros, sondagens.
- `lib/m-quiz.js`, `lib/quiz.js`, `lib/vivo.js`: quizzes e jogo ao vivo (sessões em memória por PIN). `lib/m-publico.js`: páginas sem sessão (`/s/…` e `/j/…`).
- Toda a escrita de notas passa por `abertoOuErro` (período fechado → 423) e `auditar` (registo de alterações). Ao acrescentar uma rota que muda notas, usar os dois.
- `lib/m-notas.js` (importar notas), `lib/m-partilhas.js` (bancos partilhados por grupo disciplinar), `lib/m-dt.js` (diretor de turma), `lib/m-estatisticas.js` (só contagens, sem IP).
- Uma imagem de quiz nunca se lê como `blob:` (a CSP só deixa `'self'` e `data:`); usar FileReader. As cores `.c0` a `.c4` só valem em `.op-publica`, `.pv-op` e `.s-enche` (a nuvem de palavras usa-as para o texto).
- `testes/navegador.test.js` percorre a interface real; ao mudar `public/`, correr `npm test` (ele salta-se sozinho sem Chromium).
- `public/apreciacao.js`: textos das intercalares por níveis (também usado nos testes). Não há medidor de ruído nem sons de fundo, de propósito.

- `public/folha.js` (`EINK.folha(tabela, { aplicar })`): folha ao estilo do Excel online sobre as tabelas da pauta e da grelha (letras de coluna, caixa de nome, cabeçalhos e 2 primeiras colunas fixos, setas/Enter, intervalos com rato e Shift, copiar e colar de blocos do Excel, Ctrl+D, Delete, Ctrl+Z). As alterações chegam em lote a `aplicar`, que usa as rotas de sempre (`PUT .../notas`, `.../grelha/notas`, `.../niveis`), por isso `abertoOuErro` e `auditar` continuam a valer. Cada vista que a use tem de passar `aplicar`.
- Contas: `professores.local`/`senha`/`trocar` (scrypt em `lib/contas.js`, rotas em `lib/m-contas.js`, entrada `POST /auth/local` com limites em `server.js`). Uma conta `x@local` nunca entra pela via Office (`professorDe`) e, com `trocar`, só `/api/eu` e `/api/eu/senha` respondem até mudar a palavra-passe.
- Email: `lib/correio.js` envia por `/me/sendMail` do Graph com o token de renovação cifrado em `config` (`correio`, `correio_avisos`). A ligação usa `/auth/correio/ligar` e volta por `/auth/callback` com o modo `correio` no cookie `oidc` (sem segundo URI no Entra). Avisos a 60/30/14/7/3/1 dias de `CLIENT_SECRET_EXPIRA`.
- Versões: a cada alteração visível, subir `version` no `package.json` e acrescentar a entrada no topo de `lib/versoes.js` (versão, data e hora de Lisboa, tipo, itens). O número aparece no topo (`#versao`) e a lista em `#/versoes`; o teste falha se a primeira entrada não for a versão atual.
