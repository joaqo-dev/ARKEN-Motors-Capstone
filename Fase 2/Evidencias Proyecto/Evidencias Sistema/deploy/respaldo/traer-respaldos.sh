#!/usr/bin/env bash
# Corre en el servidor de respaldo, no en el VPS. Trae por SSH, con una llave
# de solo lectura:
#   - los dumps diarios de la base (guarda RETENCION_DIAS; el VPS solo 7);
#   - los archivos subidos, como instantánea diaria con enlaces duros (lo que no
#     cambió no ocupa espacio de nuevo).
# La conexión sale desde aquí, así que no hay que abrir puertos en esta red.
set -euo pipefail

VPS="${VPS:?Falta VPS, p. ej. respaldo@203.0.113.10}"
PUERTO="${PUERTO:-22}"
LLAVE="${LLAVE:-$HOME/.ssh/vitriauto_respaldo}"
DESTINO="${DESTINO:-/srv/respaldos/vitriauto}"
RETENCION_DIAS="${RETENCION_DIAS:-30}"

ssh_cmd="ssh -p $PUERTO -i $LLAVE -o BatchMode=yes -o StrictHostKeyChecking=yes"
hoy="$(date +%F)"
mkdir -p "$DESTINO/db" "$DESTINO/uploads"

# 1. Base. Sin --delete: lo que el VPS rotó sigue aquí.
rsync -a --timeout=600 -e "$ssh_cmd" "$VPS:respaldos/db/" "$DESTINO/db/"

# 2. Archivos subidos: instantánea de hoy enlazada a la anterior.
anterior="$(find "$DESTINO/uploads" -mindepth 1 -maxdepth 1 -type d -name '20??-??-??' | sort | tail -n 1)"
enlace=()
if [[ -n "$anterior" && "$anterior" != "$DESTINO/uploads/$hoy" ]]; then enlace=(--link-dest="$anterior"); fi
rsync -a --delete --timeout=600 "${enlace[@]}" -e "$ssh_cmd" \
  "$VPS:uploads/" "$DESTINO/uploads/$hoy.parcial/"
rm -rf "$DESTINO/uploads/$hoy"
mv "$DESTINO/uploads/$hoy.parcial" "$DESTINO/uploads/$hoy"

# 3. El último dump debe poder leerse (pg_restore vía Docker, sin instalar Postgres).
ultimo="$(find "$DESTINO/db" -name 'vitriauto-*.dump' | sort | tail -n 1)"
[[ -n "$ultimo" ]] || { echo "No hay dumps de la base" >&2; exit 1; }
docker run --rm -i postgres:16-alpine pg_restore --list >/dev/null <"$ultimo"

# 4. Retención.
find "$DESTINO/db" -name 'vitriauto-*.dump' -mtime +"$RETENCION_DIAS" -delete
find "$DESTINO/uploads" -mindepth 1 -maxdepth 1 -type d -name '20??-??-??' | sort |
  head -n "-$RETENCION_DIAS" | xargs -r rm -rf

if [[ -n "${RESPALDO_PING_URL:-}" ]]; then curl -fsS -m 10 --retry 3 "$RESPALDO_PING_URL" >/dev/null || true; fi
echo "Respaldo traído: $(basename "$ultimo") y archivos al $hoy"
