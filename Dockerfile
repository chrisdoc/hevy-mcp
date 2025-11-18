# Multi-stage Docker build for hevy-mcp
# Build stage
FROM node:24-alpine3.22 AS builder

WORKDIR /app

ENV ROLLUP_SKIP_NODEJS_NATIVE_BUILD=1

RUN apk update && apk upgrade --no-cache

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy source code and build
COPY . ./
RUN npm run build

# Production stage
FROM node:24-alpine3.22AS production

WORKDIR /app

# Copy package files for production dependencies
COPY package*.json ./
RUN npm ci --production --ignore-scripts --no-optional && npm cache clean --force

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

CMD [ "npm", "start", "--", "--http" ]
