# Multi-stage Docker build for hevy-mcp
# Build stage
FROM node:24-alpine3.22 AS builder

WORKDIR /app

ENV ROLLUP_SKIP_NODEJS_NATIVE_BUILD=1

RUN apk update && apk upgrade --no-cache

# Copy package files and install dependencies
COPY package.json pnpm-lock.yaml ./
RUN corepack use pnpm@10.22.0 && pnpm install --frozen-lockfile --ignore-scripts

# Copy source code and build
COPY . ./
RUN pnpm run build

# Production stage
FROM node:24-alpine3.22 AS production

WORKDIR /app

# Copy package files for production dependencies
COPY package.json pnpm-lock.yaml ./
RUN corepack use pnpm@10.22.0 \
    && pnpm install --prod --frozen-lockfile --ignore-scripts --no-optional \
    && pnpm store prune

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./src/generated

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app
USER nodejs

ENV NODE_ENV=production

CMD [ "pnpm", "start", "--", "--http" ]
