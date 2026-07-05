# Brief v0 — Refonte UI SimRacing Manager

## Contexte

SimRacing Manager est une application web de gestion d’un centre de simulation racing. Elle permet :

- De voir et contrôler des postes (POD) Windows qui lancent Assetto Corsa.
- De créer/gérer des serveurs dédiés Assetto Corsa.
- D’envoyer des joueurs sur ces serveurs avec des paramètres personnalisés.
- De suivre les sessions en cours et la télémétrie en temps réel.
- De gérer les médias de l’écran d’attente (blanking).

## Stack technique

- **Framework** : React 18 + TypeScript
- **Build** : Vite 5
- **Styling** : Tailwind CSS 3.4
- **Routing** : React Router DOM v6
- **State / data fetching** : TanStack Query (React Query) v5
- **HTTP** : Axios via `src/services/api.ts`
- **Temps réel** : Socket.IO client via `src/hooks/useSocket.ts`
- **Icons** : Lucide React
- **Auth** : JWT stocké dans `localStorage.accessToken`
- **Backend** : NestJS exposé sous `/api` + WebSocket `/`

## Architecture frontend

```
apps/frontend/src/
├── App.tsx                 # routes + auth guards
├── components/
│   ├── Layout.tsx          # sidebar + header
│   ├── ui/                 # composants design system basiques
│   │   ├── Badge.tsx
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── CircularGauge.tsx
│   │   ├── Input.tsx
│   │   └── Modal.tsx
│   ├── CreateServerModal.tsx   # modal de création serveur (à transformer en page wizard)
│   ├── CreateStationModal.tsx
│   └── BlankingMediaModal.tsx
├── contexts/
│   └── AuthContext.tsx     # isAdmin, isTechnician, user
├── hooks/
│   ├── useAuth.ts
│   └── useSocket.ts
├── pages/
│   ├── Login.tsx
│   ├── Dashboard.tsx
│   ├── Stations.tsx
│   ├── DedicatedServers.tsx
│   ├── Sessions.tsx        # /en-cours
│   ├── Leaderboard.tsx
│   ├── Settings.tsx
│   ├── Users.tsx
│   ├── ContentPreviews.tsx
│   ├── BlankingMedia.tsx
│   └── Telemetry.tsx
├── services/               # API clients (TanStack Query ready)
│   ├── api.ts
│   ├── stations.ts
│   ├── dedicatedServers.ts
│   ├── sessions.ts
│   ├── telemetry.ts
│   ├── contentPreviews.ts
│   └── users.ts
└── utils/                  # helpers (time, track names, etc.)
```

## Routes actuelles

| Route                | Rôle       | Description                       |
| -------------------- | ---------- | --------------------------------- |
| `/login`             | public     | Connexion                         |
| `/`                  | admin/tech | Dashboard technique               |
| `/stations`          | admin/tech | Contrôle des POD                  |
| `/dedicated-servers` | admin/tech | Liste et création serveurs dédiés |
| `/en-cours`          | admin/tech | Sessions actives + telemetry live |
| `/leaderboard`       | admin/tech | Classements (placeholder)         |
| `/users`             | admin      | Gestion utilisateurs              |
| `/settings`          | admin      | Paramètres réseau                 |
| `/content-previews`  | admin      | Preview voitures/circuits         |
| `/blanking-media`    | admin      | Médias écran d’attente            |

## Design system actuel

Les composants UI existants sont dans `apps/frontend/src/components/ui/`. Tailwind utilise un thème **dark** avec ces couleurs principales :

- Fond principal : `bg-dark-900` / `bg-dark-800`
- Bordures : `border-dark-600`
- Texte : `text-white`, `text-gray-400`, `text-gray-500`
- Accent bleu : `text-accent-blue`, `bg-accent-blue/10`, `#00d4ff`
- Accent orange : `text-accent-orange`, `bg-accent-orange/10`
- Succès : `text-green-400`, `bg-green-400/10`
- Danger : `text-red-400`, `bg-red-400/10`, `bg-red-900/30`

Les configs Tailwind sont dans `tailwind.config.js` et `apps/frontend/src/index.css`.

## Données clés affichées

### Station (POD)

- `id`, `stationId`, `name`, `status` (`online`, `offline`, `in_game`)
- `localIp`, `macAddress`, `version`, `lastSeenAt`
- `config` (optionnel) : `AC_PATH`, `CM_PATH`, etc.
- `content` : liste des voitures et circuits scannés

### DedicatedServer

- `id`, `name`, `status` (`running`, `stopped`)
- `stationId`, `host`, `udpPort`, `tcpPort`, `httpPort`
- `track`, `trackLayout`, `cars[]`, `maxClients`, `password?`

### Session

