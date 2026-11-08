# syntax=docker/dockerfile:1
# Build context: repository root.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/config/package.json packages/config/
COPY packages/enums/package.json packages/enums/
COPY packages/contracts/package.json packages/contracts/
COPY packages/validation/package.json packages/validation/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @autonova/api... --filter "./packages/*"
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter "./packages/*" run build \
 && pnpm --filter @autonova/api run build \
 && pnpm --filter @autonova/api deploy --prod --legacy /out \
 && cp -r apps/api/dist /out/dist

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
# Private upload directory; created owned by `node` so a named volume mounted here inherits that owner.
RUN mkdir -p /var/lib/autonova/files && chown node:node /var/lib/autonova/files && chmod 700 /var/lib/autonova/files
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/api/v1/health/live || exit 1
CMD ["node", "dist/main.js"]
