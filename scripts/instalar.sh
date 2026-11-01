#!/usr/bin/env bash
# Instalação do eink numa VPS Ubuntu 24 ou Debian 12/13 (como root): Docker, firewall, ficheiro .env e arranque.
# Uso: sudo bash scripts/instalar.sh   (a partir da pasta do repositório)
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "Corre este script como root (sudo bash scripts/instalar.sh)."; exit 1; }
cd "$(dirname "$0")/.."

echo "== 1/5 Docker"
if ! command -v docker >/dev/null 2>&1; then
  apt-get update -y && apt-get install -y ca-certificates curl gnupg
  . /etc/os-release
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -y && apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
else
  echo "Docker já instalado."
fi

echo "== 2/5 Firewall e atualizações automáticas de segurança"
apt-get install -y ufw unattended-upgrades >/dev/null
ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
echo "Portas abertas: SSH, 80 e 443. A aplicação em si não fica exposta (só o Caddy)."

echo "== 3/5 Configuração (.env)"
if [ -f .env ]; then
  echo "Já existe um .env: não é alterado."
else
  perguntar() { local msg="$1" def="${2:-}" r; read -r -p "$msg${def:+ [$def]}: " r; echo "${r:-$def}"; }
  DOMINIO=$(perguntar "Domínio da plataforma (sem https://)" "sala.techpro.pt")
  TENANT_ID=$(perguntar "ID do diretório (tenant) do Entra ID")
  CLIENT_ID=$(perguntar "ID da aplicação (cliente) registada no Entra")
  read -rs -p "Segredo do cliente (não aparece no ecrã): " CLIENT_SECRET; echo
  ADMIN_USERS=$(perguntar "Administradores (emails separados por vírgulas)")
  GRUPO=$(perguntar "ID do objeto do grupo «docentes» do Entra (vazio = adicionar docentes à mão)" "")
  DOMS=$(perguntar "Domínio(s) de email permitidos" "${ADMIN_USERS#*@}")
  umask 077
  cat > .env <<ENV
DOMINIO=${DOMINIO}
BASE_URL=https://${DOMINIO}
TENANT_ID=${TENANT_ID}
CLIENT_ID=${CLIENT_ID}
CLIENT_SECRET=${CLIENT_SECRET}
ADMIN_USERS=${ADMIN_USERS}
DOMINIOS_PERMITIDOS=${DOMS%%,*}
GRUPO_DOCENTES_ID=${GRUPO}
GRUPO_ADMIN_ID=
SESSAO_HORAS=8
OIDC_PROMPT=select_account
TZ=Europe/Lisbon
TRUST_PROXY=1
ENV
  chmod 600 .env
  echo ".env criado (só o root o lê)."
fi

echo "== 4/5 Verificar o domínio"
DOM=$(grep '^DOMINIO=' .env | cut -d= -f2)
IP_VPS=$(curl -fsS https://api.ipify.org 2>/dev/null || true)
IP_DNS=$(getent hosts "$DOM" | awk '{print $1; exit}' || true)
if [ -n "$IP_VPS" ] && [ "$IP_VPS" != "$IP_DNS" ]; then
  echo "AVISO: $DOM aponta para '${IP_DNS:-nada}', mas esta VPS é $IP_VPS. Cria o registo A no DNS, senão o certificado HTTPS não é emitido."
fi

echo "== 5/5 Arrancar"
docker compose up -d --build
echo "A aguardar que a aplicação fique saudável..."
for i in $(seq 1 30); do
  estado=$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q eink)" 2>/dev/null || echo starting)
  [ "$estado" = healthy ] && break
  sleep 2
done
echo "Estado: $estado"
[ "$estado" = healthy ] || { echo "Não ficou saudável. Vê o motivo com: docker compose logs eink"; exit 1; }
echo "Pronto: https://$DOM (o certificado HTTPS pode demorar um minuto na primeira vez)."
