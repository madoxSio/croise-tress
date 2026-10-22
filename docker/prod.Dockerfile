# Images de production : `api` (Fastify + migrations) et `web` (Caddy : SPA statique, TLS,
# reverse proxy vers l'API sous la même origine). Construites par compose.prod.yml.
FROM node:24.22.0-trixie-slim AS base
# openssl : requis par le moteur de migration Prisma.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@10.28.0
WORKDIR /app

# --- Dépendances (couche mise en cache tant que les manifestes ne changent pas) ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/e2e/package.json apps/e2e/
COPY packages/crossword-core/package.json packages/crossword-core/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile

# --- Build : client Prisma et SPA statique ---
FROM deps AS build
COPY . .
RUN pnpm --filter @crossverse/api db:generate \
  && pnpm --filter @crossverse/web build \
  && node docker/csp.mjs apps/web/.output/public > /app/csp.caddy

# --- API : TypeScript exécuté par tsx (pas d'étape de compilation pour le MVP) ---
FROM build AS api
ENV NODE_ENV=production
RUN chown -R node:node /app/apps/api
USER node
WORKDIR /app/apps/api
EXPOSE 3001
# Migrations versionnées appliquées au démarrage, puis lancement de l'API.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && exec node --import tsx src/server.ts"]

# --- Web : Caddy sert le build et relaie /api et /ws vers l'API ---
FROM caddy:2.10.2-alpine AS web
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/csp.caddy /etc/caddy/csp.caddy
COPY --from=build /app/apps/web/.output/public /srv
