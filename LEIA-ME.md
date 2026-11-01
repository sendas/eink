# eink

Ferramentas de sala de aula e avaliação para docentes (painel de cartões, turmas, períodos, testes, pauta e presenças).
Node 22 sem dependências externas, dados em SQLite (`node:sqlite`), entrada pela conta da escola (Microsoft Entra ID).

## Desenvolvimento

```bash
npm run dev      # http://localhost:3000, entrada de teste sem Microsoft (só em http)
# abrir http://localhost:3000/auth/entrar?dev=admin@escola.pt
npm test
```

## Instalação na VPS (Ubuntu 24 ou Debian 12/13, Docker)

1. **Entra ID:** em Microsoft Entra → Registos de aplicações → Nova. Tipo «Web», endereço de redirecionamento
   `https://<domínio>/auth/callback`. Copia o ID do diretório (`TENANT_ID`), o ID da aplicação (`CLIENT_ID`) e cria um segredo (`CLIENT_SECRET`).
2. **DNS:** registo A do domínio para o IPv4 da VPS.
3. **Servidor:**
   ```bash
   git clone https://github.com/sendas/eink && cd eink
   cp .env.example .env && nano .env
   docker compose up -d --build
   ```
4. **Docentes:** põe em `GRUPO_DOCENTES_ID` o ID do objeto do grupo «docentes» do Entra ID (Entra → Grupos → o grupo → ID do objeto).
   Quem pertence ao grupo entra sozinho; quem sai do grupo deixa de poder entrar no acesso seguinte (a sessão dura `SESSAO_HORAS`).
   Só conta a pertença direta (como no helpdesk-escolar). Sem a variável, o administrador adiciona os docentes pelo email, em «Docentes».
5. Entra com o administrador (`ADMIN_USERS`, ou o grupo `GRUPO_ADMIN_ID`). Em «Critérios», define para cada grupo disciplinar os critérios e os pesos (somam 100 %)
   e as casas decimais da nota final (1 ou 2); em «Docentes», atribui o grupo disciplinar a cada docente.

Os dados ficam no volume `eink-dados`. Cópia de segurança: `docker compose exec eink wget -qO- localhost:3000/healthz` verifica o serviço;
para copiar a base, `docker run --rm -v eink_eink-dados:/d -v $PWD:/b alpine tar czf /b/dados.tgz -C /d .`.

## Regras importantes

- O domínio da escola inclui alunos. Por isso o domínio, sozinho, **não** dá acesso: só entra quem pertence ao grupo de docentes (ou foi adicionado em «Docentes», sem grupo configurado).
- Cada docente só vê as suas turmas (todas as consultas filtram por docente; há testes para isso).
- Nota final = média ponderada dos critérios da disciplina e do ano da turma (definidos pelo administrador; sem esquema do ano, vale o de «todos os anos»). Dentro de cada critério de testes, os docentes lançam
  quantos testes quiserem, cada um com o seu peso. Cada teste pode ter uma grelha (questões e cotações) onde se lança a pontuação de cada aluno.
  Níveis 1 a 5 pelos limites 20, 50, 70 e 90 %.
- Avaliações intercalares (1.ª e 2.ª de cada período): menção qualitativa (Não satisfaz, Satisfaz, Satisfaz bastante), proposta pela nota, e descritiva por aluno.
- A pauta descarrega-se em Excel (.xlsx, com as intercalares em folhas à parte) ou em CSV.
