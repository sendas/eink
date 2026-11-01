# eink

Ferramentas de sala de aula e avaliação para docentes (painel de cartões, turmas, períodos, testes, pauta e presenças).
Node 22 sem dependências externas, dados em SQLite (`node:sqlite`), entrada pela conta da escola (Microsoft Entra ID).

## Desenvolvimento

```bash
npm run dev      # http://localhost:3000, entrada de teste sem Microsoft (só em http)
# abrir http://localhost:3000/auth/entrar?dev=admin@escola.pt
npm test
```

## Instalação na VPS (Ubuntu 24 ou Debian 12/13)

**1. Registar a aplicação no Microsoft Entra ID** (portal.azure.com → Microsoft Entra ID → Registos de aplicações → Novo registo)
- Nome: eink. Tipos de conta: «apenas neste diretório». URI de redirecionamento: tipo **Web**, `https://<domínio>/auth/callback`.
- Copia o **ID da aplicação (cliente)** e o **ID do diretório (inquilino)**.
- Certificados e segredos → Novo segredo do cliente: copia o **valor** (só aparece uma vez) e anota a data de validade; quando expirar, ninguém consegue entrar.
- Permissões de API: basta a delegada `User.Read` (vem por defeito). Não é preciso consentimento de administrador.
- Se vais usar o grupo «docentes»: Entra ID → Grupos → o grupo → copia o **ID do objeto**.

**2. DNS:** cria um registo **A** do domínio (por exemplo `sala.techpro.pt`) para o IPv4 da VPS.

**3. Na VPS, como root:**
```bash
git clone https://github.com/sendas/eink && cd eink
sudo bash scripts/instalar.sh
```
O script instala o Docker, ativa a firewall (SSH, 80 e 443) e as atualizações automáticas de segurança, pergunta os dados do passo 1, cria o `.env` (só o root o lê),
verifica se o DNS aponta para a VPS e arranca tudo. O certificado HTTPS é pedido sozinho pelo Caddy. Se faltar alguma configuração, a aplicação não arranca e diz o que falta
(`docker compose logs eink`).

**4. Primeira entrada:** abre `https://<domínio>` com um administrador (`ADMIN_USERS`). Em «Gestão → Critérios» define os critérios de cada disciplina e ano,
e em «Docentes» atribui a disciplina a cada docente.

**Atualizar:** `sudo bash scripts/atualizar.sh` (faz uma cópia de segurança, puxa a versão nova do GitHub e reconstrói).
O repositório é privado: na VPS, usa uma chave de implementação (deploy key) só de leitura ou um token do GitHub.

**Configuração manual:** copia `.env.example` para `.env`, preenche e corre `docker compose up -d --build`.

### Cópias de segurança e reposição

A plataforma copia a base de dados todos os dias para `copias/` (no volume de dados, `eink.db`) e guarda as 14 mais recentes. Como estão na mesma VPS, descarrega uma de vez em quando
(Gestão, Cópias de segurança) e guarda-a noutro sítio, por exemplo no OneDrive da escola. Para repor uma cópia:

```bash
docker compose stop eink
docker run --rm -v eink_eink-dados:/d -v $PWD:/b alpine sh -c 'gunzip -c /b/eink-AAAA-MM-DD-HHMMSS.db.gz > /d/eink.db && rm -f /d/eink.db-wal /d/eink.db-shm'
docker compose start eink
```

## Regras importantes

- O domínio da escola inclui alunos. Por isso o domínio, sozinho, **não** dá acesso: só entra quem pertence ao grupo de docentes (ou foi adicionado em «Docentes», sem grupo configurado).
- Cada docente só vê as suas turmas (todas as consultas filtram por docente; há testes para isso).
- Nota final = média ponderada dos critérios da disciplina e do ano da turma (definidos pelo administrador; sem esquema do ano, vale o de «todos os anos»). Dentro de cada critério de testes, os docentes lançam
  quantos testes quiserem, cada um com o seu peso. Cada teste pode ter uma grelha (questões e cotações) onde se lança a pontuação de cada aluno.
  Níveis 1 a 5 pelos limites 20, 50, 70 e 90 %.
- Avaliações intercalares (1.ª e 2.ª de cada período): menção qualitativa (Não satisfaz, Satisfaz, Satisfaz bastante), proposta pela nota, e descritiva por aluno.
- Gestão (administradores): fecho de períodos (bloqueia notas depois do conselho de turma), registo de alterações (quem mudou o quê), cópias de segurança e privacidade/retenção.
- Ferramentas de sala: temporizador, sorteio, chamada, listas, sondagem com código, mapa de sala, quadros e quizzes ao vivo (estilo Kahoot, com modelos do tic.techpro.pt).
  Os alunos entram nas sondagens (`/s/CÓDIGO`) e nos quizzes (`/j/CÓDIGO` ou `/jogar`) sem conta, só com um código e, nos quizzes, uma alcunha.
- A pauta descarrega-se em Excel (.xlsx, com as intercalares em folhas à parte) ou em CSV.
