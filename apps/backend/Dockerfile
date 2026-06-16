# syntax=docker/dockerfile:1

# Production image: assumes host-built artifacts (npm ci + npm run build) exist in the context.
FROM node:20-slim AS production
WORKDIR /app

# Required for Prisma to detect OpenSSL and for native crypto
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Copy workspace manifests
COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/

# Copy installed dependencies
COPY node_modules ./node_modules

# Copy built artifacts
COPY packages/shared/dist ./packages/shared/dist
COPY apps/backend/dist ./apps/backend/dist
COPY apps/backend/prisma ./apps/backend/prisma
COPY apps/frontend/dist ./apps/frontend/dist

WORKDIR /app/apps/backend

EXPOSE 3002

CMD ["node", "dist/main"]
