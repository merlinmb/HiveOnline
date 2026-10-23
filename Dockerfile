# syntax=docker/dockerfile:1

# ---- Build stage -----------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# better-sqlite3 has prebuilt binaries for most platforms, but keep a compiler
# available so npm ci also works on unusual architectures.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies first so Docker can cache this layer.
COPY package.json package-lock.json ./
RUN npm ci

# Build the client bundle and the server entry points.
COPY tsconfig.json vite.config.ts index.html ./
COPY scripts ./scripts
COPY shared ./shared
COPY server ./server
COPY src ./src
COPY public ./public
RUN npm run build \
  && npm prune --omit=dev

# ---- Runtime stage ---------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    CONFIG_DIR=/config

WORKDIR /app

# Runtime dependencies and compiled output only.
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public

# The official node image already contains a uid/gid 1000 "node" user.
RUN mkdir -p /data /config \
  && chown -R node:node /app /data /config

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1));"

CMD ["node", "dist/server/index.js"]
