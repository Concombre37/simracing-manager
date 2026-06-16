# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy workspace manifests
COPY package*.json ./
COPY apps/backend/package*.json apps/backend/
COPY packages/shared/package*.json packages/shared/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build shared package first, then backend
RUN npm run build --workspace=@simracing/shared
RUN npm run build --workspace=@simracing/backend

# Generate Prisma client
RUN npx --workspace=@simracing/backend prisma generate

# Production image
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

# Copy runtime dependencies and builds
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=builder /app/apps/backend/package.json ./apps/backend/package.json

WORKDIR /app/apps/backend

EXPOSE 3000

CMD ["node", "dist/main"]
