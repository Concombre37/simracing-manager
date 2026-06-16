# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY apps/frontend/package*.json apps/frontend/
COPY packages/shared/package*.json packages/shared/

RUN npm ci

COPY . .

ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build --workspace=@simracing/shared
RUN npm run build --workspace=@simracing/frontend

FROM nginx:alpine
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html
COPY nginx-simracing.hytlabs.com.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
