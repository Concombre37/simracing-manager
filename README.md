# SimRacing Manager

## Santé des PODs

La page d'administration `/pod-health` lance un diagnostic à la demande sur les PODs en ligne. Elle vérifie Assetto Corsa, Content Manager, Custom Shaders Patch, l'application Lua SimCenter, l'assistant Drive et ViGEmBus, puis affiche les versions des pilotes graphiques et des périphériques de simulation détectés sous Windows. Elle compare les pilotes des PODs similaires au premier POD scanné. Le scan exige un agent v2.2.204 ou plus récent ; un agent plus ancien affiche une erreur explicite après expiration.

Les boutons « Mettre à jour l'agent » et « Synchroniser les mods » réutilisent les commandes existantes. La page Mods permet de comparer les voitures et circuits par poste et de propager les éléments manquants. Le diagnostic n'affirme pas qu'un pilote est à jour : la comparaison avec la version publiée par son fabricant et son installation restent à faire séparément.

Professional sim racing station management system.

## Overview

SimRacing Manager is a modern, production-ready platform designed to manage sim racing stations (PODs), launch Assetto Corsa sessions, collect telemetry and results, and synchronize content across a fleet of Windows gaming stations.

## Architecture

This repository is organized as a monorepo:

```
sim-center-manager/
├── apps/
│   ├── backend/     # NestJS API + WebSocket gateway
│   ├── frontend/    # React + Vite dashboard
│   └── agent/       # Local Node.js agent running on each station
├── packages/
│   └── shared/      # Shared types, DTOs and Socket.IO contracts
├── docs/            # Documentation
├── scripts/         # Utility scripts
└── docker-compose.yml
```

## Quick start

### Prerequisites

- Node.js 20+
- npm 9+
- PostgreSQL 16 (or use Docker Compose)

### Installation

```bash
# Install all dependencies
npm install

# Build shared package first
npm run build --workspace=@simracing/shared

# Start backend in development mode
npm run start:dev --workspace=@simracing/backend

# Start frontend in development mode
npm run dev --workspace=@simracing/frontend
```

### Docker Compose

```bash
cp apps/backend/.env.example apps/backend/.env
# Edit apps/backend/.env with secure values
docker compose up -d
```

## Development

Each application can be developed independently. See the dedicated README files in `apps/*/README.md`.

## Documentation

- [Architecture](docs/architecture.md)
- [Installation](docs/installation.md)
- [Configuration](docs/configuration.md)
- [Developer guide](docs/developer.md)
- [API documentation](docs/api.md)

## License

MIT
