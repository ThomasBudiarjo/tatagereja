# syntax=docker/dockerfile:1

# --- Build the web app and install production dependencies -------------------
FROM oven/bun:1.3.11-alpine AS build
WORKDIR /app

# Install dependencies first so Docker can cache this layer.
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web

RUN bun run --cwd apps/web build

# --- Runtime -----------------------------------------------------------------
FROM oven/bun:1.3.11-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/data/tatagereja.db \
    WEB_DIST_DIR=/app/apps/web/dist

RUN apk add --no-cache curl && \
    mkdir -p /data && \
    addgroup -g 1001 -S tatagereja && \
    adduser -u 1001 -S tatagereja -G tatagereja && \
    chown -R tatagereja:tatagereja /data

COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json package.json
COPY --from=build /app/packages/shared packages/shared
COPY --from=build /app/apps/api apps/api
COPY --from=build /app/apps/web/dist apps/web/dist

USER tatagereja
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:${PORT}/api/meta || exit 1

CMD ["bun", "run", "apps/api/src/index.ts"]
