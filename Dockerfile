# syntax=docker/dockerfile:1.7

# ----- Build stage -------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# Native deps for any optional builds.
RUN apk add --no-cache git python3 make g++

# Backend deps (with dev for tsc)
# scripts/ is copied first because package.json's postinstall runs
# scripts/check-native.js during `npm ci`.
COPY package.json package-lock.json* ./
COPY scripts ./scripts
RUN npm ci --no-audit --maxsockets=1000

# Frontend deps (with dev for ng build)
COPY frontend/package.json frontend/package-lock.json* ./frontend/
RUN npm ci --prefix frontend --no-audit --maxsockets=1000 \
 && test -x frontend/node_modules/.bin/ng

# Sources + build everything
COPY tsconfig.json ./
COPY src ./src
COPY frontend ./frontend
RUN npm run build:backend \
 && npm run build:frontend \
 && npm run copy-frontend \
 && npm prune --omit=dev

# ----- Runtime stage -----------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# git is required at runtime; tini gives proper signal handling. The fixed
# mount point is trusted so host/container UID differences do not block Git.
RUN apk add --no-cache git tini \
 && git config --system --add safe.directory /repo

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/build /app/build
COPY package.json /app/

USER node
EXPOSE 3000
VOLUME ["/repo"]
WORKDIR /repo

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "/app/dist/backend/server.js"]
