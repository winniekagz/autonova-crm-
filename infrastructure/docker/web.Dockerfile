# syntax=docker/dockerfile:1
# Build context: repository root.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/config/package.json packages/config/
COPY packages/enums/package.json packages/enums/
COPY packages/contracts/package.json packages/contracts/
COPY packages/validation/package.json packages/validation/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @autonova/web... --filter "./packages/*"
COPY packages packages
COPY apps/web apps/web
RUN pnpm --filter "./packages/*" run build && pnpm --filter @autonova/web run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
# Server-side rendering reaches the API over the compose network.
ENV API_INTERNAL_URL=http://api:4000
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
