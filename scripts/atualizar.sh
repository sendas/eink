#!/usr/bin/env bash
# Atualiza a plataforma para a versão mais recente do GitHub. Faz antes uma cópia de segurança da base de dados.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Cópia de segurança antes de atualizar..."
docker compose exec -T eink node --disable-warning=ExperimentalWarning -e '
const { abrir } = require("./lib/db"); const { criarCopias } = require("./lib/copias");
const db = abrir(process.env.DATA_DIR + "/eink.db"); console.log(criarCopias(db, process.env.DATA_DIR + "/copias").fazer());' || echo "(não foi possível fazer a cópia; continua a atualização)"
git pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
docker compose ps
