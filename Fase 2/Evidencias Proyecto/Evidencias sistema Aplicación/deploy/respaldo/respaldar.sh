#!/usr/bin/env bash
# Respaldo diario de la base en el VPS (docs/07-despliegue.md). Lo corre cron
# como root: deja un pg_dump comprimido en /srv/vitriauto/respaldos/db y borra los
# de más de RETENCION_DIAS. La copia fuera del VPS la hace traer-respaldos.sh
# desde el servidor de respaldo (pull: el VPS no puede borrar esas copias).
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DESTINO="${DESTINO:-/srv/vitriauto/respaldos/db}"
RETENCION_DIAS="${RETENCION_DIAS:-7}"
GRUPO_LECTOR="${GRUPO_LECTOR:-respaldo}"

# Solo las variables que hacen falta: el .env es para Docker Compose y no
# siempre es válido como script de shell (p. ej. EMAIL_FROM con < >).
leer() { grep -E "^$1=" "$DEPLOY_DIR/.env" | tail -n 1 | cut -d= -f2-; }
POSTGRES_USER="$(leer POSTGRES_USER)"
POSTGRES_DB="$(leer POSTGRES_DB)"

mkdir -p "$DESTINO"
archivo="$DESTINO/vitriauto-$(date +%Y%m%d-%H%M).dump"
temporal="$archivo.parcial"

docker compose -f "$DEPLOY_DIR/compose.yml" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --compress=9 >"$temporal"

# Un dump vacío o cortado no reemplaza a nada: pg_restore debe poder leerlo.
docker compose -f "$DEPLOY_DIR/compose.yml" exec -T postgres pg_restore --list >/dev/null <"$temporal"
mv "$temporal" "$archivo"
chgrp "$GRUPO_LECTOR" "$archivo" 2>/dev/null || true
chmod 640 "$archivo"

find "$DESTINO" -name 'vitriauto-*.dump' -mtime +"$RETENCION_DIAS" -delete
find "$DESTINO" -name '*.parcial' -mmin +60 -delete

# Aviso opcional de éxito (p. ej. healthchecks.io): si no llega, avisa él.
if [[ -n "${RESPALDO_PING_URL:-}" ]]; then curl -fsS -m 10 --retry 3 "$RESPALDO_PING_URL" >/dev/null || true; fi
echo "Respaldo listo: $archivo ($(du -h "$archivo" | cut -f1))"
