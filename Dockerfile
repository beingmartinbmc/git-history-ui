# syntax=docker/dockerfile:1.7

# ----- Build stage -------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# Native deps for any optional builds.
RUN apk add --no-cache git python3 make g++

# Backend deps (with dev for tsc)
COPY package.json package-lock.json* ./
RUN npm ci

# Frontend deps (with dev for ng build)
COPY frontend/package.json frontend/package-lock.json* ./frontend/
RUN npm ci --prefix frontend

# Sources + build everything
COPY tsconfig.json ./
COPY src ./src
COPY public ./public
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

# git is required at runtime; tini gives proper signal handling.
RUN apk add --no-cache git tini

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/build ./build
COPY --from=builder /app/public ./public
COPY package.json ./

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/backend/server.js"]
