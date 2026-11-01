# eink

Plataforma para docentes: ferramentas de sala de aula (como o TeacherStack) e avaliação (testes, períodos, pauta), no estilo do tic.techpro.pt.

- Node 22, sem dependências. Dados em SQLite (`lib/db.js`). `lib/auth.js` é o OIDC com Entra ID copiado do tic.techpro.pt.
- `lib/avaliacao.js`: cálculo puro da pauta (testado em `testes/avaliacao.test.js`). `server.js`: rotas da API, sempre filtradas pelo docente.
- `public/`: interface em JS simples (`app.js` núcleo e avaliação, `ferramentas.js` ferramentas de sala). Sem scripts inline (CSP).
- Português de Portugal, com o Acordo Ortográfico em vigor.
- Testes: `npm test`. Antes de fechar uma alteração, correr também o fumo no navegador se mexeres em `public/`.
