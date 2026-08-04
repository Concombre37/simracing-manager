# SimRacing Manager — Project Notes

Connaissance complète et exhaustive du monorepo `simracing-manager`, à jour au **`v2.2.79`**. Ce fichier est chargé automatiquement par Claude Code (contexte de projet) et sert de source de vérité — le tenir à jour à chaque changement d'architecture, d'endpoint, de contrat WebSocket, de build ou de déploiement.

## 1. Vue d'ensemble

- **Repo local**: `/root/sim-center-manager`
- **GitHub**: `Concombre37/simracing-manager`
- **Production**: `https://simracing.hytlabs.com` (derrière Cloudflare Tunnel — voir mémoire `hytlabs-cloudflare-tunnel`)
- **Architecture**: NestJS 10 (backend) + React 18/Vite (frontend) + agent Windows Node.js (`pkg`), le tout en npm workspaces.
- **Version de référence**: l'agent (`apps/agent/package.json`) — `2.2.67`. Les autres `package.json` (`root`, `backend`, `frontend`, `shared`) restent à `2.2.14` et ne sont **pas** des indicateurs fiables de version produit.
- **Deux stations réelles connues** (hytlabs) : `concombre` (rôle `admin`, hôte de serveurs dédiés, IP `192.168.1.63`) et `desktop-gl3t50t` (rôle `simulator`, POD joueur, IP `192.168.1.64`).

### Agents

