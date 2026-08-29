# syntax=docker/dockerfile:1

FROM node:24-alpine AS build

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY packages/hevy-client/package.json packages/hevy-client/package.json
COPY packages/operations/package.json packages/operations/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/node/package.json packages/node/package.json
COPY packages/worker/package.json packages/worker/package.json
RUN corepack enable && corepack prepare pnpm@12.0.0 --activate && pnpm install --frozen-lockfile

COPY packages/hevy-client/ ./packages/hevy-client/
COPY packages/operations/ ./packages/operations/
COPY packages/core/ ./packages/core/
COPY packages/node/ ./packages/node/
RUN pnpm --filter hevy-mcp run build:standalone

FROM node:24-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build --chown=node:node /app/packages/node/dist/standalone.mjs ./standalone.mjs

USER node

ENTRYPOINT ["node", "/app/standalone.mjs"]
