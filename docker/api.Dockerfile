# Express API with the local embedding model and SQLite index.
# Built from the repo root: docker build -f docker/api.Dockerfile .

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace api --include-workspace-root=false --omit=dev
# Drop native binaries for other platforms and the browser runtime, which the
# Node build of transformers.js does not load (about 400 MB).
RUN arch="$(uname -m | sed 's/aarch64/arm64/; s/x86_64/x64/')" \
 && cd node_modules/onnxruntime-node/bin/napi-v6 \
 && rm -rf darwin win32 \
 && find linux -mindepth 1 -maxdepth 1 ! -name "$arch" -exec rm -rf {} + \
 && rm -rf /app/node_modules/onnxruntime-web

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node packages/shared ./packages/shared
COPY --chown=node:node apps/api/package.json apps/api/
COPY --chown=node:node apps/api/src apps/api/src
COPY --chown=node:node apps/api/scripts apps/api/scripts
COPY --chown=node:node data/source data/source
COPY --chown=node:node data/enrichment data/enrichment
COPY docker/api-entrypoint.sh /usr/local/bin/api-entrypoint
USER node
WORKDIR /app/apps/api
ENTRYPOINT ["api-entrypoint"]