| Path            | Rôle                                                                                                           | Statut                                                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/agent/`   | Agent monorepo actuel, `@simracing/shared`, auto-provisioning + clé API, télémétrie mémoire partagée via koffi | **Utilisé, release actif**                                                                                                                                 |
| `agent-legacy/` | Ancien agent standalone, archivé                                                                               | Ne jamais release ni utiliser — sert uniquement de référence historique (ex: `joinServer.ts`'s `buildRaceIni()` a servi à corriger un bug réel en v2.2.64) |

## 2. Structure du monorepo

```
sim-center-manager/
├── apps/
│   ├── backend/          # NestJS 10 + Prisma 5 + PostgreSQL 16
│   ├── frontend/         # React 18 + Vite + Tailwind 3.4
│   └── agent/            # Agent Windows (Node 20, packagé avec pkg)
├── packages/
│   └── shared/           # Types, enums, contrats Socket.IO partagés
├── agent-legacy/         # Agent LEGACY (archivé, ne pas utiliser)
├── docker-compose.yml
├── nginx-simracing.hytlabs.com.conf
├── CHANGELOG.md
├── CLAUDE.md              (ce fichier — chargé automatiquement par Claude Code)
└── .kimi/skills/simracing-manager/SKILL.md   # Copie miroir de ce fichier, pour d'autres outils (ex: Kimi)
```

## 3. Backend (`apps/backend`)

- **Framework**: NestJS 10, préfixe global `/api`, port `3002` en production/Docker.
- **Temps réel**: deux gateways Socket.IO :
  - namespace `/agent` — provisioning, heartbeat, commandes agent (`AgentGateway`, protégé par `AgentAuthGuard`).
  - namespace racine `/` — gateway dashboard pour le frontend (`DashboardGateway`), émet `station:updated`, `station:telemetry`, `session:updated`.
- **Auth**: JWT (`accessToken`) pour les utilisateurs ; clés API hashées SHA-256 pour les agents.
- **Modules**: `Auth`, `Users`, `Stations`, `Sessions`, `DedicatedServers`, `Agent`, `Dashboard`, `Content`, `ContentPreviews`, `BlankingMedia`, `PowerManagement`, `Telemetry`, `Settings`, `Clients`.
- **Prisma**: schéma dans `apps/backend/prisma/schema.prisma`. **Migrations manuelles** — jamais lancées par Docker. Toujours `npx prisma migrate deploy --schema=apps/backend/prisma/schema.prisma` après un changement de schéma.
- **Fichiers statiques**: le backend sert le frontend buildé (`apps/frontend/dist`) via `@nestjs/serve-static`.
- **Buffer WebSocket agent**: `AgentGateway` utilise `maxHttpBufferSize: 1 * 1024 * 1024 * 1024` pour accepter les gros payloads de contenu (previews en base64).

### 3.1 Endpoints REST — liste exhaustive

**`AuthController` (`/api/auth`)**

- `POST /auth/login`
- `POST /auth/register`
- `GET /auth/me`

**`UsersController` (`/api/users`)**

- `POST /users` (admin)
- `GET /users` (admin)
- `GET /users/me`
- `GET /users/:id` (admin)
- `PATCH /users/:id` (admin)
- `DELETE /users/:id` (admin)

**`StationsController` (`/api/stations`)**

- `POST /stations` (admin) — crée une station
- `GET /stations` (admin/technician)
- `GET /stations/connected` — liste des `stationId` réellement connectés (socket)
- `GET /stations/:id`
- `GET /stations/:id/telemetry`
- `PATCH /stations/:id` (admin) — si `role` est présent dans le body, pousse `station:role` à l'agent via `agentGateway.emitStationRole()`
- `DELETE /stations/:id` (admin)
- `POST /stations/:id/regenerate-api-key` (admin)
- `POST /stations/:id/launch` — rejeté (400) si `role !== 'simulator'`
- `POST /stations/:id/stop`
- `POST /stations/:id/update-agent` (admin/technician) — déclenche `system:update`
- `POST /stations/:id/sync-content` (admin) — déclenche `content:sync`
- `GET /stations/:id/logs` (admin/technician, **v2.2.63**) — aller-retour WebSocket `logs:request`/`agent:logs` (timeout 4s), retourne `{ lines: string[] }` (vide si l'agent n'est pas connecté ou ne répond pas)

**`PowerManagementController` (`/api/stations`)**

- `POST /stations/:id/wake` (admin/technician) — Wake-on-LAN via un POD relais du même sous-réseau
- `POST /stations/:id/shutdown` (admin/technician) — arrêt distant via WebSocket agent

**`SessionsController` (`/api/sessions`)**

- `POST /sessions`
- `GET /sessions/station/:stationId`
- `GET /sessions/active`
- `POST /sessions/:id/extend`
- `POST /sessions/:id/stop`

**`DedicatedServersController` (`/api/dedicated-servers`)**

- `POST /dedicated-servers` (admin) — rejeté (400) si la station hôte n'a pas `role: 'admin'`
- `GET /dedicated-servers` (admin/technician)
- `GET /dedicated-servers/:id` (admin/technician)
- `PATCH /dedicated-servers/:id` (admin)
- `DELETE /dedicated-servers/:id` (admin)
- `POST /dedicated-servers/:id/stop` (admin)
- `POST /dedicated-servers/:id/join` (admin) — envoie une liste de PODs ; tout POD dont la station n'a pas `role: 'simulator'` est ignoré (warning loggé, pas d'erreur bloquante). Body par POD : `stationId`, `carAcId`, `clientName?`, `difficulty?` (`EASY|PRO|CUSTOM`), `gearbox?` (`MANUAL|AUTO`). `clientName`, s'il est fourni, déclenche un find-or-create dans `Client` (insensible à la casse) et relie `Session.clientId`.

**`ClientsController` (`/api/clients`, v2.2.63)**

- `GET /clients?search=` (admin/technician) — jusqu'à 10 résultats, `contains` insensible à la casse, utilisé par l'autocomplete `ClientNameInput.tsx`.

**`ContentController` (`/api/content`)**

- `POST /content/packages`
- `GET /content/catalog`
- `GET /content/packages/:id/download`

**`ContentPreviewsController` (`/api/content/previews`)**

- `GET /content/previews`
- `GET /content/previews/:id`
- `DELETE /content/previews/:id`

**`ContentLabelsController` (`/api/content/labels`, v2.2.68)**

- `GET /content/labels/known` (admin) — agrège tous les `acId` de voitures/circuits déjà vus dans `Station.content` (toutes stations confondues, dédupliqués), joints avec le `ContentLabel` existant s'il y en a un.
- `GET /content/labels/map` (tout utilisateur authentifié) — `{ car: Record<acId, displayName>, track: Record<acId, displayName> }`, consommé par le hook frontend `useContentLabelMap()`.
- `PUT /content/labels` (admin) — upsert `{ type: 'car'|'track', acId, displayName }` ; `displayName` vide = suppression du label (retour au nom technique).

**`BlankingMediaController`**

- `GET /stations/:id/blanking-media`
- `POST /stations/:id/blanking-media`
- `PATCH /stations/:id/blanking-media/reorder`
- `DELETE /stations/:stationId/blanking-media/:mediaId`
- `POST /blanking-media/bulk` — upload un fichier vers plusieurs stations
- `GET /blanking-media/:id/download`

**`SettingsController` (`/api/settings`)**

- `GET /settings`
- `PATCH /settings` (admin) — émet `settings.updated` (EventEmitter interne) → poussé à tous les agents via `settings:updated`

### 3.2 Modèle de données (Prisma)

- **`User`**: `id, email (unique), password, role (technician|admin), createdAt, updatedAt`.
- **`Station`**: `id, stationId (unique, business id), name, role (simulator|admin), apiKeyHash, version, localIp, macAddress, lastSeenAt, status, blankingActive, config (json), content (json — cars/tracks scannés), createdAt, updatedAt`. Relations: `sessions[]`, `dedicatedServers[]`, `contentPreviews[]`, `blankingMedia[]`.
- **`Session`**: `id, stationId (FK Station.id — PAS la business stationId, voir gotcha 3.3), type (direct_launch|dedicated_join), serverId?, clientId? (FK Client), clientName?, difficulty?, gearbox?, carAcId?, track?, trackLayout?, durationMinutes?, config (json), status (pending|running|finished), startedAt?, endedAt?, result (json — race_out.json nettoyé), createdAt, updatedAt`. Relations: `station`, `client?`, `telemetryFiles[]`.
- **`Client`** (v2.2.63) : `id, name (unique), createdAt, updatedAt`. Relation: `sessions[]`. Find-or-create insensible à la casse dans `ClientsService`.
- **`TelemetryFile`**: `id, sessionId (FK), fileName, sizeBytes, content (bytes?), createdAt`.
- **`ContentPackage`**: `id, type, name, version, archiveUrl, checksum, isRequired`, unique sur `(type, name, version)`.
- **`DedicatedServer`**: `id, name, stationId (FK Station, l'hôte), track, trackLayout?, cars (String[]), maxClients (défaut 10), password?, rconPassword?, config (json), status (stopped|starting|running|error), serverDir?, udpPort?, tcpPort?, httpPort?, startedAt?, endedAt?`.
- **`ContentPreview`**: `id, stationId (FK), type, acId, name, data (base64)`, unique sur `(stationId, type, acId)`.
- **`ContentLabel`** (v2.2.68) : `id, type ('car'|'track'), acId, displayName, createdAt, updatedAt`, unique sur `(type, acId)`. **Global** (pas de FK station — un `acId` désigne le même contenu AC partout), contrairement à `ContentPreview` qui est scopé par station.
- **`BlankingMedia`**: `id, stationId (FK), filename, mimeType, sizeBytes, order`, unique sur `(stationId, order)`.
- **`AppSettings`**: singleton (`id: 'singleton'`), `blankingDelaySeconds (défaut 10)`.

### 3.3 Gotchas backend importants

- `AgentAuthGuard` rejoint la room `station:<stationId>` seulement si le socket n'y est pas déjà. Toute commande vers un agent utilise `this.server.to('station:<id>').emit(...)`.
- **`Session.stationId` est l'UUID interne de `Station` (FK Prisma), pas la `stationId` métier** sur laquelle la room WebSocket de l'agent est nommée. Toujours passer par la relation (`session.station.stationId`) pour émettre vers l'agent — utiliser la `session.stationId` brute émet silencieusement vers une room que personne n'a rejointe (bug trouvé et corrigé dans `sessions.controller.ts`'s `extend()`/`stop()` en v2.2.30 ; `stop()` a aussi eu besoin de `include: { station: true }` dans `sessions.service.ts`). Tous les autres contrôleurs (`stations.controller.ts`, `dedicated-servers.controller.ts`) le font déjà correctement.
- `AGENT_API_KEY_SALT` est validé mais **jamais utilisé** dans le code (SHA-256 en clair).
- `AdminOrStationAuthGuard` accepte soit un JWT admin, soit une clé API station ; importer `AuthModule` (pas `JwtModule` brut) dans le module qui l'utilise, pour que la vérification JWT utilise le bon secret.
- **`emitLaunchDedicatedServer` n'a historiquement aucune vérification/log de socket présent** (contrairement à `emitJoinServer` qui logue le nombre de sockets trouvés) — si l'agent hôte n'est pas connecté, la commande de lancement de serveur dédié disparaît silencieusement, sans aucune trace. Vérifier `getConnectedStationIds()`/les logs backend en cas de serveur bloqué en `starting`.
- **`getUsedPorts()` (dedicated-servers.service.ts) ne filtrait pas par statut avant v2.2.66** — chaque serveur jamais créé gardait son port "réservé" pour toujours, même arrêté, épuisant progressivement les plages `9600-9700`/`8081-8181`. Corrigé : seuls les statuts `starting`/`running` comptent.
- **Un `acServer.exe` qui crashe _après_ son lancement laissait le serveur "running" en base pour toujours, avant v2.2.68** — trouvé en conditions réelles : le process passe les vérifications de lancement (vivant + port UDP bound) puis quitte tout seul ~30s plus tard, sans qu'aucun événement ne remonte. Tout POD qui tente de rejoindre ce serveur "fantôme" reste bloqué avec une mémoire partagée AC gelée pour toujours — même symptôme que "Failed to handshake", cause différente (serveur hôte mort, pas `race.ini` du client). Voir 5.9.
- **Rôles station (`simulator` vs `admin`)**: `Station.role` (enum `StationRole` dans `@simracing/shared`), défaut `simulator`. **Simulator** = POD joueur (peut lancer en direct, peut rejoindre un serveur dédié). **Admin** = PC hébergeur uniquement (peut héberger `acServer.exe`, ne peut ni lancer ni rejoindre). Le frontend filtre déjà (host picker de `CreateDedicatedServer.tsx` ne liste que les `admin` ; picker de join ne liste que les `simulator` ; bouton "Lancer" caché pour les `admin` dans `Stations.tsx`) mais le backend le réapplique systématiquement, donc impossible à contourner via appel API direct.

## 4. Frontend (`apps/frontend`)

- **Stack**: React 18 + TypeScript + Vite + Tailwind 3.4 + TanStack Query + Axios + Socket.IO.
- **Base API**: `import.meta.env.VITE_API_URL` ou `/api`.
- **Temps réel**: `useSocket.ts` se connecte au namespace racine avec le JWT ; écoute `station:updated`, `station:telemetry`, `session:updated`.
- **Auth**: JWT stocké dans `localStorage.accessToken`, `GET /api/auth/me` au montage.
- **Build**: sortie dans `apps/frontend/dist` ; servi par le backend en production.

### 4.1 Routes — liste exhaustive

| Route                             | Composant               | Garde                         | Notes                                                             |
| --------------------------------- | ----------------------- | ----------------------------- | ----------------------------------------------------------------- |
| `/login`                          | `Login`                 | publique                      |                                                                   |
| `/`                               | `Dashboard`             | `ProtectedRoute` (sidebar)    |                                                                   |
| `/stations`                       | `Stations`              | `ProtectedRoute`              |                                                                   |
| `/dedicated-servers`              | `DedicatedServers`      | `ProtectedRoute`              |                                                                   |
| `/dedicated-servers/create`       | `CreateDedicatedServer` | `ProtectedRoute`              |                                                                   |
| `/dedicated-servers/:id/join`     | `JoinServer`            | `ProtectedRoute`              |                                                                   |
| `/leaderboard`                    | `Leaderboard`           | `ProtectedRoute`              | placeholder, jamais implémenté                                    |
| `/en-cours`                       | `Sessions`              | `ProtectedRoute`              |                                                                   |
| `/en-cours/kiosk`                 | `SessionsKiosk`         | `KioskRoute` (pas de sidebar) | mur d'affichage passif, TV/moniteur                               |
| `/kiosk`                          | `Kiosk`                 | `KioskRoute`                  | opérateur tactile, voir 4.3                                       |
| `/kiosk/dedicated-servers/create` | `CreateDedicatedServer` | `KioskRoute`                  | même composant que `/dedicated-servers/create`, `backPath` adapté |
| `/users`                          | `Users`                 | `ProtectedRoute`, admin       |                                                                   |
| `/content-previews`               | `ContentPreviews`       | `ProtectedRoute`, admin       |                                                                   |
| `/content-names`                  | `ContentNames`          | `ProtectedRoute`, admin       | renommage cars/tracks, v2.2.68 — voir 4.2                         |
| `/blanking-media`                 | `BlankingMediaPage`     | `ProtectedRoute`, admin       |                                                                   |
| `/settings`                       | `SettingsPage`          | `ProtectedRoute`, admin       |                                                                   |

`ProtectedRoute` = vérif auth + `Layout` (sidebar). `KioskRoute` = même vérif auth, **sans** `Layout` (plein écran).

### 4.2 Composants/pages clés et leurs subtilités

- **`Layout.tsx`**: rail de navigation icônes-seules révélées au survol ; header avec bouton **"Mode kiosque"** (`Link to="/kiosk"`, même onglet — ne **jamais** remettre `target="_blank"`), horloge, avatar/déconnexion.
- **`Stations.tsx`**: écoute `socket.on('station:updated', ...)` directement dans le render (pas dans un `useEffect`) — provoque des listeners dupliqués ; envelopper dans `useEffect` avant toute modification. Filtre statut ET filtre rôle (Tous types/Simulateurs/Admin), tous deux appliqués ensemble (ET, pas OU). Panneau étendu par station : groupe "Maintenance" (MAJ agent, **Logs** — v2.2.63, Clé API, Supprimer), groupe "Type de poste" (bascule simulator/admin), groupe "Écran" (masquer/afficher blanking, écran d'attente), groupe VR/jeu (ligne idéale, boîte auto, teleport pits, recenter VR).
- **`CreateDedicatedServer.tsx`** (wizard 3 étapes : Simulateur → Circuit → Configuration) :
  - Étape 2 (Circuit) : vignette image par layout (pas juste du texte) — corrige un vrai bug de photos manquantes (v2.2.56).
  - Étape 3 : `carCounts: Record<string, number>` — cliquer sur une voiture l'ajoute (jusqu'à `maxClients`) ; **le tout premier clic (aucune voiture encore sélectionnée) remplit directement tous les slots** (v2.2.66, plus besoin de cliquer sur le bouton "remplir" séparé pour le cas courant d'une seule voiture) ; bouton "remplir tous les slots" au survol pour re-remplir explicitement ; badge de quantité cliquable pour retirer un exemplaire. **Cliquer une voiture différente une fois à pleine capacité ne bloque plus** — `addCar()` prend un slot à la voiture qui en a le plus (au lieu de désactiver le bouton), donc mélanger plusieurs voitures fonctionne juste en cliquant dessus, sans devoir retirer manuellement au préalable. `flattenCarCounts()` transforme les comptes en tableau plat répété — `serverLauncher.ts` cycle ce tableau en round-robin sur `maxClients` slots, donc un tableau à un seul élément remplit déjà tous les slots naturellement côté agent. "Options avancées" (nom, slots, mot de passe, RCON) repliées par défaut, 11 slots par défaut. Grilles circuits/voitures en `max-h-[65vh]` (viewport-relatif, pas un rem fixe) pour bien remplir l'écran sur un affichage kiosque haute résolution. Panneau récapitulatif de droite : grille "sélection d'équipe" (`CarSlotsGrid`) — une tuile par slot occupé (jusqu'à `maxClients`), pas juste un compteur texte ; cliquer une tuile retire cet exemplaire.
  - `backPath` = `/kiosk` si le chemin actuel commence par `/kiosk`, sinon `/dedicated-servers` — pour "Annuler" et après création réussie.
- **`JoinServer.tsx`** (page complète `/dedicated-servers/:id/join`) : cartes PODs façon jeu, plaque nominative par pilote (`ClientNameInput.tsx`, autocomplete sur `Client`), difficulté en 3 cartes descriptives, grille de voitures avec images. `availableCars` **dédupliquée** (`Array.from(new Set(server.cars))`) — un serveur peut avoir des voitures répétées (quantité choisie à la création), mais pour le choix du pilote une seule carte par modèle suffit (corrige un vrai bug de clés React dupliquées → cartes qui se sélectionnaient toutes ensemble, v2.2.66-ish). `durationMinutes` par défaut `undefined` ("Illimité") — cas le plus courant, pas un cas limite. Après "Envoyer" réussi, redirige directement vers `/en-cours` (pas d'écran de succès intermédiaire).
- **`Sessions.tsx`** (`/en-cours`) : `SessionCard` (exporté, réutilisé ailleurs) — bannière avec vignette circuit, nom du pilote en évidence, badges de difficulté colorés, jauges circulaires RPM/vitesse (couleurs de la palette sombre de l'app, pas des gris Tailwind génériques), barres accélérateur/frein, meilleur/dernier tour, temps restant avec barre de progression, boutons prolonger/arrêter, et (si `onCommand` fourni) ligne idéale/boîte auto/retour aux stands.
- **`SessionsKiosk.tsx`** (`/en-cours/kiosk`) : mur passif, grille fixe 5×2 (10 slots max — plafonné aux 10 sessions les plus récemment démarrées, pas de pagination/rotation), cartes compactes cliquables ouvrant la `SessionCard` complète dans une `Modal`. Lien "Accueil" (`/`) et "Gérer les PODs" (`/kiosk`) dans le header, **même onglet**.
- **`Kiosk.tsx`** (`/kiosk`, vue opérateur tactile, pas de sidebar) :
  - Onglets Serveurs / **Postes** (Postes par défaut).
  - **Onglet Postes**: grille fixe à **10 slots max** (`MAX_PODS`), stations `admin` **exclues** entièrement, slots vides en pointillés si moins de 10 PODs simulateurs. Chaque slot : `PodSessionCell` (compact, cliquable → modal détail complet via `SessionCard`) si en session, sinon `PodAvailableCell` (cliquable, bouton "Envoyer" ou "Créer un serveur" selon qu'un serveur tourne).
  - Cliquer un POD disponible → si 0 serveur actif : navigue vers `/kiosk/dedicated-servers/create` ; si 1 : ouvre directement l'écran d'envoi ; si plusieurs : modal "Choisir un serveur" d'abord.
  - **Écran d'envoi (`SendPodsModal`) en page entière** (pas une `Modal` centrée) — header avec flèche retour, contenu scrollable, footer fixe avec compteur de pilotes + bouton Envoyer.
  - Header : liens "Accueil" (`/`) et "Voir les sessions" (`/en-cours/kiosk`), tous en même onglet.
- **`ClientNameInput.tsx`** (composant partagé, `JoinServer.tsx` + `Kiosk.tsx`) : input pilote avec dropdown de suggestions débattu 250ms sur `GET /clients?search=`.
- **`ContentNames.tsx`** (`/content-names`, admin, v2.2.68) : page de renommage — liste tous les `acId` connus (`GET /content/labels/known`), un input par ligne + bouton Enregistrer (`PUT /content/labels`) + bouton reset (↺, réapparaît si un label existe déjà) qui envoie `displayName: ''` pour revenir au nom technique. Le mapping est résolu **côté client** : `utils/track.ts#formatCarName`/`formatTrackName`/`findTrackName` acceptent maintenant un 3ᵉ paramètre optionnel `labelMap` (prioritaire sur le nom AC brut), alimenté par le hook partagé `useContentLabelMap()` (`services/contentLabels.ts`, React Query, clé `['content-labels-map']` — un seul fetch réseau même appelé depuis plusieurs composants). Câblé dans `CreateDedicatedServer.tsx`, `JoinServer.tsx`, `Kiosk.tsx`, `Sessions.tsx`, `SessionsKiosk.tsx`, `DedicatedServers.tsx` — partout où un nom de voiture/circuit est affiché. L'acId technique brut reste visible en légende secondaire (pas masqué, juste plus discret) dans les grilles de sélection.

## 5. Agent (`apps/agent`)

- **Entrée**: `src/index.ts`. Packagé avec `pkg`, cible `node18-win-x64`.
- **Config**: `.env` à côté de l'exécutable (`path.dirname(process.execPath)`, jamais `process.cwd()`). Auto-généré si absent.
- **Auth**: auto-provisioning si `API_KEY` vide ; connexion au namespace `/agent`.
- **Réseau**: `io(SERVER_URL + '/agent', { transports: ['websocket'], reconnection: false })` — la reconnexion est gérée **manuellement** dans le code de l'agent, pas par socket.io-client (voir gotcha 5.6).

### 5.1 Modules — liste exhaustive

| Fichier                   | Rôle                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `index.ts`                | Point d'entrée, logger pino, gestion SIGINT/SIGTERM                                        |
| `agent.ts`                | Cycle de vie WebSocket, heartbeat, tous les handlers de commandes                          |
| `config.ts`               | Chargeur `.env` validé par Zod                                                             |
| `network.ts`              | IP locale, adresse MAC, adresse de broadcast                                               |
| `wol.ts`                  | Envoi de paquets magiques Wake-on-LAN (`wake_on_lan`, ports 9 + 7)                         |
| `wolDiagnostics.ts`       | Vérifie les prérequis WoL Windows au démarrage (Fast Startup, réglages adaptateur)         |
| `contentScanner.ts`       | Scanne `content/cars` et `content/tracks`                                                  |
| `contentCache.ts`         | Cache de scan de contenu, `CACHE_VERSION` à bumper si le format change                     |
| `contentSync.ts`          | Orchestration de la synchronisation de contenu vers le backend                             |
| `serverLauncher.ts`       | Lance `acServer.exe` (serveur dédié)                                                       |
| `acLauncher.ts`           | Lance AC/Content Manager (direct ou join)                                                  |
| `acPathResolver.ts`       | Résout le chemin d'installation d'Assetto Corsa                                            |
| `cmLocator.ts`            | Localise `Content Manager.exe`                                                             |
| `dialogs.ts`              | Prompts natifs (ex: demander le chemin CM)                                                 |
| `luaBridge.ts`            | Écrit les fichiers de commande pour l'app Lua embarquée                                    |
| `acSharedMemoryReader.ts` | Lit la mémoire partagée AC (`acpmf_physics/graphics/static`) via koffi, télémétrie live    |
| `acSharedMemory.ts`       | Vérification PowerShell de présence + fraîcheur de la mémoire partagée (signal `acLoaded`) |
| `telemetryReceiver.ts`    | Fallback UDP/HTTP (127.0.0.1:19900/19901) depuis l'app Lua CSP                             |
| `telemetryFileReader.ts`  | Fallback fichier JSON écrit par l'app Lua CSP                                              |
| `raceResultReader.ts`     | Lit `Documents/Assetto Corsa/out/race_out.json` en fin de session                          |
| `raceResultCleaner.ts`    | Nettoie le JSON de résultats brut                                                          |
| `lapTelemetryRecorder.ts` | Enregistre `laps.csv` par session, upload en fin de session                                |
| `blankingManager.ts`      | Gestion complète de l'écran de blanking/résultats/lancement                                |
| `blankingMediaSync.ts`    | Synchronise les médias de blanking par station                                             |
| `kioskManager.ts`         | Mode kiosque pendant une session (masque taskbar, minimise les autres fenêtres)            |
| `processMonitor.ts`       | Vérifie qu'AC tourne réellement (pas juste présent dans `tasklist`)                        |
| `trayManager.ts`          | Icône barre système + fenêtre console locale                                               |
| `logRingBuffer.ts`        | Buffer en mémoire des ~100 dernières lignes de log                                         |
| `logFileStream.ts`        | Flux pino persistant + alimente `logRingBuffer`                                            |
| `updater.ts`              | Auto-mise à jour depuis la dernière release GitHub                                         |
| `watchdogManager.ts`      | Démarre/arrête le processus watchdog indépendant (v2.2.67)                                 |
| `singleInstance.ts`       | Verrou TCP port `33291`, empêche deux instances simultanées                                |
| `autoStart.ts`            | Enregistrement `HKCU\...\Run` si `AUTO_START=1`                                            |
| `envWriter.ts`            | Écrit/persiste des valeurs dans `.env`                                                     |
| `serverReachability.ts`   | Vérifie que le backend est joignable avant d'ouvrir le WebSocket                           |
| `version.ts`              | Généré au build depuis `package.json` (`scripts/write-version.js`)                         |

### 5.2 Assets (scripts PowerShell/VBS embarqués, `apps/agent/assets/`)

- `blanking.ps1` — fenêtre WPF plein écran de blanking/résultats/lancement, `FEATURE_BROWSER_EMULATION` pour rendu IE11.
- `kiosk.ps1` — P/Invoke Win32 pour masquer la taskbar, minimiser les fenêtres, mettre le jeu au premier plan.
- `check-ac-shared-memory.ps1` — vérifie présence + fraîcheur de la mémoire partagée AC.
- `update-agent.ps1` — script de mise à jour (voir 5.7).
- `watchdog.ps1` — processus de surveillance indépendant (voir 5.8).
- `start-agent.vbs` — lanceur silencieux (évite le flash de fenêtre console d'un exécutable `pkg`, qui est une app console par défaut).

### 5.3 Télémétrie

Trois sources, toutes alimentant `onTelemetrySnapshot()` :

1. **Mémoire partagée (primaire, Windows uniquement)** — `AcSharedMemoryReader`, 10 Hz via koffi, ne dépend pas de CSP/Lua UDP.
2. **UDP/HTTP (fallback)** — `TelemetryReceiver`, `127.0.0.1:19900` (UDP) / `19901` (HTTP), pour l'app Lua CSP.
3. **Fichier (fallback)** — `TelemetryFileReader`, `Documents/Assetto Corsa/cfg/SimCenterManager/telemetry.json`.

`onTelemetrySnapshot()` transmet au backend via `agent:telemetry`, met à jour le blanking manager et le suivi du meilleur tour.

### 5.4 Fin de session / résultats

Les trois façons pour une session suivie de se terminer (durée expirée, réduite à 0 via extend, arrêt manuel) passent toutes par `agent.ts#endSession()` :

1. `blankingManager.showResults({ pending: true })` **immédiat** (pilote/voiture/circuit/meilleur tour déjà connus par télémétrie live), écran F1 avec spinner de chargement à la place du classement.
2. Attente ~3s pour `race_out.json`, lecture via `raceResultReader.ts`, nettoyage via `raceResultCleaner.ts`, envoi `agent:results` au backend (stocké dans `Session.result`).
3. `showResults()` rappelé avec le classement final (ou "Classement indisponible"). Sections révélées avec animation échelonnée.
4. Après 60s, retour au blanking automatique.

### 5.5 Blanking — logique de masquage

- **Basée sur la présence du processus AC, pas la télémétrie** (réécrit v2.2.41, après v2.2.29-40 qui chassaient tous le même symptôme via une approche télémétrie jamais totalement fiable). `blankingManager.evaluate()` : `shouldHide = acRunning || acLoaded`. Pas de délai de confirmation "voiture prête".
- **Délai de masquage configurable** (v2.2.42) : `hideDelaySeconds` (défaut 10s), poussé via `settings:updated`.
- **Timing du premier plan kiosque lié au blanking, pas au lancement** (v2.2.46) : `kioskManager.enter()` ne doit **jamais** appeler `revealGame()` directement — seulement via le callback `onGameRevealed` du `BlankingManager`.
- **Crash du processus de blanking ≠ fermeture manuelle** (v2.2.48) : sortie dans les 2s du spawn = traité comme un crash (redémarre, jusqu'à 3 tentatives), pas comme "l'utilisateur a fermé avec Échap".
- **Vérification processus/mémoire partagée, pas juste présence** (v2.2.49-50) : `tasklist /V`, colonne `Status` — "Not Responding" prolongé (5 min) force-tue le zombie mais ne bloque **pas** le statut "en cours" retourné (sinon régression des lancements normaux, v2.2.50). `packetId` de `acpmf_graphics` lu deux fois à 200ms d'écart — s'il n'a pas bougé, la mappe est considérée périmée (session précédente) et ignorée.
- **Garde d'identité par spawn** (v2.2.51) : `startBlanking()` capture `const proc = spawn(...)` localement, chaque handler vérifie `if (this.process !== proc) return` pour éviter qu'un événement `exit` tardif d'une ancienne fenêtre n'écrase la référence vers la nouvelle.
- **Pas de redémarrage inutile** (v2.2.52) : `setPodInGame(true)`/`setAuto()` ne redémarrent la fenêtre que si `resultsHtmlPath`/`launchingHtmlPath` était réellement défini avant.
- **`Topmost` réaffirmé en continu** (v2.2.53) : `DispatcherTimer` toggle `Topmost` toutes les 200ms pour re-trier la fenêtre au-dessus de la bande topmost à chaque insertion concurrente (ex: fenêtre de Content Manager).
- **Écran "Lancement en cours"** (v2.2.54) : `showLaunching(info)`, affiché **avant** `acLauncher.launch()`/`joinServer()`, même mécanisme de rechargement que l'écran de résultats.
- **Réinitialisation atomique du override manuel** (v2.2.36) : `setPodInGame(true)` réinitialise un override périmé (`hide`/`show`) en **une seule étape interne**, pas via un `setAuto()` séparé avant.
- **Fenêtres orphelines après redémarrage** (v2.2.38) : `BlankingManager.shutdown()` force-tue la fenêtre active, appelé depuis `agent.stop()` et depuis l'updater (`onBeforeExit`) avant de sortir ; fichier pid (`<tmp>/simracing-manager/blanking.pid`) permet à `init()` de tuer une fenêtre orpheline d'un crash précédent.
- **Fermeture manuelle** : `Échap` sur la fenêtre de blanking → passe en override `hide`, plus de redémarrage automatique.
- **Ciblage d'écran** : variable d'env `BLANKING_MONITOR` (`1` = principal, `2` = secondaire...).
- **Le rôle station (admin/simulateur) doit atteindre l'agent pour désactiver le blanking sur un poste admin** — `station:role` (et `settings:updated`) est émis au **premier heartbeat** (`isFirstHeartbeat` flag dédié dans `AgentGateway`, pas `handleConnection` — `client.stationId` n'y est jamais renseigné en pratique, et la room-membership seule ne peut pas servir de détecteur de "premier heartbeat" puisque `AgentAuthGuard` a déjà rejoint la room avant que le handler ne s'exécute). `agent.ts#handleStationRole()` appelle `blankingManager.setEnabled(role !== ADMIN)` et persiste `STATION_ROLE` dans `.env`.
- **Blanking doit être affiché AVANT de fermer le jeu, pas après** (v2.2.60) : `blanking.ps1` signale `BLANKING_WINDOW_READY` sur stdout une fois chargé ; l'agent attend ce signal (`waitUntilShown()`, filet de sécurité 4s) avant `quit()`/`stop()`, aussi bien pour un arrêt de session suivie que pour un arrêt direct.
- **Le jeu doit être confirmé au premier plan AVANT que blanking ne se retire, pas après** (v2.2.70) — signalé par l'utilisateur : des fenêtres/dialogues traînant derrière blanking pouvaient flasher à l'écran à la disparition de l'écran d'attente. `evaluate()` appelait `stopBlanking()` puis `onGameRevealed()` en fire-and-forget juste après ; **inversé** via `revealThenStop()` : `KioskManager.revealGame()` (maintenant `Promise<boolean>`, plus un spawn fire-and-forget) re-balaie les fenêtres parasites et vérifie via `GetForegroundWindow()` (dans `kiosk.ps1`) que le jeu est _réellement_ devenu la fenêtre active — pas juste que `SetForegroundWindow` a été appelé, qui peut échouer silencieusement — avant que blanking ne soit réellement retiré, avec jusqu'à 3 tentatives avant d'abandonner (ne bloque jamais indéfiniment). Callbacks synchrones (mocks des tests, ou absence de callback) gardent le comportement exact d'avant ce fix — seule la vraie implémentation asynchrone passe par le chemin de nouvelle tentative.
- **Le balayage de fenêtres ne doit jamais tourner hors session, ni sur un poste admin** (v2.2.71) — signalé par l'utilisateur juste après v2.2.70 : un `hide()` manuel (ex. "Masquer écran" pendant une maintenance, aucune session en cours) déclenchait quand même le balayage "minimiser les autres fenêtres" de `revealThenStop()`, alors qu'il n'y a aucun jeu à révéler dans ce cas. Garde ajoutée dans `revealThenStop()` : le balayage ne se déclenche que si `acRunning || acLoaded` (une session tourne ou charge réellement) **et** `this.enabled` (jamais sur un poste admin, hébergement uniquement — `!this.enabled` déjà utilisé pour désactiver tout l'écran d'attente sur ces postes) ; sinon blanking se retire simplement, sans toucher à rien d'autre.
- **`SetForegroundWindow` peut échouer silencieusement pendant ~1 minute d'affilée** (v2.2.73) — signalé par l'utilisateur ("banling très long, ~1 minute, alors que le jeu était prêt en 10-15s") et confirmé via les logs distants : la mémoire partagée AC atteignait `acLoaded=true` ~13s après le lancement, mais `revealThenStop()` épuisait ses 3 tentatives (chacune avec un budget de 20s dans `Set-GameForeground`) avant d'abandonner — ~71s au total. Cause : Windows refuse silencieusement `SetForegroundWindow` quand l'appelant n'est pas déjà le process au premier plan et n'a pas traité d'entrée utilisateur récente (le cas classique d'un script PowerShell en arrière-plan) — la fenêtre du jeu était pourtant bien trouvée à chaque itération, l'appel échouait juste systématiquement. Fix dans `kiosk.ps1` : nouvelle fonction `Force-SetForeground` qui attache (`AttachThreadInput`) la file d'entrée du thread appelant à celle de la fenêtre au premier plan et à celle de la cible avant d'appeler `SetForegroundWindow` — technique standard qui rend l'appel systématiquement autorisé.
- **Les transitions de blanking (résultats ↔ lancement ↔ attente) pouvaient laisser le bureau flasher 1-2s** (v2.2.73) — `restartIfActive()` tuait la fenêtre PowerShell/WPF actuelle _avant_ d'en relancer une nouvelle ; le démarrage à froid de PowerShell/WPF prend facilement 1-2s pendant lesquelles rien ne couvre l'écran. Remplacé par `crossfadeRestart()` (utilisé par `showResults()`, `showLaunching()`, `setAuto()`, `setMediaPaths()`, `setPodInGame()`) : la nouvelle fenêtre est lancée en premier et sa confirmation `BLANKING_WINDOW_READY` (ou un filet de sécurité 4s) est attendue avant que l'ancienne soit tuée — les deux fenêtres se chevauchent brièvement plutôt que de laisser un trou. `restartIfActive()` a été supprimé (plus aucun appelant).
- **Blanking pouvait réapparaître en pleine session sur un simple faux-positif de détection** (v2.2.76) — signalé en conditions réelles : blanking est réapparu alors que le pilote était bien en course. `acRunning`/`acLoaded` sont re-vérifiés à zéro toutes les ~2s (`tasklist.exe` / mémoire partagée) et peuvent ponctuellement se tromper un seul tick sans changement réel côté jeu ; `evaluate()` réagissait au tout premier faux-positif. Fix : `gameRevealedThisSession` (mis à `true` uniquement quand `revealThenStop()` confirme réellement le jeu au premier plan, remis à `false` à chaque nouvelle session) active un debounce — une fois le jeu confirmé cette session, il faut `MISSING_STREAK_THRESHOLD_DURING_SESSION` (3) vérifications consécutives disant "AC absent" avant que blanking ne réapparaisse (`missingDuringSessionStreak`, remis à 0 dès que `shouldHide` redevient vrai). Aucun changement hors session (l'écran d'accueil doit réagir immédiatement) ni avant la toute première révélation du jeu (l'écran de lancement doit s'afficher normalement).
- **Relancer une session très vite après la précédente pouvait faire réapparaître son écran de résultats en pleine nouvelle partie** (v2.2.77, agent.ts) — deux causes distinctes : (1) `handleJoinServer()` n'annulait pas `resultsTimeout` (le minuteur 60s qui ramène blanking en auto après les résultats) contrairement à `handleLaunch()`, laissant un minuteur périmé actif capable de perturber blanking pendant une nouvelle session démarrée dans cette fenêtre ; (2) `endSession()` enchaîne des attentes longues (`acLauncher.quit()` jusqu'à 15s, puis 3s pour `race_out.json`) avant de re-toucher blanking/statut/kiosque — une session relancée pendant cette fenêtre laissait l'ancien `endSession()` continuer en arrière-plan et écraser l'état de la session **déjà en cours**. Fix : `sessionGeneration`, compteur incrémenté à chaque nouveau démarrage (`handleLaunch`/`handleJoinServer`) ; `endSession()`/`handleStop()` capturent sa valeur au début et la revérifient après chaque attente longue, abandonnant le reste du traitement (juste un warning loggé) si elle a changé entre-temps plutôt que d'écraser l'état de la session déjà en cours. `handleJoinServer()` annule aussi désormais `resultsTimeout` au démarrage.

### 5.6 Réseau / reconnexion

- **`reconnection: false` sur le client socket.io** — la reconnexion est gérée manuellement. Deux points de déclenchement : sur `'disconnect'` (déjà connecté puis coupé) ET sur `'connect_error'` (jamais réussi à se connecter — corrigé en **v2.2.62**, avant ça un `connect_error` isolé pendant un redémarrage backend laissait l'agent bloqué déconnecté indéfiniment). `scheduleReconnect()` coalesce les tentatives multiples dans un seul timer (5s), annulé sur connexion réussie ou re-provisioning.
- **`waitForServerReachable()`** ping `SERVER_URL` (jusqu'à 10s) avant d'ouvrir le WebSocket, log un warning clair si injoignable — aide au diagnostic réseau/DNS.
- **Statut station auto-réparé** (v2.2.43) : `reconcileReportedStatus()` à chaque heartbeat compare l'état réel `acRunning` au dernier statut envoyé, corrige après 2 ticks discordants consécutifs (immédiat à la première observation post-connexion).
- **Chaque reconnexion cassait silencieusement la télémétrie partagée, jusqu'à v2.2.72** — trouvé pendant une re-vérification complète en conditions réelles : `agent.ts`'s handler `socket.on('connect')` recrée un `AcSharedMemoryReader` à chaque reconnexion (Wi-Fi instable, redémarrage backend...), dont le constructeur réenregistrait ses 3 types `koffi.pack(...)` — sauf que le registre de types koffi est **global au process**, pas par instance. La 2ᵉ reconnexion (et toutes les suivantes) jetait `Duplicate type name 'SPageFilePhysics'`, avalé par un `catch` qui logue juste une erreur : toute lecture de télémétrie partagée restait cassée pour le reste de la vie du process, sans autre signal visible (le check "state changed"/`packetId` continue de fonctionner, lui, car indépendant). Fix : les 3 `koffi.pack(...)` sont désormais enregistrés **une seule fois au chargement du module**, pas dans le constructeur — voir `acSharedMemoryReader.ts`.

### 5.7 Mise à jour à distance (`updater.ts` + `assets/update-agent.ps1`)

- Techniciens/admins déclenchent une mise à jour depuis la page Postes (`POST /stations/:id/update-agent` → `system:update` → `handleUpdate()`).
- `Updater.update()` : vérifie la dernière release GitHub, télécharge `sim-center-agent-win.zip`, écrit `update-agent.ps1` (extrait de `assets/`) sur disque, le spawn en détaché, puis `process.exit(0)`.
- **`update-agent.ps1` (durci en v2.2.65 après un échec réel constaté en production)** :
  1. `Wait-Process -Timeout 30` sur le PID de l'ancien agent (PowerShell, pas de boucle cmd.exe — voir bug ci-dessous).
  2. **Sauvegarde** l'exe + `build/` actuels dans `update-backup/` avant d'extraire.
  3. `Expand-Archive -Force` — si ça échoue, **restaure** la sauvegarde plutôt que de laisser un état incohérent.
  4. **Relance toujours** en fin de script (nouvelle version si l'extraction a réussi, ancienne restaurée sinon) — avant ce fix, un échec d'extraction laissait le script s'arrêter net sans jamais relancer, l'agent restant complètement mort jusqu'à une intervention physique.
  5. Toutes les étapes journalisées dans `update-agent.log` à côté de l'exécutable.
- **La MAJ à distance échouait silencieusement dès le téléchargement (v2.2.79)** — signalé par l'utilisateur ("télécharge mais ne fait rien de plus"), confirmé via les logs distants : `EPERM: operation not permitted, open '...\exe\update.zip'`. `update.zip` était écrit sous un nom **fixe**, **à côté de l'exécutable en cours d'exécution** — verrou transitoire Windows Defender (scan temps réel) ou fichier résiduel d'une tentative précédente, dans les deux cas ça bloque **toutes les tentatives suivantes** indéfiniment, sans jamais rien remonter au-delà du log local de l'agent. Fix : `zipPath`/`scriptPath` déplacés dans le dossier temp (même convention que `blanking.ps1`/`kiosk.ps1`), noms **uniques par tentative** (`update-<Date.now()>.zip`), nettoyage best-effort des fichiers résiduels au début de chaque tentative (`cleanupStaleUpdateFiles()`). `finalExePath`/`launcherPath` (les cibles réelles de la mise à jour) restent dans `baseDir`, inchangé. Un échec pousse aussi désormais un `sendLog()` vers les logs backend, pas seulement le log local de l'agent.
- **La mise à jour ne se déclenche jamais automatiquement** — chaque agent doit être mis à jour via le bouton "MAJ agent" du dashboard, ou manuellement (téléchargement + exécution de `sim-center-agent-win-setup.exe`).
- **Un agent qui tourne déjà utilise SON PROPRE `update-agent.ps1` embarqué (l'ancienne version), pas celui de la nouvelle release téléchargée** — si le script de la version installée a un bug non corrigé dans cette version-là, "MAJ agent" échouera de la même façon qu'avant tant que l'agent n'a pas été mis à jour manuellement (setup.exe) au moins une fois pour obtenir le script corrigé.

### 5.8 Watchdog (`watchdogManager.ts` + `assets/watchdog.ps1`, v2.2.67)

- Processus PowerShell détaché et **indépendant** de l'agent — nécessaire car si l'agent lui-même est mort, il ne peut pas s'en apercevoir.
- Démarré par `agent.ts#start()` → `watchdogManager.ensureRunning()`, qui **ne démarre pas de doublon** si un watchdog est déjà vivant (PID tracké dans `<tmp>/simracing-manager/watchdog.pid`, confirmé vivant via `tasklist` en vérifiant que le nom du process est bien `powershell.exe`).
- Boucle : toutes les 20s, vérifie si le process de l'agent tourne (`Get-Process -Name <nom sans extension>`) ; si absent, attend 15s de grâce (tolère une mise à jour/redémarrage légitime en cours), revérifie, puis relance via `start-agent.vbs` si toujours absent.
- **Arrêté explicitement (par PID, `taskkill`) avant tout arrêt volontaire** (`agent.stop()`, `handleUpdate()`, `handleLocalRestart()`) — pour ne jamais entrer en course avec un arrêt/une mise à jour légitime. Le prochain `start()` le réétablit une fois le nouveau processus démarré.
- Journalise dans `watchdog.log` à côté de l'exécutable.
- **Contexte** : ajouté après avoir constaté en conditions réelles qu'une mise à jour ratée laissait les deux stations hors ligne ~90-100s avant de se rétablir seules (grâce au fix 5.7, mais sans garantie pour un futur mode d'échec différent).

### 5.9 Redémarrage local (console de la tray, `handleLocalRestart()`)

- **Avait le même bug cmd.exe que l'updater avant sa correction** — `set /a waitTime+=1` dans un bloc `if (...)` entre parenthèses ne s'incrémentait jamais dans la même itération (les blocs `cmd.exe` évaluent les `%var%` une seule fois, au moment où le bloc est lu). Corrigé (même passe que le watchdog, v2.2.67) avec la même approche PowerShell `Wait-Process`, relance via `start-agent.vbs` (avant : `start "" exe` direct, flash de fenêtre console).

### 5.10 Autres gotchas agent

- `envWriter.ts` doit utiliser `path.dirname(process.execPath)` (jamais `process.cwd()`), sinon l'agent packagé écrit `.env` au mauvais endroit.
- `serverLauncher.ts` utilise des ports dynamiques `9600-9700`/`8081-8181`. Vérifie la disponibilité TCP+UDP avant d'assigner. Ports alloués stockés dans `DedicatedServer.udpPort/tcpPort/httpPort`.
- **Firewall + vérification de port réellement lié (v2.2.58, fix du "Failed to handshake" #1)** : `ensureFirewallRule()` ajoute une règle Windows Firewall unique, programme-wide, pour `acServer.exe` (best-effort, ne bloque jamais le lancement). `waitForPortBound()` vérifie via `netstat -ano -p UDP` que le PID du process possède bien le port avant de considérer le lancement réussi — un process vivant n'est pas la preuve que le port UDP est réellement ouvert (pare-feu, port déjà pris au niveau OS malgré la vérif préalable).
- **`race.ini` du join direct incomplet (v2.2.64, fix du "Failed to handshake" #2, le vrai fix pour le join)** : `writeJoinRaceIni()` n'écrivait que `[RACE]`/`[CAR_0]`/`[REMOTE]`, contrairement à `agent-legacy` (référence connue pour fonctionner) et à `writeRaceIni()` (lancement direct/solo, juste à côté dans le même fichier, qui fonctionne bien) qui écrivent en plus `[AUTOSPAWN]`, `[SESSION_0]`, `[TEMPERATURE]`, `[WEATHER]`, `[WIND]`, `[LIGHTING]` (v2.2.66) et plusieurs champs `[CAR_0]`/`[REMOTE]` (`DRIVERNAME`, `TEAM`, `GUID`, `RESTRICTOR`, `SPECTATOR_MODE`, `SPAWN_POINT`, `NAME`, `__CM_EXTENDED`). Symptôme diagnostiqué via les logs distants (5.11) : `acs.exe` se lance, la mémoire partagée se mappe, mais reste "gelée" en boucle (`packetId` n'avance jamais) — le client n'entre jamais réellement en course. **Confirmé réparé en conditions réelles** (créé un serveur + envoyé un POD réel) : la mémoire partagée passe de "gelée" à "state changed" en ~15s, centaines de paquets de télémétrie reçus en quelques minutes.
- `server:join` envoie `host`, `port`, `httpPort`, `password`, `carAcId`, `track`, `trackLayout`, `serverName`, `durationMinutes?`, `clientName?`, `difficulty?`, `gearbox?`, `sessionId?`.
- `acLauncher.ts` gère le join soit via Content Manager (`acmanager://race/online/join`), soit en direct (`acs.exe` + `race.ini`).
- L'agent ne scanne **pas** activement les process `acServer.exe` en cours — le statut du serveur dédié dépend uniquement de `server:started`/`server:stopped`, ce dernier étant émis soit sur arrêt volontaire, soit sur crash tardif détecté par le listener `exit` du child process (v2.2.68, voir 5.12).
- `pkg` embarque `lua_app/**/*`, `assets/**/*`, `node_modules/koffi/**/*`. Binaires natifs koffi copiés à côté de l'exécutable par `postpackage:win`.
- koffi est **Windows uniquement**. Sur Linux/macOS le lecteur mémoire partagée ne fait rien, la télémétrie retombe sur UDP/HTTP/fichier Lua.
- **Aperçus (previews)**: `contentScanner.ts` envoie les images en base64 brut (jusqu'à 2 Mo/image). DDS converties en PNG via ImageMagick si disponible.
- **Photos de circuits manquantes (v2.2.56)** : un circuit multi-layout a son `ui_track.json`/`preview.png` par layout sous `<track>/ui/<layout>/` (convention standard), pas `<track>/<layout>/` (données 3D, référencées par `models_<layout>.ini`). L'ancien code ne vérifiait que ce dernier chemin. `discoverLayoutNames()`/`findLayoutPreview()` vérifient maintenant les trois conventions. Nécessite une resynchronisation de contenu par POD (bump de `CACHE_VERSION` la force automatiquement).
- **Noms de voitures cassés (v2.2.57)** : même schéma que ci-dessus pour `ui_car.json` (`content/cars/<car>/ui/ui_car.json`, pas `content/cars/<car>/ui_car.json` à la racine). `formatCarName()` en dernier recours si toujours manquant.
- **Gearbox découplé de la difficulté (v2.2.55)** : `configureAssistsIni()` prend un `gearbox: 'MANUAL'|'AUTO'` indépendant, pas juste lié au preset de difficulté. Seulement câblé pour le flow de join serveur dédié, pas le lancement direct.
- **`currentSession.durationMinutes` peut être `null`** (join "Illimité", cas par défaut du frontend) — le suivi de session et l'écran de résultats démarrent quand même ; seul le timer de fin auto est conditionnel à une durée définie.
- **Vérification unique enforcement** : verrou TCP port `33291` au démarrage — une deuxième instance sort immédiatement.
- **Icône barre système + console locale (v2.2.47)** : `TRAY_ICON=1` (défaut pour les nouveaux `.env`) — menu contextuel (basculer blanking, quitter, sync contenu, vérifier MAJ, redémarrer l'agent, ouvrir la console). Console = fenêtre WPF normale (pas kiosque), même pattern `WebBrowser` que `blanking.ps1`, affiche statut live + ~100 dernières lignes de log + les mêmes actions en boutons. Communication via le même mécanisme de fichiers-drapeaux (poll 500ms) + snapshot `console-status.json` écrit à chaque tick de heartbeat.
- **Meilleur tour invalide (cut)** (v2.2.44) : détecté par comparaison seule — si un tour vient d'être complété plus vite que le meilleur valide connu mais n'est pas devenu le nouveau `bestLapMs` officiel, AC l'a rejeté.
- **Auto-start Windows** : `AUTO_START=1` dans `.env` enregistre l'agent dans `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
- Heartbeat inclut `macAddress`. WoL envoyé sur les ports 9 et 7, unicast si IP cible connue sinon broadcast.
- `system:shutdown` lance `shutdown /s /t 0` sur Windows, no-op ailleurs.

### 5.11 Logs distants (v2.2.63)

- Nouveau socket event `logs:request` (serveur→agent) / `agent:logs` (agent→serveur, `{ stationId, lines }`).
- `agent.ts#handleLogsRequest()` renvoie `agentLogRingBuffer.getLines()` (les mêmes ~100 lignes que la console locale).
- Backend : `AgentGateway.requestLogs(stationId, timeoutMs=4000)` — aller-retour promesse/timeout, coalesce les requêtes concurrentes par station, retourne `[]` (jamais de rejet) si la station n'est pas connectée ou ne répond pas dans le délai.
- Endpoint : `GET /api/stations/:id/logs` (voir 3.1).
- Frontend : bouton "Logs" sur `Stations.tsx` (groupe Maintenance) → `LogsModal` (fetch + bouton Actualiser, affichage monospace scrollable).
- **A servi à diagnostiquer en conditions réelles** le bug de `race.ini` de join (5.10) sans accès physique aux PC.
- **Ne gardait que `msg`, perdant tous les champs structurés pino (`code`, `err`, `serverId`...) avant v2.2.68** — ce qui a directement gêné le diagnostic du bug 5.12 (impossible de voir le code de sortie d'`acServer.exe` à distance). `LogFileStream#formatExtras()` ajoute maintenant les champs pertinents en suffixe (`msg (code=1, serverId=...)`), sauf `pid`/`hostname`/`time`/`level`/`msg` (déjà affichés) ; `err.message` est extrait spécifiquement plutôt que d'afficher l'objet entier.

### 5.12 Détection de crash tardif du serveur dédié (v2.2.68)

- **Bug réel trouvé en conditions réelles pendant cette session de re-vérification** : `acServer.exe` passe les vérifications de lancement (`verifyProcessAlive` 2.5s + `waitForPortBound` 5s dans `serverLauncher.ts`) puis **quitte tout seul plus tard** (observé : ~29s après un lancement par ailleurs réussi), sans qu'aucun événement ne remonte nulle part. Le `DedicatedServer` restait `running` en base indéfiniment ; tout POD qui tentait de le rejoindre restait bloqué avec une mémoire partagée AC "gelée" pour toujours — **même symptôme que "Failed to handshake" (5.10), cause différente** (serveur hôte mort, pas `race.ini` du client). Cause racine du crash d'`acServer.exe` lui-même **non identifiée** (pas d'accès au `server.log` de la station à distance) — seule la détection/le signalement du crash est corrigé pour l'instant.
- **Fix** : `ServerLauncher` prend un callback optionnel `onUnexpectedExit(serverId, code)`, appelé depuis le listener `exit` du child process **sauf** si l'arrêt a été déclenché par notre propre `stop()` (tracké via un `Set<string> intentionalStops`, ajouté avant le `kill()` et consommé dans le listener `exit`). `agent.ts` câble ce callback pour émettre `server:stopped` avec un `error`, exactement comme le fait déjà l'échec de lancement — le backend transforme ça en statut `error` (`agent.gateway.ts#handleServerStopped`), ce qui libère aussi le port (`getUsedPorts()`, v2.2.66) et remonte visuellement dans `DedicatedServers.tsx`/`Kiosk.tsx` (badge "error" déjà supporté par les deux, aucun changement frontend nécessaire).
- **Piste de suite si le crash se reproduit** : exposer `server.log` (écrit par `pipeToLog()` dans `serverDir`) via un endpoint dédié, sur le même principe que les logs distants de l'agent (5.11) — pas encore fait, le ring buffer de l'agent ne capture que ses propres logs pino, pas la sortie stdout/stderr d'`acServer.exe`.
- **Cause racine identifiée et corrigée en v2.2.69** : le crash se reproduisait de façon quasi-métronomique, ~29-30s après chaque lancement (2 incidents distincts, dont un avec un vrai client bloqué en plein join). Trop régulier pour un crash aléatoire → `REGISTER_TO_LOBBY=1` dans `server_cfg.ini` (tentative d'enregistrement au lobby public Kunos) suspecté de timeout puis de faire quitter `acServer.exe`. Passé à `REGISTER_TO_LOBBY=0` (ce venue n'a de toute façon aucun besoin d'un serveur listé publiquement, les joueurs rejoignent uniquement via le dashboard) — **confirmé en conditions réelles** : un serveur de test a tourné 90s+ sans crash (vs. ~29-30s avant), et un join réel a produit 32 paquets de télémétrie en 20s. Le filet de sécurité v2.2.68 (signalement de crash) reste en place au cas où ce ne soit pas l'unique cause.
- **Crash _instantané_ (< 1s, code 2) — deux causes distinctes trouvées le même soir, la première était une fausse piste.**
  - **v2.2.74 (fausse piste, gardée car légitime en soi)** : en testant pour la première fois en conditions réelles la fonctionnalité de mix de voitures (grille de sélection ajoutée cette session), `writeServerConfig()` écrivait `CARS=` (le champ qui liste les modèles **distincts** autorisés sur le serveur) directement à partir de `payload.cars`, le tableau brut par-emplacement — qui peut contenir des doublons (une voiture choisie 3 fois → 3 entrées identiques). `CARS=` est maintenant dédupliqué (`[...new Set(carIds)]`) ; `entry_list.ini` (assignation par emplacement, où les doublons sont légitimes) inchangé. **Ce n'était pas la vraie cause** : le crash persistait à l'identique même avec une seule voiture, sur une config qui avait pourtant fonctionné plus tôt le même soir — découvert en isolant les variables une par une (bisection : mix complet → 2 voitures → 1 voiture → config connue-fonctionnelle, échec à chaque fois).
  - **v2.2.75 (cause réelle)** : le `server.log` d'`acServer.exe` (fourni par l'utilisateur, pas d'accès distant à ce fichier) a montré `CreateServer(): ERROR OPENING UDP CONNECTION ... bind 10048` puis `listen tcp :9600: bind: Only one usage of each socket address...` — le port 9600 était déjà occupé. `acServer.exe` ne quitte pas proprement dans ce cas : il continue avec un socket UDP nul puis **panique** (nil pointer dereference Go) dès qu'il essaie de le lire, quelques centaines de ms plus tard — d'où le "code 2" quasi instantané, peu importe la config testée. Cause du port occupé : `ServerLauncher.servers` (la table des process en cours) est **purement en mémoire** — tout serveur lancé par une précédente instance de l'agent (avant une mise à jour, un crash, un redémarrage manuel) n'y a plus d'entrée, donc `stop()` ne le retrouve jamais ("No matching server process to stop") mais le vrai process continue de tourner indéfiniment, squattant son port. Comme chaque lancement retente systématiquement le port 9600 en premier, **tout redémarrage d'agent pendant qu'un serveur dédié tourne casse silencieusement toute création future de serveur**. Fix initial : `ServerLauncher.killOrphanedProcesses()`, appelé une fois au démarrage de l'agent (`taskkill /F /IM acServer.exe`, best-effort) — même principe que `BlankingManager.killOrphanedProcess()` (pidfile) et `AcLauncher.launchAcs()` (`taskkill /F /IM acs.exe` avant chaque lancement).
  - **v2.2.78 (le fix v2.2.75 ne suffisait pas)** : signalé par l'utilisateur après un renommage de contenu ("le serveur ne veut plus lancer") — le rename n'y était pour rien (reproduit avec le contenu renommé exact, succès), c'est le même bug de port squatté qui **recommençait des heures après le dernier redémarrage d'agent**, sans qu'aucun nouveau redémarrage n'ait eu lieu. Le nettoyage v2.2.75 ne tournait qu'**au démarrage de l'agent** — un process orphelin apparu depuis (une tentative de lancement en apparence échouée peut laisser le process vivant) squattait son port indéfiniment jusqu'au prochain redémarrage. Fix : `killOrphanedProcesses()` tourne désormais aussi **avant chaque `launch()`**, pas seulement au démarrage de l'agent, et ne tue plus que les `acServer.exe` non suivis dans `servers` (comparaison par PID via `tasklist /FO CSV`, un `parseCsvLine()` local identique à celui de `processMonitor.ts`) — un serveur légitimement en cours (le modèle de données supporte plusieurs serveurs dédiés simultanés par poste) n'est jamais touché.

## 6. Contrats partagés (`packages/shared`)

Toujours builder ce workspace **avant** backend/agent/frontend si les types/contrats changent.

### 6.1 `AgentToServerEvents` (agent → backend)

`agent:register`, `agent:heartbeat` (`HeartbeatPayload`), `agent:log` (`LogPayload`), `agent:results` (`ResultsPayload`), `agent:status` (`StatusPayload`), `agent:session:ended`, `agent:content`, `agent:telemetry` (`TelemetrySnapshot`), `agent:telemetry:csv` (`TelemetryCsvPayload`), `server:started`, `server:stopped`, `agent:logs` (v2.2.63).

### 6.2 `ServerToAgentEvents` (backend → agent)

`agent:provisioned`, `agent:unauthorized`, `session:launch` (`LaunchSessionPayload`), `session:stop`, `session:extend`, `ac:idealLine`, `ac:autoShifter`, `ac:teleportToPits`, `vr:recenter`, `system:restart`, `system:update`, `system:shutdown`, `wol:send`, `content:sync`, `server:join`, `server:launch` (`LaunchDedicatedServerPayload`), `server:stop`, `blanking:hide`, `blanking:show`, `blanking:mediaUpdated`, `settings:updated`, `station:role`, `logs:request` (v2.2.63).

### 6.3 `ServerToClientEvents` (backend → dashboard/frontend)

`station:updated`, `station:telemetry`, `session:updated`.

### 6.4 Types partagés clés

`HeartbeatPayload`, `LogPayload`, `ResultsPayload`, `TelemetryCsvPayload`, `StatusPayload`, `TelemetrySnapshot`, `LaunchSessionPayload`, `LaunchDedicatedServerPayload`. Enums : `StationRole` (`SIMULATOR`, `ADMIN`), `StationStatus`, `LaunchMode`, `SessionStatus`, `GearboxMode`.

- Historique dead-code cleanup (v2.2.40/41) : `HeartbeatPayload.cmRunning`/`vrConnected` étaient toujours `false`, jamais consommés — supprimés du contrat et de l'agent.
- Changer un contrat oblige à rebuilder tous les workspaces qui en dépendent.

## 7. Build & déploiement

### 7.1 Ordre de build en dev

```bash
cd /root/sim-center-manager
npm ci
npx prisma generate --schema=apps/backend/prisma/schema.prisma
npm run build --workspace=@simracing/shared
npm run build --workspace=@simracing/backend
npm run build --workspace=@simracing/frontend
npm run build --workspace=@simracing/agent
```

### 7.2 Déploiement production

```bash
npx prisma migrate deploy --schema=apps/backend/prisma/schema.prisma
docker compose up -d --build backend
```

L'image backend copie le `dist/` et `node_modules` pré-buildés depuis l'hôte. **Ne jamais** builder Docker depuis un checkout propre sans avoir buildé les workspaces avant.

**Chaque redémarrage du conteneur backend déconnecte tous les agents** — avec le fix v2.2.62, ils se reconnectent automatiquement (retry sur `connect_error` en plus de `disconnect`). Les agents antérieurs à v2.2.62 peuvent rester bloqués déconnectés et nécessiter un redémarrage manuel.

### 7.3 Packaging de l'agent

```bash
cd apps/agent
npm run package:win      # → exe/agent.exe + exe/build/koffi/win32_x64/*.node
```

`package:win` = `prepackage:win` (build + patch koffi) → `pkg . --targets node18-win-x64 --out-path exe` → `postpackage:win` (copie `koffi.node`/`.lib`/`.exp`).

Distribution : `sim-center-agent-win-setup.exe` (SFX 7-Zip, installation manuelle) et `sim-center-agent-win.zip` (utilisé par l'auto-updater, remplace exe + `build/koffi/win32_x64/`).

### 7.4 Processus de release

1. Bump la version dans `apps/agent/package.json` (source de vérité).
2. Mettre à jour `CHANGELOG.md` (et ce fichier si architecture/build/déploiement a changé).
3. Builder shared → backend → frontend → agent.
4. Commit, tag `vX.Y.Z`, push : `git push origin main --tags`.
5. Le workflow GitHub Actions `Release SimCenter Agent` build Windows + Linux et publie sur la release automatiquement.
6. Redéployer l'image Docker backend + appliquer les migrations si le backend a changé.

### 7.5 Déploiement post-release

**Backend/frontend** (côté serveur) :

```bash
cd /root/sim-center-manager
git pull && npm ci
npm run build --workspace=@simracing/shared
npm run build --workspace=@simracing/backend
npm run build --workspace=@simracing/frontend
docker compose up -d --build backend
```

**Agent** (côté PC Windows) : télécharger `sim-center-agent-win-setup.exe` depuis la release GitHub, l'installer sur chaque POD (écrase l'agent précédent + binaires natifs), redémarrer, vérifier la version dans les logs/heartbeat.

### 7.6 Pièges du processus de release

- **L'asset Windows arrive après le Linux** — jobs parallèles, le job Windows (choco 7zip, pkg, packaging SFX) prend plus longtemps. Si seul le `.tar.gz` apparaît juste après le push du tag, attendre quelques minutes.
- **Toujours tester l'exe packagé sur Windows avant de publier** — `pkg` peut réussir à builder mais échouer à l'exécution avec `MODULE_NOT_FOUND` pour des fichiers requis dynamiquement.
- L'asset Windows est un **installeur auto-extractible** — ne jamais distribuer le `.exe` nu seul (le module natif koffi doit être extrait avec).
- Vérifier le hash/la taille de l'asset uploadé — le CDN peut servir un ancien asset en cache (`?nocache=<ts>`).
- Ne **jamais** release le build `agent-legacy/`.
- Si frontend/backend a changé, l'image Docker doit être rebuildée et le conteneur redémarré — releaser seulement l'agent `.exe` ne suffit pas.
- **La mise à jour de l'agent ne se déclenche jamais automatiquement** — chaque POD doit être mis à jour via "MAJ agent" ou manuellement.
- **Un agent qui échoue sa mise à jour utilise son propre script embarqué** (voir 5.7) — retenter "MAJ agent" avec la même version installée répétera le même échec ; installer manuellement le nouveau setup.exe contourne le problème.

## 8. Dépannage

### "Stop" ou "0 seconde" ne fait rien

1. Vérifier que le backend est déployé (boutons frontend appellent `POST /sessions/:id/stop`/`extend`).
2. Vérifier la version de l'agent sur le POD.
3. Logs : `docker compose logs -f backend` (backend), fichier log local ou console tray (agent).
4. Causes fréquentes : `dist/` frontend pas rebuildé avant l'image Docker ; `.exe` agent pas remplacé ; asset CDN en cache.

### L'écran de blanking ne se retire pas / reste bloqué

- Vérifier `stations.blanking_active` et les logs de heartbeat.
- Un process/mapping périmé peut faire `shouldHide = true` à tort (voir 5.5) — indépendant du délai/timer.
- Un poste `admin` ne doit **jamais** afficher de blanking — vérifier que `station:role` a bien atteint l'agent (log `"Sent settings:updated + station:role"` côté backend).

### Écran de blanking impossible à fermer

- `Échap` en focus sur la fenêtre pour fermer localement.
- Bouton "Masquer écran" dans Stations.
- Vidéos qui ne jouent pas : convertir en H.264 MP4 (codecs limités du `MediaElement` WPF).

### "Failed to handshake" en rejoignant un serveur dédié

1. Vérifier que le serveur dédié est bien `running` (pas coincé en `starting` — voir gotcha `emitLaunchDedicatedServer` en 3.3, et vérifier que l'agent hôte est bien connecté).
2. Vérifier les ports réellement liés côté hôte (fix v2.2.58 — pare-feu + `waitForPortBound`).
3. Récupérer les logs de l'agent joueur à distance (`GET /stations/:id/logs`, ou bouton "Logs") juste après la tentative — chercher "AC shared memory is mapped but frozen" en boucle (signe que le `race.ini` de join est incomplet, voir fix v2.2.64/5.10) versus "state changed" (succès).
4. Vérifier qu'aucune télémétrie n'arrive côté backend (`docker compose logs backend | grep "Telemetry snapshot received"`) — zéro = le client n'est jamais réellement entré en course.

### Un agent reste hors ligne après un redéploiement backend ou une "MAJ agent"

1. Vérifier la version de l'agent dans `stations.version` — s'il est antérieur à v2.2.62, il peut rester bloqué déconnecté après un simple redémarrage backend (bug de reconnexion corrigé en v2.2.62) et nécessiter un redémarrage manuel.
2. Si c'est après "MAJ agent" et que l'agent reste bloqué plus d'une minute ou deux : voir 5.7 (script de mise à jour, fix v2.2.65) et 5.8 (watchdog, v2.2.67, censé relancer automatiquement après ~35s si tout le reste échoue).
3. Un agent qui échoue sa mise à jour retentera le même échec avec "MAJ agent" tant qu'il n'a pas été mis à jour manuellement une fois (voir 5.7, dernier point).

## 9. Checklist de test

Après un changement agent/backend, vérifier :

- [ ] `sim-center-agent-win.exe` packagé démarre sans `MODULE_NOT_FOUND` sur Windows.
- [ ] L'agent se provisionne et apparaît `online` sur la page Postes.
- [ ] Le heartbeat maintient la station en ligne, l'adresse MAC apparaît dans Paramètres.
- [ ] Le scan de contenu montre les voitures/circuits pour la station, `content_previews` peuplé.
- [ ] Créer un serveur dédié lance réellement `acServer.exe` sur l'agent (statut passe à `running`).
- [ ] Les ports de serveurs dédiés sont uniques par hôte, et se libèrent quand le serveur est arrêté (pas d'incrémentation infinie).
- [ ] La commande de join atteint l'agent et lance CM/AC avec la bonne voiture/circuit — la télémétrie arrive réellement côté backend (pas juste le process qui se lance).
- [ ] Télémétrie mémoire partagée live sur `/en-cours` quand AC tourne (Windows).
- [ ] Fin de session pousse `race_out.json` au backend, stocké dans `Session.result`.
- [ ] Classement affiché sur l'écran de blanking (position, pilote, voiture, tours, meilleur tour).
- [ ] Démarrer une deuxième instance de l'agent sur le même POD se termine au lieu de créer une connexion dupliquée.
- [ ] `AUTO_START=1` enregistre l'agent au démarrage Windows et il se lance à la prochaine connexion.
- [ ] `TRAY_ICON=1` affiche l'icône barre système, menu fonctionnel (basculer blanking/quitter).
- [ ] Après une session, `laps.csv` existe et est uploadé sur `uploads/telemetry/<sessionId>.csv`.
- [ ] Arrêter un serveur ne termine que le bon process.
- [ ] "MAJ agent" (`system:update`) télécharge et redémarre depuis la dernière release ; en cas d'échec d'extraction, l'agent relance quand même (ancienne version) au lieu de rester mort.
- [ ] Le watchdog relance l'agent s'il est tué manuellement (attendre ~35-40s) — et **ne** le relance **pas** après un arrêt volontaire (quitter depuis la tray, ou "MAJ agent"/redémarrage local en cours).
- [ ] Wake-on-LAN fonctionne via un POD relais en ligne sur le même sous-réseau.
- [ ] Arrêt distant éteint bien le POD Windows cible.
- [ ] Rejoindre un POD **sans** durée ("Illimité") : masque le blanking une fois la voiture prête, affiche le classement à l'arrêt, peut recevoir une durée après coup via extend.
- [ ] Lancer une session (direct ou join) affiche l'écran "Lancement en cours" (pilote/voiture/circuit) avant la fenêtre du jeu, sans flicker.
- [ ] Un lancement/join raté retombe sur l'écran d'attente classique plutôt que de rester bloqué sur "Lancement en cours".
- [ ] "Automatique" sur l'écran de join force `AUTO_SHIFTER=1` même en Pro/Custom ; "Manuelle" force `AUTO_SHIFTER=0` même en Easy.
- [ ] Envoyer des PODs depuis `JoinServer.tsx`/`Kiosk.tsx` redirige vers `/en-cours` (ou reste dans le mode kiosque) et les sessions apparaissent immédiatement.
- [ ] `/en-cours/kiosk` montre jusqu'à 10 PODs en grille 5×2 sans sidebar ; au-delà, seuls les 10 plus récents.
- [ ] `/kiosk` (Postes) montre une grille fixe de 10 slots, stations admin exclues, slots vides en pointillés.
- [ ] Sélectionner une seule voiture à la création d'un serveur remplit tous les slots directement.
- [ ] Le sélecteur de voiture à l'envoi d'un POD ne montre chaque modèle qu'une fois, même si le serveur a des doublons.
- [ ] Le champ pilote propose l'autocomplete sur les clients existants et relie la session au bon `Client` (créé si nouveau).
- [ ] Le bouton "Logs" (page Postes) récupère bien les logs d'un agent connecté, revient vide proprement si déconnecté.
- [ ] Une seule fenêtre de blanking/résultats visible à la fois — redémarrer l'agent (ou "MAJ agent") deux fois de suite ne duplique rien.
- [ ] Pendant une session, la taskbar est masquée, le jeu au premier plan, les autres fenêtres pré-lancement minimisées. Se termine avec la session.
- [ ] Créer un serveur dédié rejette une station `simulator` comme hôte ; rejoindre rejette une station `admin` comme POD.
- [ ] Les liens "Mode kiosque"/"Accueil" naviguent dans le même onglet, jamais un nouveau.

## 10. Commandes courantes

```bash
# Logs backend
docker compose logs -f backend

# Shell base de données
docker exec -it simracing-postgres psql -U simracing -d simracing

# Migration Prisma (dev)
npx prisma migrate dev --schema=apps/backend/prisma/schema.prisma

# Migration Prisma (deploy)
npx prisma migrate deploy --schema=apps/backend/prisma/schema.prisma

# Agent en dev (Linux, sans koffi)
npm run dev --workspace=@simracing/agent

# Frontend en dev
npm run dev --workspace=@simracing/frontend

# Statut des stations (accès direct DB)
docker exec -i simracing-postgres psql -U simracing -d simracing -c "select name, version, status, last_seen_at from stations;"

# Statut du dernier build de release agent
gh run list --workflow="Release SimCenter Agent" --limit 1

# Assets d'une release
gh release view vX.Y.Z --json assets -q '.assets[].name'
```

## 11. Méthodologie de test en conditions réelles (établie pendant cette session)

- **Compte de test jetable** : jamais forger un JWT pour se connecter en tant qu'utilisateur réel existant (bloqué explicitement, ne pas contourner). À la place : créer un compte admin jetable via insertion SQL directe + hash bcrypt, l'utiliser pour les appels API de test, **toujours le supprimer après** (`DELETE FROM users WHERE email = 'claude-test@simracing.local'`).
  ```bash
  node -e "const bcrypt=require('bcryptjs'); bcrypt.hash('MotDePasseAléatoire!',10).then(h=>console.log(h))"
  docker exec -i simracing-postgres psql -U simracing -d simracing -c "INSERT INTO users (id, email, password, role, created_at, updated_at) VALUES (gen_random_uuid(), 'claude-test@simracing.local', '<hash>', 'admin', now(), now());"
  TOKEN=$(curl -s -X POST http://127.0.0.1:3002/api/auth/login -H 'Content-Type: application/json' -d '{"email":"claude-test@simracing.local","password":"<motdepasse>"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).accessToken))")
  ```
- **Créer/rejoindre un vrai serveur dédié n'est pas anodin** — ça déclenche des actions physiques réelles sur les PC de production (lance `acServer.exe`, ouvre Content Manager/AC sur le POD, bascule le blanking/kiosque). Ne le faire qu'avec une autorisation explicite de l'utilisateur, et **toujours nettoyer après** (arrêter la session puis le serveur, supprimer les `Client`/comptes de test créés).
- **Vérifier un join réussi** : `GET /stations/:id/logs` sur le POD joueur — chercher la transition "AC shared memory is mapped but frozen" (répété) → "AC shared memory state changed" (succès), et confirmer côté backend avec `docker compose logs backend | grep -c "Telemetry snapshot received"` (des centaines en quelques minutes = succès réel, zéro = handshake raté).
- **Frontend** : test Playwright via `/root/jobsync/node_modules/playwright`, `executablePath: '/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'`, `args: ['--no-sandbox']`. Éditer temporairement `apps/frontend/vite.config.ts` (proxy `3000`→`3002` pour pointer vers le backend Docker réel), `npm run dev --workspace=@simracing/frontend` en arrière-plan, puis **toujours** `git checkout -- apps/frontend/vite.config.ts` après.
- **Attendre un build GitHub Actions** : `gh run list --workflow="Release SimCenter Agent" --limit 1`, en tâche de fond avec un polling de quelques secondes, jamais de `sleep` long en avant-plan.
- **Toujours vérifier le déploiement réel**, pas juste "ça marche en local" : comparer le hash du bundle JS servi (`curl http://127.0.0.1:3002/ | grep -o 'index-[a-zA-Z0-9]*\.js'`) avec celui du build local, et `curl` le contenu du bundle pour confirmer qu'une chaîne de caractères du nouveau code y est bien présente.

## 12. En modifiant ce projet

- Garder les changements minimaux et alignés avec les patterns NestJS/React existants.
- Mettre à jour les contrats `@simracing/shared` **avant** backend/agent lors de l'ajout d'un événement WebSocket.
- Toujours `npm run build --workspace=@simracing/shared` après un changement de code partagé.
- Après un changement de schéma Prisma, générer une migration et l'appliquer (`prisma migrate dev` en local, `deploy` en prod).
- Mettre à jour ce fichier (et `.kimi/skills/simracing-manager/SKILL.md`, sa copie miroir, et `CHANGELOG.md`) à chaque changement d'architecture, d'étape de build ou de déploiement.
- Ne jamais forger de JWT pour usurper un compte utilisateur réel existant — créer un compte de test jetable à la place.
- Toute action ayant un effet physique réel sur le matériel de production (lancer un serveur, rejoindre un POD, déclencher une mise à jour/redémarrage d'agent) nécessite une autorisation explicite de l'utilisateur, et doit être nettoyée après usage.