- `id`, `stationId`, `clientName`, `carAcId`, `track`, `trackLayout`
- `difficulty` (`EASY`, `PRO`, `CUSTOM`), `durationMinutes`, `startedAt`
- `status` (`RUNNING`, `FINISHED`)
- Live telemetry : `speedKmh`, `rpm`, `gear`, `throttle`, `brake`, `lapCount`, `bestLapMs`, `position`

## APIs à conserver (mêmes endpoints)

- `GET /api/stations`
- `POST /api/stations/:id/launch`
- `POST /api/stations/:id/stop`
- `POST /api/stations/:id/update-agent`
- `POST /api/stations/:id/sync-content`
- `POST /api/stations/:id/wake`
- `POST /api/stations/:id/shutdown`
- `GET /api/dedicated-servers`
- `POST /api/dedicated-servers`
- `PATCH /api/dedicated-servers/:id`
- `DELETE /api/dedicated-servers/:id`
- `POST /api/dedicated-servers/:id/start`
- `POST /api/dedicated-servers/:id/stop`
- `POST /api/dedicated-servers/:id/join`
- `GET /api/sessions/active`
- `POST /api/sessions/:id/extend`
- `POST /api/sessions/:id/stop`

## Temps réel (Socket.IO namespace `/`)

- Écouter `station:updated` → mise à jour du statut d’un POD.
- Écouter `station:telemetry` → données live d’un POD.
- Écouter `session:updated` → mise à jour session.

## Demande principale

### Création de serveur : passer d’une modal à un wizard en 3 étapes

Actuellement la création d’un serveur dédié se fait via `CreateServerModal.tsx` (une modal).
**Objectif** : transformer ça en une vraie page `/dedicated-servers/create` avec un wizard en 3 étapes / slides.

#### Étape 1 — Choix du simulateur / hôte

- Sélectionner une station (POD) en ligne.
- Afficher son nom, son statut, son IP, sa version agent.
- Possibilité de resynchroniser son contenu.

#### Étape 2 — Choix du circuit

- Grille de cartes de circuits avec preview image.
- Filtrer/rechercher un circuit.
- Sélectionner un layout si plusieurs existent.

#### Étape 3 — Configuration & voitures

- Nom du serveur, nombre de slots, mot de passe optionnel, rcon password.
- Sélection multiple de voitures (grille de cartes avec preview, filtre/recherche).
- Récapitulatif visuel final avant validation.

#### Navigation

- Barre de progression en haut (étapes 1 → 2 → 3).
- Boutons Précédent / Suivant / Créer le serveur.
- Validation par étape (ne pas passer à l’étape suivante si invalide).

### Refonte globale

- Design **sim racing / cockpit / premium dark**.
- Pas de template générique admin : donner une identité forte (typo technique, néons, grille, card glassmorphism).
- Dashboard `/` : stats visuelles, POD en ligne, serveurs actifs, sessions en cours.
- `/stations` : vue carte POD avec statut, commandes rapides, détails expandable.
- `/en-cours` : affichage immersif des sessions actives avec telemetry live (jauges, temps restant, etc.).
- `/dedicated-servers` : liste des serveurs avec état, actions start/stop/join, plus un CTA “Nouveau serveur” qui mène au wizard.
- Responsive minimum tablette/desktop (usage interne sur écran large).

## Contraintes

- Garder la structure des routes existantes (sauf ajout de `/dedicated-servers/create`).
- Réutiliser les services API dans `src/services/` (ne pas changer les endpoints).
- Conserver le système de rôles (`isAdmin`, `isTechnician`).
- Utiliser Tailwind CSS, pas de lib UI externe (sauf si vraiment justifié).
- Conserver `useSocket` pour le temps réel.
- TypeScript strict : utiliser les types existants des services.
- Le wizard de création serveur doit appeler `dedicatedServersApi.create(...)` à la validation finale.

## Livrables attendus

1. Code React/Tailwind des nouvelles pages et composants.
2. Ajout de la route `/dedicated-servers/create` dans `App.tsx`.
3. Suppression ou conservation optionnelle de `CreateServerModal.tsx` (si remplacée, tu peux la supprimer).
4. Mise à jour de `DedicatedServers.tsx` pour pointer vers la nouvelle page de création.

## Fichiers sources clés à prendre en compte

- `apps/frontend/src/App.tsx`
- `apps/frontend/src/pages/DedicatedServers.tsx`
- `apps/frontend/src/components/CreateServerModal.tsx`
- `apps/frontend/src/services/dedicatedServers.ts`
- `apps/frontend/src/services/stations.ts`
- `apps/frontend/src/components/Layout.tsx`
- `apps/frontend/src/components/ui/*.tsx`

---

**Objectif final** : un interface moderne, immersive et cohérente, où la création d’un serveur dédié devient une expérience en 3 étapes claire et visuelle.
