FROM node:20-alpine AS builder
RUN npm install -g pnpm@9

WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json tsconfig.json ./
COPY lib/ ./lib/
COPY artifacts/deck-os/ ./artifacts/deck-os/

RUN pnpm install --frozen-lockfile

# Vite config reads PORT and BASE_PATH at build time (required, not optional).
# PORT is only used for the dev server but must be set; 80 is a safe placeholder.
# BASE_PATH controls the Vite `base` option — set to "/" for standard deployment.
ARG PORT=80
ARG BASE_PATH=/
ENV PORT=$PORT
ENV BASE_PATH=$BASE_PATH

WORKDIR /app/artifacts/deck-os
RUN pnpm run build

# ── Serve with nginx ──────────────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/artifacts/deck-os/dist /usr/share/nginx/html
COPY artifacts/deck-os/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
