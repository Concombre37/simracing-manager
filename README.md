# Sim Center Manager

Plateforme web complète de gestion pour un centre de simulation automobile équipé d'**Assetto Corsa** et de **Content Manager**.

## Fonctionnalités

- ✅ Site public : accueil, classement, réservation en ligne
- ✅ Authentification JWT avec rôles (admin, employé, client)
- ✅ Gestion des clients, employés et administrateurs
- ✅ Gestion des postes de simulation avec état en temps réel
- ✅ Gestion des réservations par créneaux horaires
- ✅ Gestion des voitures, circuits et mods AC
- ✅ Gestion des événements (compétitions, ligues, soirées privées)
- ✅ Back-office administrateur complet
- ✅ Agent local prototype pour piloter Content Manager / Assetto Corsa
- ✅ Récupération des résultats de session (temps au tour, classements)

## Stack technique

- **Frontend** : React 19 + Vite + TypeScript + Tailwind CSS
- **Backend** : Node.js + Express + TypeScript + Socket.io
- **Base de données** : SQLite (fichier local)
- **Agent local** : Node.js + TypeScript + Socket.io-client

## Installation

### Prérequis

- Node.js 20+
- npm

### 1. Cloner et entrer dans le projet

```bash
cd sim-center-manager
```

### 2. Installer les dépendances

```bash
npm run install:all
```

### 3. Initialiser la base de données et les données de test

```bash
cd backend
npm run seed
```

Identifiants admin par défaut :
- Email : `admin@simcenter.local`
- Mot de passe : `admin123`

### 4. Démarrer le backend

```bash
cd backend
npm run dev
```

Le backend est accessible sur `http://localhost:3001`.

### 5. Démarrer le frontend

```bash
cd frontend
npm run dev
```

Le frontend est accessible sur `http://localhost:5173`.

### 6. Démarrer l'agent local (sur chaque PC de simulation)

```bash
cd agent
cp .env.example .env
# Modifier .env avec STATION_ID et SERVER_URL
npm run dev
```

## Architecture

```
sim-center-manager/
├── backend/         # API REST + WebSocket
├── frontend/        # Application React
├── agent/           # Agent local installé sur chaque PC
└── database/        # Schémas SQL
```

## Intégration Assetto Corsa / Content Manager

L'agent local communique avec le serveur central via WebSocket. Quand une réservation est lancée depuis le back-office, le serveur envoie un événement `session:launch` à l'agent qui peut :

1. Générer/modifier les fichiers de configuration CM/AC
2. Lancer Content Manager avec les bons paramètres
3. Surveiller l'état du jeu
4. Récupérer les résultats de session

> **Note** : Content Manager n'a pas d'API officielle stable. L'agent inclus est un prototype de simulation. Pour une intégration réelle, il faut adapter les chemins `CM_PATH` et `AC_PATH` et utiliser l'API locale HTTP de CM si disponible, ou modifier les fichiers presets/race.ini.

## API principale

| Ressource | Endpoints |
|-----------|-----------|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` |
| Users | `GET /api/users`, `PATCH /api/users/:id/role` |
| Stations | `GET /api/stations`, `PATCH /api/stations/:id` |
| Cars | `GET /api/cars`, `POST /api/cars` |
| Tracks | `GET /api/tracks`, `POST /api/tracks` |
| Reservations | `GET /api/reservations`, `POST /api/reservations`, `PATCH /api/reservations/:id`, `DELETE /api/reservations/:id` |
| Sessions | `GET /api/sessions`, `POST /api/sessions`, `POST /api/sessions/:id/stop` |
| Leaderboard | `GET /api/leaderboard?trackId=&carId=` |
| Events | `GET /api/events`, `POST /api/events` |

## Événements WebSocket

| Événement | Description |
|-----------|-------------|
| `agent:register` | Enregistrement d'un agent local |
| `station:heartbeat` | Heartbeat d'état d'un poste |
| `session:launch` | Lancer une session sur un poste |
| `session:stop` | Arrêter une session |
| `session:started` | Confirmation de lancement |
| `session:finished` | Fin de session avec résultats |
| `station:updated` | Mise à jour diffusée aux clients |

## Roadmap

- [ ] Intégration réelle avec l'API locale de Content Manager
- [ ] Télémétrie en temps réel (vitesse, RPM, position)
- [ ] Paiement en ligne (Stripe/PayPal)
- [ ] Application mobile
- [ ] Ligues en ligne et championnats
- [ ] Support d'autres simulateurs (rFactor 2, iRacing)
- [ ] Gestion des stocks de mods

## License

MIT
