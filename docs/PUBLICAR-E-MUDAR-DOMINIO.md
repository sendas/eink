# Publicar no Unraid e mudar de endereço

Endereço de arranque: `https://avaliar.techpro.pt`. Endereço final previsto: um subdomínio de `queiroz.pt` (escolher o nome, por exemplo `avaliar.queiroz.pt`).
Os dados ficam em `/mnt/user/appdata/eink-dados` e não dependem do endereço, por isso mudar de endereço não apaga nada.

## 1. Publicar no Unraid (terminal)

```bash
cd /mnt/user/appdata
git clone https://github.com/sendas/eink.git && cd eink
cp .env.example .env && nano .env
docker compose -f docker-compose.unraid.yml up -d --build
docker logs eink
```

No `.env`: `BASE_URL=https://avaliar.techpro.pt` (https, sem barra no fim), `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`, `CLIENT_SECRET_EXPIRA`, `GRUPO_DOCENTES_ID`, `ADMIN_USERS`, `DOMINIOS_PERMITIDOS=queiroz.pt`, `TRUST_PROXY=1`.
Teste local antes do Cloudflare: `curl -I http://IP-DO-UNRAID:8093/`.

## 2. Cloudflare (Zero Trust, Tunnel que já usas para o tic.techpro.pt)

1. Zero Trust → Networks → Tunnels → o túnel existente → Public Hostname → Add.
2. Subdomain `avaliar`, Domain `techpro.pt`, Path vazio.
3. Service: Type `HTTP`, URL `IP-DO-UNRAID:8093`. Se o `cloudflared` corre num contentor, usa o IP do Unraid (não `localhost`).
4. O registo DNS (CNAME, com proxy laranja) é criado sozinho. Não o crees à mão.
5. Não ponhas Cloudflare Access (login) neste endereço: as páginas dos alunos (`/s/…` sondagens, `/j/…` e `/jogar` quizzes) têm de abrir sem conta.
6. SSL/TLS em «Full» ou «Flexible» serve, porque o túnel já é cifrado e a origem é HTTP. Não é preciso mexer em cache nem criar regras.

## 3. Microsoft Entra ID

Registo de aplicações → a aplicação do eink → Autenticação → Web → Adicionar URI de redirecionamento:
`https://avaliar.techpro.pt/auth/callback` (exatamente assim). Sem isto o login dá erro de URI.

## 4. Mudar para queiroz.pt (quando for altura)

Pré-requisito: o domínio `queiroz.pt` tem de estar na mesma conta Cloudflare do túnel. Se o DNS dele estiver noutro sítio, cria o CNAME `<nome>` para `<id-do-túnel>.cfargotunnel.com` no DNS de lá (sem a possibilidade de proxy do Cloudflare, o túnel só funciona com a zona na Cloudflare; confirmar com quem gere o domínio).

1. Cloudflare: no mesmo túnel, novo Public Hostname `<nome>.queiroz.pt` para `IP-DO-UNRAID:8093`. Mantém o antigo.
2. Entra: acrescenta o segundo URI `https://<nome>.queiroz.pt/auth/callback`. Mantém o antigo até acabar.
3. Unraid: `nano .env` e muda `BASE_URL=https://<nome>.queiroz.pt`; depois
   `docker compose -f docker-compose.unraid.yml up -d --build`
4. Testa o login no endereço novo.
5. Cloudflare → techpro.pt → Rules → Redirect Rules: de `avaliar.techpro.pt/*` para `https://<nome>.queiroz.pt/${1}` (301, manter query string). Assim os links e QR codes de sondagens e quizzes já distribuídos continuam a funcionar. Depois remove o Public Hostname antigo do túnel e o URI antigo do Entra.

Efeitos: todos os docentes têm de entrar de novo (os cookies são por endereço). Os alunos não são afetados. Os administradores `ADMIN_USERS` e o grupo de docentes não mudam.

## 5. Contas locais e avisos por email

**Contas locais** (para docentes sem conta Office): Gestão, Docentes, «Criar conta local». A palavra-passe gerada só se vê uma vez e o docente muda-a na primeira entrada (mínimo 10 caracteres). Entram em «Entrar com utilizador e palavra-passe» na página de entrada. Há limite de tentativas por IP e por utilizador. Uma conta local não se abre pelo botão Office, nem o contrário.

**Aviso de expiração do segredo por email** (Microsoft Graph). Uma só vez:
1. Entra, a aplicação, Permissões de API, Adicionar uma permissão, Microsoft Graph, **Permissões delegadas**: `Mail.Send` e `offline_access`. Se a escola exigir, «Conceder consentimento de administrador».
2. No `.env`: `CLIENT_SECRET_EXPIRA=aaaa-mm-dd` (a data da coluna «Expira» do segredo).
3. Na plataforma: Gestão, **Email e avisos**, «Ligar o envio de email» (entra com a conta de administrador de onde sairão os emails), depois «Enviar email de teste».

A verificação corre ao arrancar e de 6 em 6 horas; envia um aviso quando faltam 60, 30, 14, 7, 3 e 1 dias, aos administradores com conta Office e à conta ligada. Quando renovares o segredo e mudares `CLIENT_SECRET_EXPIRA`, recomeça. Se o segredo expirar, o envio deixa de funcionar (a renovação do token usa o mesmo segredo), por isso os avisos são antes. `CORREIO=0` desliga a verificação automática.
