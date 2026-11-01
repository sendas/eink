#!/usr/bin/env bash
# Atualiza a plataforma no servidor: cópia de segurança, código novo do GitHub, reconstrução do contentor e verificação.
# Uso (na pasta do projeto, no servidor):  ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

[ -f .env ] || { echo "Falta o ficheiro .env. Copie o .env.example e preencha-o." >&2; exit 1; }

echo "» Cópia de segurança antes de atualizar"
if docker compose ps --status running --services 2>/dev/null | grep -q '^eink$'; then
  docker compose exec -T eink node --disable-warning=ExperimentalWarning -e '
const { abrir } = require("./lib/db"); const { criarCopias } = require("./lib/copias");
const db = abrir(process.env.DATA_DIR + "/eink.db"); console.log("  " + criarCopias(db, process.env.DATA_DIR + "/copias").fazer());' || echo "  (não foi possível fazer a cópia; a atualização continua)"
else
  echo "  (o contentor não está a correr: nada a copiar)"
fi

echo "» A ir buscar o código mais recente"
git pull --ff-only

echo "» A reconstruir e reiniciar"
docker compose up -d --build

echo "» A confirmar que a plataforma responde"
PORTA=$(grep -E '^PORTA=' .env | cut -d= -f2 || true)
PORTA=${PORTA:-8093}
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORTA}/healthz" > /dev/null; then
    echo "✓ Atualizado e a funcionar."
    docker image prune -f > /dev/null
    exit 0
  fi
  sleep 2
done
echo "Não respondeu. Veja os registos com: docker compose logs --tail=100 eink" >&2
exit 1
