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
4. Entra com o administrador (`ADMIN_USERS`) e, em «Docentes», dá acesso aos colegas pelo email da escola.

Os dados ficam no volume `eink-dados`. Cópia de segurança: `docker compose exec eink wget -qO- localhost:3000/healthz` verifica o serviço;
para copiar a base, `docker run --rm -v eink_eink-dados:/d -v $PWD:/b alpine tar czf /b/dados.tgz -C /d .`.

## Regras importantes

- O domínio da escola inclui alunos. Por isso o domínio, sozinho, **não** dá acesso: só entra quem está em «Docentes».
- Cada docente só vê as suas turmas (todas as consultas filtram por docente; há testes para isso).
- Nota final = média ponderada das avaliações que o aluno já tem (70 %) e comportamento 1 a 5 (30 %). Níveis 1 a 5 pelos limites 20, 50, 70 e 90 %.
