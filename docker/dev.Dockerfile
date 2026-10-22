# Image de développement partagée par l'API et le web. Le code source est monté en volume
# (rechargement à chaud) ; seules les dépendances sont installées dans l'image.
FROM node:24.22.0-trixie-slim

# openssl : requis par le moteur de migration Prisma.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@10.28.0

WORKDIR /app
RUN chown node:node /app
USER node

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY --chown=node:node apps/api/package.json apps/api/
COPY --chown=node:node apps/web/package.json apps/web/
COPY --chown=node:node apps/e2e/package.json apps/e2e/
COPY --chown=node:node packages/crossword-core/package.json packages/crossword-core/
COPY --chown=node:node packages/contracts/package.json packages/contracts/

RUN pnpm install --frozen-lockfile
