#!/usr/bin/env bash
# Prepara um servidor Ubuntu ou Debian NOVO para a eink (e para outros sites em Docker, como o do agrupamento) com HTTPS automático:
#  - instala o Docker, se faltar;
#  - instala o Caddy (o programa que recebe as visitas e trata do cadeado HTTPS), se faltar;
#  - acrescenta o endereço ao ficheiro do Caddy (/etc/caddy/Caddyfile), com cópia de segurança.
# Não mexe na firewall nem noutros sites. Se já houver outro programa nas portas 80 e 443, pára e explica (não instala um segundo).
# Uso:  sudo bash scripts/preparar-servidor.sh sala.queiroz.pt [porta]       (a porta por defeito é a 8093 da eink)
set -euo pipefail

DOMINIO="${1:-}"; PORTA="${2:-8093}"
CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
falha() { echo "ERRO: $*" >&2; exit 1; }

[[ "$DOMINIO" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$ ]] || falha "Indica o endereço, por exemplo:  sudo bash scripts/preparar-servidor.sh sala.queiroz.pt"
[[ "$PORTA" =~ ^[0-9]{2,5}$ ]] || falha "A porta tem de ser um número."
[ -n "${SEM_INSTALAR:-}" ] || [ "$(id -u)" = 0 ] || falha "Corre com sudo."

if [ -z "${SEM_INSTALAR:-}" ]; then
  . /etc/os-release
  case "${ID}" in ubuntu|debian) ;; *) falha "Este script só conhece Ubuntu e Debian (o teu sistema é ${ID}). Instala o Docker e o Caddy à mão e usa o Caddyfile.exemplo." ;; esac

  echo "== Docker"
  if command -v docker >/dev/null 2>&1; then echo "Já instalado: $(docker --version)"; else curl -fsSL https://get.docker.com | sh; fi

  echo "== Caddy"
  if command -v caddy >/dev/null 2>&1; then
    echo "Já instalado: $(caddy version | head -1)"
  else
    # Se as portas 80/443 já estão ocupadas por outra coisa (por exemplo, um Caddy ou nginx dentro de um contentor), não se instala outro Caddy.
    if ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq '[:.](80|443)$'; then
      falha "As portas 80/443 já estão a ser usadas por outro programa (ver: sudo ss -ltnp | grep -E ':(80|443) '). Provavelmente já existe um proxy (Caddy ou nginx, talvez num contentor). Não instalo outro; acrescenta o endereço a esse, com a ajuda do Caddyfile.exemplo."
    fi
    apt-get update -y && apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -y && apt-get install -y caddy
  fi
fi

echo "== Endereço ${DOMINIO} → 127.0.0.1:${PORTA}"
mkdir -p "$(dirname "$CADDYFILE")"; touch "$CADDYFILE"
if grep -Eq "^[[:space:]]*${DOMINIO//./\\.}[[:space:]]*(,|\{)" "$CADDYFILE"; then
  echo "O endereço já existe em ${CADDYFILE}: não se altera."
else
  cp -p "$CADDYFILE" "${CADDYFILE}.antes-eink"
  cat >> "$CADDYFILE" <<BLOCO

${DOMINIO} {
	encode zstd gzip
	header Strict-Transport-Security "max-age=31536000"
	request_body {
		max_size 2MB
	}
	reverse_proxy 127.0.0.1:${PORTA}
}
BLOCO
  if command -v caddy >/dev/null 2>&1 && ! caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1; then
    cp -p "${CADDYFILE}.antes-eink" "$CADDYFILE"
    falha "O Caddyfile ficaria inválido; repus a versão anterior. Vê o erro com:  caddy validate --config ${CADDYFILE}"
  fi
  echo "Bloco acrescentado (cópia do ficheiro antigo: ${CADDYFILE}.antes-eink)."
fi
if [ -z "${SEM_INSTALAR:-}" ]; then systemctl enable --now caddy >/dev/null 2>&1 || true; systemctl reload caddy || systemctl restart caddy; fi

cat <<FIM

Pronto. Falta só:
  1. No DNS, um registo A de ${DOMINIO} para o IP deste servidor (e portas 80/443 abertas, se o fornecedor tiver firewall).
  2. Arrancar a eink (ver LEIA-ME.md):  cd /opt/eink && cp .env.example .env && nano .env && mkdir -p data && chown 1000:1000 data && docker compose up -d --build
O certificado HTTPS é pedido sozinho na primeira visita (pode demorar um minuto).
FIM
