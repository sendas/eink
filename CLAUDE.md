# eink

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
- `public/apreciacao.js`: textos das intercalares por níveis (também usado nos testes). Não há medidor de ruído nem sons de fundo, de propósito.
