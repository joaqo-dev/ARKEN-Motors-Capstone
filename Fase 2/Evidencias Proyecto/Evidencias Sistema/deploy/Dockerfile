# syntax=docker/dockerfile:1.7
# Imágenes de producción del monorepo (contexto: la raíz del repo). Un solo
# Dockerfile con un target por servicio de deploy/compose.yml:
#   migrar       aplica las migraciones (node-pg-migrate) y termina
#   api          NestJS
#   web-publico  Next.js (marketplace + vitrinas), build standalone
#   caddy        proxy HTTPS con el plugin DNS de Cloudflare + el panel compilado

ARG NODE_IMAGE=node:22-bookworm-slim

# ---------- Dependencias (todo el workspace) ----------
FROM ${NODE_IMAGE} AS deps
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web-publico/package.json apps/web-publico/
COPY apps/web-gestion/package.json apps/web-gestion/
COPY packages/shared-types/package.json packages/shared-types/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS fuente
COPY . .
RUN pnpm --filter @vitriauto/shared-types build

# ---------- Migraciones ----------
FROM fuente AS migrar
CMD ["node_modules/.bin/node-pg-migrate", "-m", "migrations", "-j", "sql", "up"]

# ---------- API ----------
FROM fuente AS build-api
RUN pnpm --filter @vitriauto/api build
# Deja solo dependencias de producción (mismas rutas: los enlaces de pnpm siguen válidos).
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod

FROM ${NODE_IMAGE} AS api
ENV NODE_ENV=production TZ=America/Santiago UPLOADS_DIR=/data/uploads
WORKDIR /repo
COPY --from=build-api --chown=node:node /repo/node_modules ./node_modules
COPY --from=build-api --chown=node:node /repo/packages/shared-types/package.json ./packages/shared-types/
COPY --from=build-api --chown=node:node /repo/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=build-api --chown=node:node /repo/packages/shared-types/node_modules ./packages/shared-types/node_modules
COPY --from=build-api --chown=node:node /repo/apps/api/package.json ./apps/api/
COPY --from=build-api --chown=node:node /repo/apps/api/dist ./apps/api/dist
COPY --from=build-api --chown=node:node /repo/apps/api/node_modules ./apps/api/node_modules
# El volumen de archivos subidos hereda este dueño al crearse.
RUN mkdir -p /data/uploads && chown node:node /data/uploads
USER node
WORKDIR /repo/apps/api
EXPOSE 4000
CMD ["node", "dist/main.js"]

# ---------- Sitio público ----------
FROM fuente AS build-web-publico
# Las NEXT_PUBLIC_* quedan fijas en el build (también en el middleware).
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ROOT_DOMAIN
ARG NEXT_PUBLIC_PANEL_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN test -n "$NEXT_PUBLIC_API_URL" && test -n "$NEXT_PUBLIC_ROOT_DOMAIN" \
  && pnpm --filter @vitriauto/web-publico build

FROM ${NODE_IMAGE} AS web-publico
ENV NODE_ENV=production TZ=America/Santiago NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build-web-publico --chown=node:node /repo/apps/web-publico/.next/standalone ./
COPY --from=build-web-publico --chown=node:node /repo/apps/web-publico/.next/static ./apps/web-publico/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web-publico/server.js"]

# ---------- Panel de gestión (estático) ----------
FROM fuente AS build-web-gestion
ARG VITE_API_URL
ARG VITE_DOMINIO_PUBLICO
RUN test -n "$VITE_API_URL" && test -n "$VITE_DOMINIO_PUBLICO" \
  && pnpm --filter @vitriauto/web-gestion build

# ---------- Caddy (con certificado wildcard vía DNS de Cloudflare) ----------
FROM caddy:2.10-builder AS build-caddy
RUN xcaddy build --with github.com/caddy-dns/cloudflare

FROM caddy:2.10-alpine AS caddy
COPY --from=build-caddy /usr/bin/caddy /usr/bin/caddy
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build-web-gestion /repo/apps/web-gestion/dist /srv/panel
