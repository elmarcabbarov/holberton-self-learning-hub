# syntax=docker/dockerfile:1
# Debian-slim keeps native addons (better-sqlite3) on prebuilt binaries (D-013).
FROM node:26.13.0-bookworm-slim AS build
# Corepack is no longer bundled with Node 25+.
RUN npm install -g pnpm@12.15.0
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile
COPY . .
# Keep the workspace layout: Node strips types only outside node_modules, and
# @hub/contracts resolves through a symlink to packages/contracts (real path).
RUN pnpm --filter @hub/web build \
 && CI=true pnpm install --prod --frozen-lockfile --filter @hub/server... \
 && mkdir -p /out/apps \
 && cp -r node_modules package.json pnpm-workspace.yaml /out/ \
 && cp -r packages /out/packages \
 && cp -r apps/server /out/apps/server

FROM node:26.13.0-bookworm-slim
ENV NODE_ENV=production HUB_IN_CONTAINER=1 HUB_DATA=/data HUB_WEB_DIST=/app/web HUB_PORT=3000
WORKDIR /app
COPY --from=build /out /app
COPY --from=build /src/apps/web/dist /app/web
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/server/src/main.ts"]
