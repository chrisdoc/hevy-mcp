# syntax=docker/dockerfile:1

FROM node:lts-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsdown.config.ts ./
COPY src/ ./src/
RUN npm run build:standalone

FROM node:lts-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build --chown=node:node /app/dist/standalone.mjs ./standalone.mjs

USER node

ENTRYPOINT ["node", "/app/standalone.mjs"]
