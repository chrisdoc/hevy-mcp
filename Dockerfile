# Multi-stage Docker build for hevy-mcp
# Build stage
FROM node:lts-alpine as builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --ignore-scripts --no-optional

# Copy source code and build
COPY . ./
RUN npm run build

# Production stage
FROM node:lts-alpine as production

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

EXPOSE 3000

CMD [ "npm", "start" ]
