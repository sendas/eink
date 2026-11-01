#!/usr/bin/env bash
# Copia as cópias de segurança da base de dados para FORA do servidor (outro disco, partilha do Unraid, NAS ou nuvem com rclone).
# Uso:   bash scripts/copia-externa.sh <destino> [pasta das cópias]
#   destino local:   /mnt/user/backups/eink          (usa rsync, ou cp se não houver)
#   destino rclone:  onedrive:eink                   (usa rclone; configura antes com «rclone config»)
# Pasta das cópias por defeito: /mnt/user/appdata/eink-dados/copias (Unraid). Noutros sistemas, indica-a.
# Para correr todos os dias: no Unraid, plugin «User Scripts» (diário); numa VPS, cron: 30 3 * * * /caminho/scripts/copia-externa.sh <destino>
set -euo pipefail
DESTINO="${1:?Indica o destino (pasta ou remoto rclone, ex.: onedrive:eink).}"
ORIGEM="${2:-/mnt/user/appdata/eink-dados/copias}"
[ -d "$ORIGEM" ] || { echo "Não encontro a pasta das cópias: $ORIGEM"; exit 1; }
ls "$ORIGEM"/eink-*.db.gz >/dev/null 2>&1 || { echo "Ainda não há cópias em $ORIGEM."; exit 1; }
if [[ "$DESTINO" == *:* ]]; then
  command -v rclone >/dev/null || { echo "Falta o rclone (https://rclone.org)."; exit 1; }
  rclone copy "$ORIGEM" "$DESTINO" --include 'eink-*.db.gz' --min-age 1m
  rclone delete "$DESTINO" --min-age 60d --include 'eink-*.db.gz'   # mantém 60 dias fora do servidor
else
  mkdir -p "$DESTINO"
  if command -v rsync >/dev/null; then rsync -a --include='eink-*.db.gz' --exclude='*' "$ORIGEM"/ "$DESTINO"/; else cp -p "$ORIGEM"/eink-*.db.gz "$DESTINO"/; fi
  find "$DESTINO" -name 'eink-*.db.gz' -mtime +60 -delete
fi
echo "Cópias enviadas para $DESTINO ($(ls "$ORIGEM"/eink-*.db.gz | wc -l) na origem)."
