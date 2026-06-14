FROM node:20-slim
WORKDIR /app

# Copier le backend buildé avec ses dépendances
COPY backend/dist ./
COPY backend/node_modules ./node_modules
COPY backend/package.json ./

# Copier le frontend buildé
COPY frontend/dist ./dist

# Créer le dossier de données SQLite
RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=3002
ENV DB_NAME=/data/sim_center.sqlite
ENV JWT_SECRET=simracing_hytlabs_secret_key_change_me
ENV JWT_EXPIRES_IN=7d

EXPOSE 3002
CMD ["node", "server.js"]
