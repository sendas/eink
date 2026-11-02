# Eça Avalia (nome técnico: eink)

Ferramentas de sala de aula e avaliação para docentes (painel de cartões, turmas, períodos, testes, pauta e presenças).
Node 22 sem dependências externas, dados em SQLite (`node:sqlite`), entrada pela conta da escola (Microsoft Entra ID).

## Desenvolvimento

```bash
npm run dev      # http://localhost:3000, entrada de teste sem Microsoft (só em http)
# abrir http://localhost:3000/auth/entrar?dev=admin@escola.pt
npm test
```

## Instalação no Unraid (como o tic.techpro.pt)

Usa o ficheiro `docker-compose.unraid.yml` (sem Caddy: o HTTPS vem do Cloudflare Tunnel ou do proxy que já usas, apontado para a porta **8093** do Unraid).

**Primeira vez** (terminal do Unraid):
```bash
cd /mnt/user/appdata
git clone https://github.com/sendas/eink.git eink     # repositório privado: usa o mesmo token ou chave que já usas nos outros
mkdir -p eink-dados && chown 99:100 eink-dados
cd eink && cp .env.example .env && nano .env           # preenche (ver abaixo)
docker compose -f docker-compose.unraid.yml up -d --build
docker logs eink
```
No `.env` do Unraid põe: `BASE_URL=https://o-teu-dominio`, `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`, `ADMIN_USERS`, `DOMINIOS_PERMITIDOS`, `TRUST_PROXY=1`
(e, se quiseres, `GRUPO_DOCENTES_ID`).

**Atualizar** (de cada vez que houver uma versão nova no GitHub):
```bash
cd /mnt/user/appdata/eink
git pull origin main
docker compose -f docker-compose.unraid.yml up -d --build
docker logs eink
```

## Instalação no servidor (VPS Ubuntu ou Debian)

Uma VPS nova só traz o sistema. A plataforma corre num contentor Docker que só fica acessível dentro do servidor (`127.0.0.1:8093`), e o **Caddy** (o programa que recebe as visitas e trata do cadeado HTTPS)
encaminha o endereço público para lá. Só pode haver um programa nas portas 80 e 443: se o site do agrupamento e o Helpdesk vão para o mesmo servidor, partilham **o mesmo Caddy**,
com um bloco por endereço no `/etc/caddy/Caddyfile` (o do site do agrupamento está no `Caddyfile.exemplo` do repositório dele).

**1. Microsoft Entra ID.** Podes usar o **mesmo registo de aplicação** do site do agrupamento: em Registos de aplicações → o registo → Autenticação → Web → *Adicionar URI*,
acrescenta `https://sala.queiroz.pt/auth/callback` (o endereço que escolheres). Assim usas o mesmo ID do inquilino, o mesmo ID da aplicação e o mesmo segredo. Se preferires um registo à parte, cria-o com esse redirecionamento.
(O «URI de redirecionamento» é só o endereço para onde a Microsoft devolve o utilizador depois do login; não é nada de rede.)

**2. DNS.** Um registo **A** do endereço novo (por exemplo `sala.queiroz.pt`) para o IP da VPS (o mesmo do `www.queiroz.pt`, se for o mesmo servidor). Se o fornecedor da VPS tem firewall no painel, as portas 80 e 443 têm de estar abertas.

**3. No servidor, como root:**
```bash
git clone https://github.com/sendas/eink.git /opt/eink && cd /opt/eink    # repositório privado: com o mesmo token ou chave que usas nos outros
sudo bash scripts/preparar-servidor.sh sala.queiroz.pt                    # instala o Docker e o Caddy se faltarem e regista o endereço
cp .env.example .env && nano .env                                         # BASE_URL, TENANT_ID, CLIENT_ID, CLIENT_SECRET, ADMIN_USERS, DOMINIOS_PERMITIDOS...
mkdir -p data && chown 1000:1000 data && chmod +x deploy.sh scripts/*.sh  # o contentor corre com o utilizador 1000
docker compose up -d --build
docker compose logs -f eink                                               # Ctrl+C para sair
```
O `preparar-servidor.sh` não mexe na firewall nem noutros sites; só acrescenta o bloco do endereço ao Caddyfile (com cópia do anterior) e valida-o antes de recarregar.
Se o servidor **já tiver** um Caddy (ou outro proxy) a usar as portas 80/443, ele pára e explica; nesse caso acrescenta o bloco de `Caddyfile.exemplo` ao proxy existente
(atenção: se esse Caddy corre dentro de um contentor, o `127.0.0.1` não chega aqui; vê o aviso no ficheiro). Para saber: `docker ps --format "table {{.Names}}\t{{.Ports}}"`.

**4. Primeira entrada** com um administrador (`ADMIN_USERS`). Em «Gestão → Critérios» define os critérios de cada disciplina e ano, e em «Docentes» atribui a disciplina a cada docente.

**Atualizar** (de cada vez que houver uma versão nova no GitHub):
```bash
cd /opt/eink && ./deploy.sh
```
O `deploy.sh` faz uma cópia de segurança, faz `git pull`, reconstrói o contentor e confirma que responde. Não mexe no `.env` nem nos dados (`./data`).

### Cópias de segurança e reposição

A plataforma copia a base de dados todos os dias para `data/copias/` (`data/eink.db`) e guarda as 14 mais recentes. Como estão na mesma VPS, descarrega uma de vez em quando
(Gestão, Cópias de segurança) e guarda-a noutro sítio, por exemplo no OneDrive da escola. Para repor uma cópia:

```bash
docker compose stop eink
gunzip -c data/copias/eink-AAAA-MM-DD-HHMMSS.db.gz > data/eink.db
rm -f data/eink.db-wal data/eink.db-shm
sudo chown 1000:1000 data/eink.db
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
- Também há: importar notas do Excel (colar ou ficheiro, com pré-visualização), grelhas e quizzes partilhados entre docentes do mesmo grupo disciplinar,
  diretores de turma (veem a pauta de todas as disciplinas da turma, só leitura), quizzes com imagens, sondagem aberta com nuvem de palavras e estatísticas de acesso.
- `scripts/copia-externa.sh <destino>` copia as cópias de segurança para fora do servidor (pasta/partilha ou nuvem com rclone).
- `CLIENT_SECRET_EXPIRA=aaaa-mm-dd` no `.env` faz a plataforma avisar os administradores 60 dias antes de o segredo do Entra expirar.
- `npm test` corre os testes de API e, se houver Playwright e Chromium, um teste no navegador que percorre os ecrãs principais.
- A pauta descarrega-se em Excel (.xlsx, com as intercalares em folhas à parte) ou em CSV.
