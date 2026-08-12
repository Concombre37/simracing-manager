# SimRacing Manager — Project Notes

Connaissance complète et exhaustive du monorepo `simracing-manager`, à jour au **`v2.2.131`**. Ce fichier est chargé automatiquement par Claude Code (contexte de projet) et sert de source de vérité — le tenir à jour à chaque changement d'architecture, d'endpoint, de contrat WebSocket, de build ou de déploiement.

## 1. Vue d'ensemble

- **Repo local**: `/root/sim-center-manager`
- **GitHub**: `Concombre37/simracing-manager`
- **Production**: `https://simracing.hytlabs.com` (derrière Cloudflare Tunnel — voir mémoire `hytlabs-cloudflare-tunnel`)
- **Architecture**: NestJS 10 (backend) + React 18/Vite (frontend) + agent Windows Node.js (`pkg`), le tout en npm workspaces.
- **Version de référence**: l'agent (`apps/agent/package.json`) — `2.2.130`. Les autres `package.json` (`root`, `backend`, `frontend`, `shared`) restent à `2.2.14` et ne sont **pas** des indicateurs fiables de version produit.
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
- `GET /sessions/history` (admin/technician, v2.2.102) — sessions `finished` uniquement, triées par date desc, pagination par `cursor` (id de la dernière ligne reçue) + `limit` (défaut 50, max 200). Champs résumés seulement (pas le détail complet) — alimente `SessionHistory.tsx`.
- `GET /sessions/:id` (admin/technician, v2.2.102) — détail complet d'une session, voir `session-detail.ts` (3.3). **Doit rester déclaré après** `station/:stationId`, `active` et `history` dans le contrôleur (routes littérales enregistrées avant le `:id` générique, sinon Nest matcherait `:id` en premier).
- `POST /sessions/:id/extend`
- `POST /sessions/:id/stop`

**`ApiKeysController` (`/api/api-keys`, admin, v2.2.102)**

- `GET /api-keys` — liste (préfixe uniquement, jamais le secret)
- `POST /api-keys` (body `{name}`) — crée, renvoie le secret en clair **une seule fois**
- `POST /api-keys/:id/revoke` — désactive sans supprimer (historique conservé)
- `DELETE /api-keys/:id` — supprime définitivement

**`ExternalApiController` (`/api/external/v1`, v2.2.102)**

- Surface en lecture seule pour un consommateur externe (site web, bot Discord, la tablette client `/tablet-menu`...), authentifiée par clé API dédiée (`ExternalApiKeyGuard`, en-tête `X-Api-Key` ou `Authorization: Bearer`) — **jamais** le JWT dashboard.
- `GET /external/v1/leaderboard` — identique à `GET /leaderboard`.
- `GET /external/v1/sessions` — identique à `GET /sessions/history`.
- `GET /external/v1/sessions/:id` — identique à `GET /sessions/:id`.
- `GET /external/v1/content` (v2.2.117, champs étendus v2.2.118) — `ContentLabelsService.getCatalog()` : catalogue voitures/circuits agrégé sur tous les postes (dédupliqué par `acId`), avec image (`ContentPreview`) et tags (`ContentLabel`: catégorie/difficulté/année/pays/code pays/description). Consommé par `/tablet-menu`.
- `GET /external/v1/menu` (v2.2.117) — `MenuService.listGrouped()` : carte resto/bar groupée par catégorie. Idem.

**`MenuController` (`/api/menu`, v2.2.117)**

- `GET /menu` (admin/technicien) — catégories (`section: 'food'|'drinks'`) avec leurs items, triés par `sortOrder` puis `createdAt`.
- `POST/PATCH/DELETE /menu/categories[/:id]` (admin).
- `POST/PATCH/DELETE /menu/items[/:id]` (admin) — `price` en texte libre ("9,50 €"), juste affiché, aucun calcul.
- Consommé par la page admin `Menu.tsx` (`/restaurant-menu`) et, en lecture, par `/tablet-menu` via `ExternalApiController`.

**`RaceFormatsController` (`/api/race-formats`, v2.2.115)**

- `GET /race-formats` / `GET /race-formats/:id` (admin/technician — la lecture doit rester accessible au technicien, utilisée par le sélecteur de l'assistant de création de serveur)
- `POST /race-formats` / `PATCH /race-formats/:id` / `DELETE /race-formats/:id` (admin)
- Au moins une session (`practiceEnabled`/`qualifyingEnabled`/`raceEnabled`) doit rester activée — validé par `.refine()` côté DTO de création (payload complet), et service-side sur le **résultat fusionné** pour `update()` (payload partiel, impossible de valider avant d'avoir fusionné avec l'existant).
- `RaceFormatsService.toConfig()` convertit une ligne DB en `RaceFormatConfig` (`@simracing/shared`) — c'est cet objet, pas l'entité `RaceFormat`, qui voyage jusqu'à l'agent dans `LaunchDedicatedServerPayload.raceFormat`.

**`DedicatedServersController` (`/api/dedicated-servers`)**

- `POST /dedicated-servers` (admin) — rejeté (400) si la station hôte n'a pas `role: 'admin'`, **et** si `raceFormatId` ne correspond à aucun `RaceFormat` existant (validé avant toute écriture, voir `RaceFormatsService.findOne()`).
- `GET /dedicated-servers` (admin/technician)
- `GET /dedicated-servers/:id` (admin/technician)
- `PATCH /dedicated-servers/:id` (admin)
- `DELETE /dedicated-servers/:id` (admin)
- `POST /dedicated-servers/:id/stop` (admin)
- `POST /dedicated-servers/:id/join` (admin) — envoie une liste de PODs ; tout POD dont la station n'a pas `role: 'simulator'` est ignoré (warning loggé, pas d'erreur bloquante). Body par POD : `stationId`, `carAcId`, `clientName?`, `difficulty?` (`EASY|PRO|CUSTOM`), `gearbox?` (`MANUAL|AUTO`). `clientName`, s'il est fourni, déclenche un find-or-create dans `Client` (insensible à la casse) et relie `Session.clientId`.

**`ClientsController` (`/api/clients`, v2.2.63)**

- `GET /clients?search=` (admin/technician) — jusqu'à 10 résultats, `contains` insensible à la casse, utilisé par l'autocomplete `ClientNameInput.tsx`.

**`LeaderboardController` (`/api/leaderboard`, v2.2.102)**

- `GET /leaderboard` (admin/technician) — agrège tous les `Session` `status:'finished'` avec un `result` (race_out.json nettoyé) exploitable, groupés par `(track, trackLayout)` puis par `carAcId`. Pour chaque session, le meilleur temps retenu est le **tour le plus rapide sans coupure** (`cuts === 0` dans `result.sessions[].laps[]`) — un tour coupé n'entre jamais dans le classement, quitte à laisser un groupe vide (le circuit/voiture n'apparaît alors simplement pas). Renvoie par circuit : image (`ContentPreview` type `track`), compteurs (sessions/pilotes/voitures), le record absolu toutes voitures (`recordGapMs` = écart au 2ᵉ meilleur temps, `null` si une seule voiture classée), et par voiture le top 3 (+ `totalEntries` pour l'excédent) avec image (`ContentPreview` type `car`). `sessionType` par entrée = nom de la session AC (Practice/Qualifying/Race) où le tour a été réalisé, lu directement dans `result`, pas une info inventée. Les images sont résolues une seule fois pour tout le payload (`ContentPreview` n'est pas scopé à un poste ici, contrairement au wizard de création de serveur — n'importe quel poste ayant scanné le circuit/la voiture fournit l'image).

**`ContentController` (`/api/content`)**

- `POST /content/packages`
- `GET /content/catalog`
- `GET /content/packages/:id/download`

**`ContentPreviewsController` (`/api/content/previews`)**

- `GET /content/previews`
- `GET /content/previews/:id`
- `DELETE /content/previews/:id`

**`ContentLabelsController` (`/api/content/labels`, v2.2.68)**

- `GET /content/labels/known` (admin) — agrège tous les `acId` de voitures/circuits déjà vus dans `Station.content` (toutes stations confondues, dédupliqués), joints avec le `ContentLabel` existant s'il y en a un. Depuis v2.2.117, renvoie aussi `category`/`difficulty` ; depuis v2.2.118, renvoie aussi `year`/`country`/`countryCode`/`description`.
- `GET /content/labels/map` (tout utilisateur authentifié) — `{ car: Record<acId, displayName>, track: Record<acId, displayName> }`, consommé par le hook frontend `useContentLabelMap()`.
- `PUT /content/labels` (admin) — upsert `{ type: 'car'|'track', acId, displayName, category?, difficulty?, year?, country?, countryCode?, description? }`. Jusqu'en v2.2.116, `displayName` vide supprimait la ligne (retour au nom technique) ; **depuis v2.2.117 (étendu v2.2.118), la ligne n'est supprimée que si tous les champs sont vides à la fois** — sinon vider juste le nom personnalisé effacerait aussi le reste déjà renseigné (`ContentLabelsService.upsert()`).
- `ContentLabelsService.getCatalog()` (v2.2.117, pas exposé sur ce contrôleur — utilisé par `ExternalApiController`) : même agrégation que `getKnown()`, enrichie de l'URL de preview (même principe que `LeaderboardService.loadPreviewMap()`) et scindée `{ cars, tracks }`.

**`BlankingMediaController`** (3 catégories — `idle`/`launching`/`results`, via `?category=` en query, défaut `idle`. Depuis v2.2.96, `idle` seule reste per-station ; `launching`/`results` sont globales, voir routes `/blanking-media/global*`)

- `GET /stations/:id/blanking-media?category=` (en pratique n'est plus appelé qu'avec `category=idle`)
- `POST /stations/:id/blanking-media?category=`
- `PATCH /stations/:id/blanking-media/reorder?category=`
- `DELETE /stations/:stationId/blanking-media/:mediaId` (pas de `category` — `mediaId` déjà unique globalement)
- `GET /blanking-media/global?category=launching|results` (v2.2.96, `AdminOrStationAuthGuard` — n'importe quel agent authentifié peut lire, pas besoin de matcher une station précise)
- `POST /blanking-media/global?category=launching|results` (admin)
- `PATCH /blanking-media/global/reorder?category=launching|results` (admin)
- `DELETE /blanking-media/global/:mediaId` (admin)
- `POST /blanking-media/bulk` — upload un fichier vers plusieurs stations (catégorie `idle` uniquement en pratique), `category` en champ de formulaire
- `GET /blanking-media/:id/download` — fonctionne pour un média per-station ou global, pas de distinction (lookup par `id` seul)

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
- **`ContentPreview`**: `id, stationId (FK), type, acId, name, data (base64)`, unique sur `(stationId, type, acId)`. `type` est une chaîne libre, pas un enum : `car`, `track`, `track-layout` (preview par variante de circuit multi-layout, v2.2.56) et depuis v2.2.128 `layout` (le vrai schéma de tracé `outline.png`, `acId` = celui du circuit — voir 4.2 "Schéma de circuit").
- **`ContentLabel`** (v2.2.68) : `id, type ('car'|'track'), acId, displayName, category? (texte libre, ex "GT3", v2.2.117), difficulty? (1-5, v2.2.117), year? (v2.2.118), country?/countryCode? (nom + ISO 3166-1 alpha-2 pour l'emoji drapeau, v2.2.118), description? (v2.2.118), powerHp?/weightKg? (chevaux/kg, v2.2.120), maxSpeedKmh? (v2.2.130), mirrored (booléen, défaut false, v2.2.123 — miroir horizontal CSS appliqué sur /tablet-menu, jamais un retournement des pixels stockés, qui serait annulé à la prochaine resynchronisation de contenu depuis un poste), visible (booléen, défaut true, v2.2.124 — décoché retire l'item du catalogue public /tablet-menu sans toucher au reste de ses données), layoutImage? (base64, v2.2.125 — schéma réel d'un circuit vu du dessus, circuits uniquement, jamais via le formulaire admin, voir 4.2), createdAt, updatedAt`, unique sur `(type, acId)`. **Global** (pas de FK station — un `acId` désigne le même contenu AC partout), contrairement à `ContentPreview` qui est scopé par station. Tous ces tags alimentent la page tablette (`/tablet-menu`) — pas de valeur inventée, `null` tant que l'admin n'a rien renseigné via `/content-names`. **259 des 346 voitures scannées en prod ont été peuplées en masse le 2026-08-11/12** (recherche des vraies données par catégorie/année/pays/description/puissance/poids, difficulté estimée par catégorie) via des scripts Prisma one-off — volontairement incomplet, les mods dont le constructeur est déguisé pour raison de licence (contenus RSS "Bayer"/"Lanzo"/"Protech"...) ont été exclus plutôt que devinés. **66 des 87 voitures encore vides ont été peuplées le 2026-08-12 (v2.2.130)** à partir d'un dump SQL `elsass_catalogue` fourni par l'utilisateur (même nom que le venue — vraisemblablement un catalogue existant du même roster) : correspondance acId↔ligne faite à la main (le dump n'a pas d'acId, seulement un nom libre), en décodant au cas par cas les constructeurs déguisés RSS via le `rawName` réellement scanné (souvent déjà en clair, ex: `rss_gtm_bayer_i6_evo` → rawName scanné "GT3 BMW M4") et les abréviations de modèle ("Fera 55/57"→Ferrari 550/575, "Adonis D9"→Aston Martin DBR9...) — 21 restent explicitement exclues (plusieurs lignes du dump également plausibles, ou aucune ligne correspondante). Seuls les champs encore `null` ont été renseignés, jamais une valeur déjà curatée écrasée. **63 des 68 circuits scannés en prod ont été peuplés le 2026-08-12** (pays/code pays/difficulté, 59 avec un vrai schéma de tracé `layoutImage`) via une recherche web parallélisée (5 agents) — les circuits fictifs Kunos ou aux noms trop génériques pour être identifiés avec confiance ont été exclus plutôt que devinés (voir 4.2).
- **`MenuCategory`/`MenuItem`** (v2.2.117) : carte resto/bar affichée sur `/tablet-menu`, gérée via `/restaurant-menu`. `MenuCategory`: `id, section ('food'|'drinks'), title, subtitle?, sortOrder (défaut 0)`, relation `items[]`. `MenuItem`: `id, categoryId (FK MenuCategory, cascade), name, description?, price (texte libre "9,50 €", pas de calcul), sortOrder (défaut 0)`. Rien n'est seedé — vide jusqu'à ce que l'admin remplisse la carte lui-même.
- **`BlankingMedia`**: `id, stationId (FK, NULLABLE depuis v2.2.96), category ('idle'|'launching'|'results', défaut 'idle'), filename, mimeType, sizeBytes, data (bytea), order`, unique sur `(stationId, category, order)` (v2.2.95 — `category` ajouté, l'ordre n'est plus unique que dans sa propre catégorie). **`stationId = NULL` signifie média global** (v2.2.96) — `launching`/`results` sont désormais globaux (un seul jeu de fichiers pour toute la flotte, endpoints `/api/blanking-media/global*`) ; `idle` reste per-station (`stationId` non-null), c'est la seule catégorie encore scopée par poste. `results` est applicativement limité à 1 ligne (globale) — un nouvel upload remplace l'ancien — pas de contrainte DB dédiée, juste `SINGLE_ITEM_CATEGORIES` dans `blanking-media.service.ts`. **Binaire stocké directement en base (`data bytea`), plus sur le filesystem** (migration `20260806083000_blanking_media_store_in_db`) — un audit du 2026-08-06 a trouvé les 20 lignes de métadonnées existantes pointant vers un volume Docker (`blanking-media-uploads`) totalement vide (fichiers perdus, cause exacte non identifiée), alors que les métadonnées Postgres, elles, avaient survécu ; stocker le binaire dans la même transaction que ses métadonnées élimine cette classe de désynchronisation. `GET /blanking-media/:id/download` sert `media.data` directement (plus de `createReadStream`/filesystem). Le volume `blanking-media-uploads` a été retiré de `docker-compose.yml` (plus utilisé) ; les 20 lignes orphelines ont été supprimées par la migration plutôt que backfillées (aucun binaire récupérable).
- **`AppSettings`**: singleton (`id: 'singleton'`), `blankingDelaySeconds (défaut 10)`.
- **`ApiKey`** (v2.2.102) : `id, name, keyHash (unique, SHA-256 en clair — même convention que Station.apiKeyHash), keyPrefix (12 premiers caractères, affichés dans le dashboard), createdById? (FK User, SetNull), lastUsedAt?, revokedAt? (non-null = révoquée, la ligne reste pour l'historique), createdAt`. Préfixe du secret généré : `ext_`.
- **`RaceFormat`** (v2.2.115) : preset Practice/Qualifying/Race réutilisable — `practiceEnabled/practiceMinutes, qualifyingEnabled/qualifyingMinutes, raceEnabled/raceMode('LAPS'|'TIME')/raceLaps/raceMinutes, gridType('NORMAL'|'REVERSED_TOP_3'|'REVERSED_TOP_8'|'REVERSED_FULL'), weatherGraphics (String[], un ou plusieurs ids météo AC), createdById? (FK User, SetNull)`. `raceMode`/`gridType` stockés en `String` (même convention que tout le reste de ce schéma — pas d'enum Postgres natif), validés côté app via les enums `RaceMode`/`GridType` de `@simracing/shared`. Un format nommé "Practice libre (12h)" est seedé par la migration `20260811130000_add_race_formats`, avec le comportement par défaut d'avant cette fonctionnalité (v2.2.105). `DedicatedServer.raceFormatId` (FK nullable, `SetNull` — supprimer un format ne casse pas l'historique des serveurs qui l'utilisaient) référence cette table ; obligatoire (non-null) pour toute création via `POST /dedicated-servers` depuis v2.2.115.

### 3.3 Gotchas backend importants

- `AgentAuthGuard` rejoint la room `station:<stationId>` seulement si le socket n'y est pas déjà. Toute commande vers un agent utilise `this.server.to('station:<id>').emit(...)`.
- **`sessions/session-detail.ts`** (v2.2.102) : `buildSessionDetail()`, pure function qui transforme `Session.result` (race_out.json nettoyé par l'agent) en objet structuré — tous les tours (pas juste le meilleur comme `LeaderboardService`), avec `sessionType`/`tyre`/`sectors`/`cuts`/`valid` par tour, un résumé (meilleur tour propre, compteurs), **et** le JSON brut intact sous `raw` pour ne jamais perdre d'info non modélisée (classement final `raceResult`, `bestLaps`, `players`...). Réutilisé tel quel par `SessionsController#getDetail()` (JWT) et `ExternalApiController` (clé API) — un seul endroit qui sait parser ce format.
- **`Session.stationId` est l'UUID interne de `Station` (FK Prisma), pas la `stationId` métier** sur laquelle la room WebSocket de l'agent est nommée. Toujours passer par la relation (`session.station.stationId`) pour émettre vers l'agent — utiliser la `session.stationId` brute émet silencieusement vers une room que personne n'a rejointe (bug trouvé et corrigé dans `sessions.controller.ts`'s `extend()`/`stop()` en v2.2.30 ; `stop()` a aussi eu besoin de `include: { station: true }` dans `sessions.service.ts`). Tous les autres contrôleurs (`stations.controller.ts`, `dedicated-servers.controller.ts`) le font déjà correctement.
- `AGENT_API_KEY_SALT` est validé mais **jamais utilisé** dans le code (SHA-256 en clair).
- `AdminOrStationAuthGuard` accepte soit un JWT admin, soit une clé API station ; importer `AuthModule` (pas `JwtModule` brut) dans le module qui l'utilise, pour que la vérification JWT utilise le bon secret.
- **`emitLaunchDedicatedServer` n'a historiquement aucune vérification/log de socket présent** (contrairement à `emitJoinServer` qui logue le nombre de sockets trouvés) — si l'agent hôte n'est pas connecté, la commande de lancement de serveur dédié disparaît silencieusement, sans aucune trace. Vérifier `getConnectedStationIds()`/les logs backend en cas de serveur bloqué en `starting`.
- **`getUsedPorts()` (dedicated-servers.service.ts) ne filtrait pas par statut avant v2.2.66** — chaque serveur jamais créé gardait son port "réservé" pour toujours, même arrêté, épuisant progressivement les plages `9600-9700`/`8081-8181`. Corrigé : seuls les statuts `starting`/`running` comptent.
- **Un `acServer.exe` qui crashe _après_ son lancement laissait le serveur "running" en base pour toujours, avant v2.2.68** — trouvé en conditions réelles : le process passe les vérifications de lancement (vivant + port UDP bound) puis quitte tout seul ~30s plus tard, sans qu'aucun événement ne remonte. Tout POD qui tente de rejoindre ce serveur "fantôme" reste bloqué avec une mémoire partagée AC gelée pour toujours — même symptôme que "Failed to handshake", cause différente (serveur hôte mort, pas `race.ini` du client). Voir 5.9.
- **`agent:session:ended` pouvait écraser un vrai classement par `{}`, trouvé en conditions réelles via la nouvelle page `SessionDetail.tsx` (v2.2.102)** — une session complète de 15 minutes (`Tristan GRA`, Bahrain) s'est retrouvée avec `Session.result = {}` alors qu'`agent:results` avait bien été émis avec le classement réel juste avant. Cause : `agent.ts#endSession()` émet `agent:results` (si `race_out.json` a pu être lu) puis `agent:session:ended` juste après, mais rien ne garantit que le backend traite les deux handlers Socket.IO dans cet ordre une fois écrits en base — `AgentGateway#handleSessionEnded()` appelait `sessionsService.finish(sessionId, {})` **sans condition**, et si son écriture DB se terminait après celle de `handleResults()`, le `{}` gagnait la course et remplaçait le vrai résultat. Fix : `SessionsService.finish()` prend désormais un `result` **optionnel** — omis (au lieu de `{}` explicite), la colonne `result` n'est simplement pas touchée par l'update, donc `handleSessionEnded` ne peut plus jamais dégrader un résultat déjà écrit, quel que soit l'ordre d'arrivée réel des deux events.
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
| `/leaderboard`                    | `Leaderboard`           | `ProtectedRoute`              | classement par circuit/voiture, v2.2.102 — voir 4.2               |
| `/en-cours`                       | `Sessions`              | `ProtectedRoute`              |                                                                   |
| `/sessions/history`               | `SessionHistory`        | `ProtectedRoute`              | historique complet, v2.2.102 — voir 4.2                           |
| `/sessions/:id`                   | `SessionDetail`         | `ProtectedRoute`              | détail complet d'une session, v2.2.102 — voir 4.2                 |
| `/en-cours/kiosk`                 | `SessionsKiosk`         | `KioskRoute` (pas de sidebar) | mur d'affichage passif, TV/moniteur                               |
| `/kiosk`                          | `Kiosk`                 | `KioskRoute`                  | opérateur tactile, voir 4.3                                       |
| `/kiosk/dedicated-servers/create` | `CreateDedicatedServer` | `KioskRoute`                  | même composant que `/dedicated-servers/create`, `backPath` adapté |
| `/users`                          | `Users`                 | `ProtectedRoute`, admin       |                                                                   |
| `/content-previews`               | `ContentPreviews`       | `ProtectedRoute`, admin       |                                                                   |
| `/content-names`                  | `ContentNames`          | `ProtectedRoute`, admin       | renommage cars/tracks, v2.2.68 — voir 4.2                         |
| `/race-formats`                   | `RaceFormats`           | `ProtectedRoute`, admin       | CRUD presets Practice/Qualifying/Race, v2.2.115 — voir 4.2        |
| `/restaurant-menu`                | `Menu`                  | `ProtectedRoute`, admin       | CRUD carte resto/bar, v2.2.117 — voir 4.2                         |
| `/tablet-menu`                    | `TabletMenu`            | **publique, sans compte**     | app kiosque tablette, v2.2.117 — voir 4.2                         |
| `/blanking-media`                 | `BlankingMediaPage`     | `ProtectedRoute`, admin       |                                                                   |
| `/settings`                       | `SettingsPage`          | `ProtectedRoute`, admin       |                                                                   |

`ProtectedRoute` = vérif auth + `Layout` (sidebar). `KioskRoute` = même vérif auth, **sans** `Layout` (plein écran). `/tablet-menu` n'a **ni l'un ni l'autre** — aucune vérification d'auth du tout, montée directement sous `<Routes>` comme `/login` (voir 4.2, c'est une page cliente pour tablette, pas une page staff).

### 4.2 Composants/pages clés et leurs subtilités

- **`Layout.tsx`**: rail de navigation icônes-seules révélées au survol ; header avec bouton **"Mode kiosque"** (`Link to="/kiosk"`, même onglet — ne **jamais** remettre `target="_blank"`) et, depuis v2.2.117, **"Menu tablette"** (`<a href="/tablet-menu" target="_blank">` — celui-ci **doit** rester `target="_blank"`, contrairement à "Mode kiosque" : c'est un simple raccourci de prévisualisation staff, pas le point d'accès principal, les tablettes clientes ont l'URL en favori), horloge, avatar/déconnexion. **Logo réutilisé depuis le blanking media global `results`** (v2.2.100, `useSiteLogo()` dans `services/stations.ts`) : le même logo uploadé pour l'écran de fin (voir 5.5) remplace l'icône `Flag` du badge sidebar quand il existe, et son `downloadUrl` est poussé dans `<link rel="icon">` (favicon) via un `useEffect` — un seul endroit pour configurer le branding, pas deux. Fallback sur l'icône `Flag`/`vite.svg` par défaut tant qu'aucun logo `results` n'est configuré. Ne se déclenche qu'après connexion (`enabled: !!user`, le endpoint `/blanking-media/global` exige un JWT).
- **`Stations.tsx`**: écoute `socket.on('station:updated', ...)` directement dans le render (pas dans un `useEffect`) — provoque des listeners dupliqués ; envelopper dans `useEffect` avant toute modification. Filtre statut ET filtre rôle (Tous types/Simulateurs/Admin), tous deux appliqués ensemble (ET, pas OU). Panneau étendu par station : groupe "Maintenance" (MAJ agent, **Logs** — v2.2.63, Clé API, Supprimer), groupe "Type de poste" (bascule simulator/admin), groupe "Écran" (masquer/afficher blanking, écran d'attente, **Images de lancement** et **Logo écran de fin** — v2.2.95, même `BlankingMediaModal` réutilisé avec une prop `category`), groupe VR/jeu (ligne idéale, boîte auto, teleport pits, recenter VR).
- **`CreateDedicatedServer.tsx`** (wizard **4 étapes** : Simulateur → Circuit → Configuration → **Course**, v2.2.116) :
  - Étape 2 (Circuit) : vignette image par layout (pas juste du texte) — corrige un vrai bug de photos manquantes (v2.2.56).
  - Étape 3 (Configuration) : `carCounts: Record<string, number>` — cliquer sur une voiture l'ajoute (jusqu'à `maxClients`) ; **le tout premier clic (aucune voiture encore sélectionnée) remplit directement tous les slots** (v2.2.66, plus besoin de cliquer sur le bouton "remplir" séparé pour le cas courant d'une seule voiture) ; bouton "remplir tous les slots" au survol pour re-remplir explicitement ; badge de quantité cliquable pour retirer un exemplaire. **Cliquer une voiture différente une fois à pleine capacité ne bloque plus** — `addCar()` prend un slot à la voiture qui en a le plus (au lieu de désactiver le bouton), donc mélanger plusieurs voitures fonctionne juste en cliquant dessus, sans devoir retirer manuellement au préalable. `flattenCarCounts()` transforme les comptes en tableau plat répété — `serverLauncher.ts` cycle ce tableau en round-robin sur `maxClients` slots, donc un tableau à un seul élément remplit déjà tous les slots naturellement côté agent. "Options avancées" (nom, slots, mot de passe, RCON) repliées par défaut, 11 slots par défaut. Grilles circuits/voitures en `max-h-[65vh]` (viewport-relatif, pas un rem fixe) pour bien remplir l'écran sur un affichage kiosque haute résolution. Panneau récapitulatif de droite : grille "sélection d'équipe" (`CarSlotsGrid`) — une tuile par slot occupé (jusqu'à `maxClients`), pas juste un compteur texte ; cliquer une tuile retire cet exemplaire. `canProceed()` pour cette étape exige nom + au moins une voiture (le format de course n'est plus une condition ici, déplacé à l'étape 4).
  - **Étape 4 (Course, `StepRaceFormat`, v2.2.116)** : demandé explicitement par l'utilisateur ("il faut vraiment que tout le système de course soit dans une page différente ... bien séparer ça du système de base") — le sélecteur de format de course, auparavant glissé dans le panneau récapitulatif de l'étape 3 (v2.2.115), est maintenant sa **propre étape à part entière** : grille de cartes cliquables (un preset par carte, mêmes badges Practice/Qualifying/Race que `RaceFormatCard` de `RaceFormats.tsx` mais dupliqués localement plutôt que partagés entre les deux pages — composants de page non exportés, et la logique est assez courte pour ne pas justifier une extraction partagée), lien "Gérer les formats" (`target="_blank"`, ouvre `/race-formats` dans un nouvel onglet sans perdre la progression du wizard). Panneau récapitulatif de droite **dupliqué à dessein** (Poste/Circuit/Slots/Accès/Format + les 3 `CheckRow` finaux) plutôt que partagé avec celui de l'étape 3, pour que cette étape reste lisible seule. `raceFormatId` fait partie de `canSubmit`, résolu au même endroit qu'avant (state au niveau du wizard, pas local à l'étape).
  - `backPath` = `/kiosk` si le chemin actuel commence par `/kiosk`, sinon `/dedicated-servers` — pour "Annuler" et après création réussie.
- **`RaceFormats.tsx`** (`/race-formats`, admin, v2.2.115) : CRUD des presets Practice/Qualifying/Race — grille de cartes (badges par session activée avec sa durée/nombre de tours, type de grille, météo) + bouton "Nouveau format" ouvrant une `Modal` de formulaire (chaque session dans une section repliable/à bascule `SessionToggleSection`, les champs de durée n'apparaissant que si la session est activée). Suppression directe (pas de double-confirmation), même convention que les clés API dans `Settings.tsx`. Le champ météo est un simple texte "id1, id2, ..." (pas de dropdown figé sur une liste d'ids AC connus — le contenu météo installé varie d'un poste à l'autre, un champ libre évite d'imposer une liste potentiellement fausse).
- **`ContentNames.tsx`** (`/content-names`, admin, v2.2.68, étendu v2.2.117 puis v2.2.118/v2.2.120, lisibilité revue v2.2.122, bascule miroir v2.2.123, case visibilité catalogue v2.2.124, miniature photo v2.2.127, vignette Layout v2.2.128, galerie multi-layout + fond noir v2.2.129, champ vitesse max v2.2.130) : en plus du nom personnalisé, chaque ligne a un champ **catégorie** (texte libre), un sélecteur **difficulté** (5 barres cliquables, 1-5, cliquer la valeur déjà sélectionnée l'efface), **année**, **pays** (texte libre) + **code pays** (2 lettres ISO, affiche l'emoji drapeau live via `flagEmoji()` — combinaison Unicode de deux "regional indicator symbols", pas d'image), **description** courte, et depuis v2.2.120 **puissance (ch)**/**poids (kg)** (deux inputs numériques), plus depuis v2.2.130 **vitesse max (km/h)**. Un seul bouton "Enregistrer" par ligne envoie tous les champs ensemble (`ContentNameRow`, state local par champ) — nécessaire depuis que `upsert()` ne supprime plus la ligne sur un nom vide seul (voir 3.1/3.3). **Depuis v2.2.122, chaque champ a une étiquette permanente au-dessus** (`Field`, petit composant label+enfant) plutôt que de compter uniquement sur le `placeholder` — demandé par l'utilisateur ("plus lisible") après avoir cherché où éditer ces infos : le placeholder disparaît dès qu'une valeur est saisie, ce qui rendait les lignes déjà remplies illisibles sur une liste de 346 voitures ; layout en grille (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`) plutôt qu'un flex-wrap improvisé. Depuis v2.2.123, une ligne voiture gagne aussi un bouton bascule **Miroir** (`FlipHorizontal`) pour corriger l'orientation de la photo sur `/tablet-menu` au cas par cas. Depuis v2.2.124, une case à cocher **Afficher sur le catalogue** (toutes lignes, voitures et circuits) contrôle la présence de l'item sur `/tablet-menu` sans effacer le reste de ses données. Depuis v2.2.127, une petite vignette (56×40) avec la vraie photo scannée précède le badge de type sur chaque ligne — demandé par l'utilisateur ("petit mais visible la photo de la voiture") pour identifier visuellement la ligne en cours d'édition sans deviner d'après le seul acId ; icône de remplacement si aucune preview n'a encore été scannée. Depuis v2.2.128, une ligne circuit gagne à la place du bouton Miroir un champ **Layout** en lecture seule montrant le vrai schéma de tracé scanné par l'agent, ou "Aucun" tant qu'aucun poste avec le nouvel agent n'a resynchronisé ce circuit — depuis v2.2.129, vignette sur **fond noir** (le trait du schéma scanné est blanc, invisible sur fond blanc) et **une vignette par layout nommé** du circuit (galerie) quand il y en a plusieurs, avec le nom du layout en infobulle. Tous ces champs alimentent la page tablette publique `/tablet-menu`.
- **`Menu.tsx`** (`/restaurant-menu`, admin, v2.2.117) : CRUD de la carte resto/bar — deux sections fixes (Cuisine/Bar), chacune avec ses catégories en grille de cartes (titre, sous-titre, liste d'articles nom/description/prix), boutons "Nouvelle catégorie"/"Nouvel article" ouvrant une `Modal` de formulaire. Pas de champ de tri exposé dans l'UI (`sortOrder` reste à 0, l'ordre de création suffit pour v1). Suppression directe, même convention que `RaceFormats.tsx`.
- **`TabletMenu.tsx`** (`/tablet-menu`, **page publique sans compte**, v2.2.117, enrichie v2.2.118) : réimplémentation React de la maquette Claude Design importée ("Menu interactif sur tablette", `Menu Tablette.dc.html` — voir le fichier source pour la maquette originale, dont le runtime `<x-dc>`/`sc-for`/`sc-if`/`<image-slot>` n'est qu'un outil de prévisualisation, jamais destiné à tourner en prod). 4 onglets (Voitures/Circuits/Cuisine/Bar), filtres catégorie **dynamiques** (calculés depuis les tags réellement présents, la barre ne s'affiche que s'il y en a au moins un — pas la liste figée GT3/GT4/... de la maquette), fiche détail au clic (photo + catégorie + difficulté + depuis v2.2.118 pays/drapeau/année/description quand renseignés — **pas** de puissance/poids inventés), écran de veille après `IDLE_MS` (90s) d'inactivité (accroche tournante calculée depuis les vrais compteurs — pas les phrases fictives de la maquette), portrait/paysage détecté via `window.innerWidth`/`innerHeight` (`vh > vw*1.05`). Thème "Nocturne" de la maquette (accent blurple `#9184d9`) injecté via un `<style>` scopé à `.tablet-menu` (`TabletMenuStyles`) — jamais sur `:root`, pour ne pas teinter le reste du dashboard. **Pas de toggle FR/EN** (contrairement à la maquette) — tout le reste du site est 100% français sans infra i18n. Consomme `GET /external/v1/content` et `/menu` via `services/tabletMenu.ts` → `services/externalApi.ts` (voir gotcha ci-dessous). Nom d'établissement codé en dur (`VENUE_NAME`, "ELSASS SIMRACING HAGUENAU") — pas de compte utilisateur sur cette page donc pas d'accès à `useSiteLogo()` (endpoint JWT/clé station uniquement), et la maquette elle-même n'affiche que du texte ici, jamais une image de logo.
- **Effet "3D" sur les voitures (`Tilt3DImage`, v2.2.118)** : demandé par l'utilisateur ("un visuelle 3D des voitures pouvoire les tournée etc"). Vérifié avant d'implémenter (voir gotcha agent 5.x — le scanner de contenu ne lit qu'une photo 2D unique par voiture, jamais le `.kn5`, et aucun mécanisme ne transfère les modèles 3D vers le backend) : un vrai modèle 3D pivotable n'est pas faisable avec les données existantes, et extraire les `.kn5` poserait un problème de licence (contenu payant Kunos + mods tiers). À la place : la fiche détail (`DetailModal`) utilise `Tilt3DImage`, une image inclinable au doigt/à la souris — `rotateX`/`rotateY` pilotés par le glissement du pointeur (`onPointerDown`/`onPointerMove`, bornés à ±16°/±28° pour rester crédible sur une simple photo à plat), retour à plat au relâchement, léger effet de brillance qui suit l'inclinaison, badge "Glissez pour incliner". Les vignettes de la grille (`CatalogCard`) ont en plus un survol 3D léger CSS-only (`.tm-card:hover`, `@media (hover: hover)` uniquement — pas sur tactile, pour ne jamais entrer en conflit avec le défilement de la liste).
- **Sélecteur de familles à tuiles photo (`FamilyTile`, v2.2.119, liste remplacée en v2.2.121)** : demandé par l'utilisateur à partir d'une image de référence (4 tuiles photo GT/Formula/LMDH/Drift) puis, sur nouvelle image de référence, remplacé par une liste de 11 catégories ("replace en les catégorie suivant") — `CAR_FAMILIES` est désormais **GT2/GT3/GT4/Hypercar/DTM/Cup/Historique/Autres/Formula 1/Formula 2/Formula 4** (+ "Toutes"), portée confirmée via AskUserQuestion : uniquement les tuiles, le champ `category` texte libre déjà enregistré sur les voitures n'a pas changé. Chaque tuile affiche la photo réelle de la première voiture matchée (désaturée/assombrie, dégradé sombre, étiquette centrée en bas) ; matché sur le champ `category` exact via règles par mot-clé, volontairement redondantes entre elles (ex: "Formule 1 historique" matche Historique **et** Formula 1, aucune famille n'est exclusive). **"Autres" est un vrai filtre** (regex négative — toute voiture qui ne matche aucune des 10 autres familles), différent de "Toutes" qui n'exclut rien. Une famille sans voiture correspondante en base ne s'affiche pas (`Formula 2`, actuellement vide). Remplace le regroupement ~30 familles en pastilles texte de v2.2.118 (jugé encore trop chargé pour un écran tactile).
- **Fiche technique puissance/poids (`SpecStat`, v2.2.120, vitesse max ajoutée v2.2.130)** : demandé par l'utilisateur ("plus de jolie detail Poids puissance etc"). Badge puissance ("450 ch") en haut à droite de chaque `CatalogCard`, symétrique au badge catégorie ; la fiche détail (`DetailModal`) affiche Puissance/Poids/Rapport poids-puissance (kg/ch calculé côté client) et, depuis v2.2.130, Vitesse max (`maxSpeedKmh`) via `SpecStat` — chaque stat n'apparaît que si son champ est renseigné, jamais affiché pour un contenu non identifié.
- **Photos retournées capot à droite (`mirrored`, v2.2.123)** : demandé par l'utilisateur ("changer tout les image pour qu'elle soit tous tournéer capot vers la droite"), scope confirmé à `/tablet-menu` uniquement. Retournement en CSS (`transform: scaleX(-1)`) sur `CatalogCard`, `FamilyTile` (photo représentative de la famille) et `Tilt3DImage` (fiche détail, combiné à l'effet de bascule existant) — jamais un retournement des pixels stockés en base (voir 3.2, `ContentLabel.mirrored`). Les 344 photos de voitures existantes ont été revues individuellement (extraction + planches-contact + vérification à pleine résolution des cas ambigus) plutôt que retournées en masse : ~89% (307/344) sont orientées capot à gauche par convention de l'outil de génération d'aperçus le plus utilisé pour ce contenu et ont été marquées `mirrored: true` ; les exceptions identifiées (karts, pack `rw_*`, quelques photos isolées déjà capot à droite, une photo prise de l'arrière où le sens du capot n'est pas déterminable) ont été explicitement exclues plutôt que devinées. Bascule "Miroir" ajoutée sur `/content-names` pour que l'admin puisse corriger une voiture reclassée plus tard. Effet de bord accepté : les numéros de course/logos imprimés sur la carrosserie apparaissent inversés sur les photos retournées, propre à tout miroir d'image.
- **Difficulté nommée (`DIFFICULTY_LABELS`, v2.2.125)** : demandé par l'utilisateur ("débutant/facile/moyen/difficile/expert"). Les 5 niveaux de l'échelle `difficulty` (voitures **et** circuits, champ générique depuis toujours) affichent désormais leur libellé (Débutant/Facile/Moyen/Difficile/Expert) à côté des barres, sur `/content-names` et `/tablet-menu` — aucun changement de données, juste un étiquetage.
- **Schéma de circuit (`ContentLabel.layoutImage`, v2.2.125, peuplé v2.2.126, remplacé par un vrai scan agent en v2.2.128)** : demandé par l'utilisateur ("pour les circuit récupère les vrais schema du circuit"). Champ pour le vrai tracé du circuit vu du dessus (pas la photo scannée par l'agent), servi via `GET /content/labels/layout-image/:id` (public, sans auth, même principe que `ContentPreviewsController`). Renseigné uniquement par script one-off (recherche web, sources libres type Wikimedia Commons) — pas de champ dans le formulaire `/content-names`, `upsert()` ne le touche jamais. **59/68 circuits peuplés** ainsi (recherche parallélisée sur Wikimedia Commons, images normalisées en PNG max 900px, vérifiées visuellement une par une) — les 5 circuits fictifs/non identifiables et les 4 circuits réels sans schéma en licence libre disponible n'ont pas reçu d'image inventée, voir 3.2.
  - **v2.2.128, demandé par l'utilisateur à partir d'une capture Content Manager ("récupérer toute les image de circuit... comme quand tu récup les track et circuit")** : source préférée désormais le vrai fichier `outline.png` livré avec chaque circuit installé (fichier standard AC, à côté de `preview.png` dans `content/tracks/<circuit>/ui/<layout>/` — ce que Content Manager affiche dans sa fiche circuit), récupéré par le **même mécanisme que les photos** (scan agent `contentScanner.ts` → upload `agent:content` → `ContentPreview` type `'layout'`, voir 5.10), pas par un transfert manuel. `ContentLabelsService.getCatalog()`/`getKnown()` préfèrent ce scan réel ; le schéma web (Wikimedia, v2.2.126) ne reste utilisé qu'en repli tant qu'un poste n'a pas resynchronisé avec le nouvel agent.
  - **v2.2.129, demandé par l'utilisateur après avoir vu le résultat réel ("il faudrait mieux le voir circuit et blanc donc il faudrait fond noir, et ensuite il faudrait tout les layout possible de chaque circuit")** : le vrai `outline.png` est un tracé **blanc sur fond transparent** (contrairement aux schémas Wikimedia, composités sur fond blanc opaque en v2.2.126) — invisible sur l'encart blanc utilisé jusque-là. Encart passé en fond noir des deux côtés (`/tablet-menu` et `/content-names`), sans régression pour les schémas Wikimedia (déjà opaques). Nouveau champ `layoutImages: {name, url}[]` (méthode `resolveLayoutImages()`) : une entrée par layout **nommé** du circuit ayant son propre schéma scanné (`ContentPreview` type `'layout'`, acId `${trackAcId}:${layoutName}`, déjà uploadés depuis v2.2.128 mais jamais exposés jusqu'ici) — `/tablet-menu` affiche désormais chaque tracé d'un circuit multi-config côte à côte, étiqueté par son nom (ex: Bahreïn → 6 tracés distincts), `/content-names` en petite galerie. `layoutImageUrl` (racine, sans nom) reste le repli pour les circuits à layout unique ou sans dossier de layout nommé.
  - **v2.2.131, demandé par l'utilisateur ("dans l'image du circuit dans le catalogue j'aimerais un truc propre mais il me faut le tracé du circuit")** : la tuile circuit de la grille `/tablet-menu` (`CatalogCard`) affichait encore la photo de piste (`preview`, souvent sombre/encombrée, coupée en `object-fit: cover`) au lieu du tracé — seule la fiche détail avait été mise à jour en v2.2.129. `CatalogCard` affiche désormais le tracé (`layoutImages[0]` ou repli `layoutImageUrl`) en priorité sur la photo, fond noir + `object-fit: contain` ; repli photo si aucun tracé, puis icône "pas d'image". Les voitures (`layoutImages` toujours vide) ne sont pas concernées, leur tuile garde la photo.
- **`services/externalApi.ts` — jamais `services/api.ts` sur une page publique sans compte** (v2.2.117, leçon réutilisable pour toute future page kiosque/cliente) : `services/api.ts` attache le JWT `localStorage` et **redirige vers `/login` sur 401** — sur une page sans aucun compte utilisateur comme `/tablet-menu`, la moindre erreur 401 casserait la tablette en la renvoyant vers un écran de connexion que personne n'a de raison d'utiliser. `externalApi.ts` est une instance Axios séparée, header `X-Api-Key` fixe (lu au build depuis `VITE_TABLET_MENU_API_KEY`, `apps/frontend/.env` — jamais committé), sans aucun interceptor de redirection.
- **`JoinServer.tsx`** (page complète `/dedicated-servers/:id/join`) : cartes PODs façon jeu, plaque nominative par pilote (`ClientNameInput.tsx`, autocomplete sur `Client`), difficulté en 3 cartes descriptives, grille de voitures avec images. `availableCars` **dédupliquée** (`Array.from(new Set(server.cars))`) — un serveur peut avoir des voitures répétées (quantité choisie à la création), mais pour le choix du pilote une seule carte par modèle suffit (corrige un vrai bug de clés React dupliquées → cartes qui se sélectionnaient toutes ensemble, v2.2.66-ish). `durationMinutes` par défaut `undefined` ("Illimité") — cas le plus courant, pas un cas limite. Après "Envoyer" réussi, redirige directement vers `/en-cours` (pas d'écran de succès intermédiaire).
- **`Sessions.tsx`** (`/en-cours`) : `SessionCard` (exporté, réutilisé ailleurs) — bannière avec vignette circuit, nom du pilote en évidence, badges de difficulté colorés, jauges circulaires RPM/vitesse (couleurs de la palette sombre de l'app, pas des gris Tailwind génériques), barres accélérateur/frein, meilleur/dernier tour, temps restant avec barre de progression, boutons prolonger/arrêter, et (si `onCommand` fourni) ligne idéale/boîte auto/retour aux stands.
- **`SessionHistory.tsx`** (`/sessions/history`, v2.2.102) : liste toutes les sessions `finished` (`GET /sessions/history`), recherche client-side (pilote/circuit/voiture/poste sur les données déjà chargées, pas une requête par frappe), chaque ligne mène à `SessionDetail.tsx`. Nouvel item de nav sidebar ("Historique", icône `History`).
- **`SessionDetail.tsx`** (`/sessions/:id`, v2.2.102) : détail complet d'une session (`GET /sessions/:id`, voir `session-detail.ts` en 3.3) — pas juste le meilleur tour comme le classement, **tous** les tours (toutes sessions AC Practice/Qualifying/Race confondues) avec secteurs, pneu, nombre de coupures, indicateur valide/invalide (barré + croix rouge si `cuts > 0`). Résumé (meilleur tour propre, tours totaux/propres/coupés) en tuiles. Section "JSON brut" repliable en bas — le `race_out.json` complet, jamais retravaillé, pour ne perdre aucune info que les champs structurés au-dessus n'auraient pas modélisée. Accessible aussi en cliquant une entrée du classement (`Leaderboard.tsx`) — chaque ligne pilote/temps y est un lien direct vers cette page.
- **Clés API externes** (`Settings.tsx`, carte "Clés API externes", v2.2.102) : admin uniquement, génère/liste/révoque/supprime des clés (`services/apiKeys.ts` → `ApiKeysController`). Le secret en clair (préfixe `ext_`) n'est affiché **qu'à la création**, jamais récupérable ensuite — seul le préfixe (12 caractères) reste visible dans la liste. Pensées pour authentifier `GET /api/external/v1/*` (voir 3.1), pas le dashboard lui-même.
- **`SessionsKiosk.tsx`** (`/en-cours/kiosk`) : mur passif, grille fixe 5×2 (10 slots max — plafonné aux 10 sessions les plus récemment démarrées, pas de pagination/rotation), cartes compactes cliquables ouvrant la `SessionCard` complète dans une `Modal`. Lien "Accueil" (`/`) et "Gérer les PODs" (`/kiosk`) dans le header, **même onglet**.
- **`Kiosk.tsx`** (`/kiosk`, vue opérateur tactile, pas de sidebar) :
  - Onglets Serveurs / **Postes** (Postes par défaut).
  - **Onglet Postes**: grille fixe à **10 slots max** (`MAX_PODS`), stations `admin` **exclues** entièrement, slots vides en pointillés si moins de 10 PODs simulateurs. Chaque slot : `PodSessionCell` (compact, cliquable → modal détail complet via `SessionCard`) si en session, sinon `PodAvailableCell` (cliquable, bouton "Envoyer" ou "Créer un serveur" selon qu'un serveur tourne).
  - Cliquer un POD disponible → si 0 serveur actif : navigue vers `/kiosk/dedicated-servers/create` ; si 1 : ouvre directement l'écran d'envoi ; si plusieurs : modal "Choisir un serveur" d'abord.
  - **Écran d'envoi (`SendPodsModal`) en page entière** (pas une `Modal` centrée) — header avec flèche retour, contenu scrollable, footer fixe avec compteur de pilotes + bouton Envoyer.
  - Header : liens "Accueil" (`/`) et "Voir les sessions" (`/en-cours/kiosk`), tous en même onglet.
- **`ClientNameInput.tsx`** (composant partagé, `JoinServer.tsx` + `Kiosk.tsx`) : input pilote avec dropdown de suggestions débattu 250ms sur `GET /clients?search=`.
- **`ContentNames.tsx`** (`/content-names`, admin, v2.2.68) : page de renommage — liste tous les `acId` connus (`GET /content/labels/known`), un input par ligne + bouton Enregistrer (`PUT /content/labels`) + bouton reset (↺, réapparaît si un label existe déjà) qui envoie `displayName: ''` pour revenir au nom technique. Dans le dashboard, le mapping est résolu **côté client** : `formatCarName`/`formatTrackName`/`cleanTrackName`/`formatTrackAcId` (déplacées vers `packages/shared/src/naming.ts` en v2.2.81, réexportées par `utils/track.ts` pour compat) acceptent un 3ᵉ paramètre optionnel `labelMap` (prioritaire sur le nom AC brut), alimenté par le hook partagé `useContentLabelMap()` (`services/contentLabels.ts`, React Query, clé `['content-labels-map']` — un seul fetch réseau même appelé depuis plusieurs composants). `findTrackName` reste local au frontend (résout aussi le contenu station). Câblé dans `CreateDedicatedServer.tsx`, `JoinServer.tsx`, `Kiosk.tsx`, `Sessions.tsx`, `SessionsKiosk.tsx`, `DedicatedServers.tsx` — partout où un nom de voiture/circuit est affiché côté dashboard. L'acId technique brut reste visible en légende secondaire (pas masqué, juste plus discret) dans les grilles de sélection.
- **`Leaderboard.tsx`** (`/leaderboard`, v2.2.102, design porté depuis une maquette Claude Design fournie par l'utilisateur — thème HUD racing bleu/cyan cohérent avec les écrans de blanking, gold/or dédié pour le record) : bandeau compteurs (circuits/sessions/pilotes/voitures), sélecteur de circuits (cartes avec image `ContentPreview`, rail cyan animé sur la sélection active), puis pour le circuit sélectionné un panneau hero (image + stats, balayage HUD décoratif — **pas** une vraie trajectoire, aucune position n'est enregistrée après coup, voir 5.3) et un bandeau "Record du circuit" doré (toutes voitures confondues), et enfin un classement **par voiture** (pas un classement global mélangé) — une carte par voiture avec son image, son meilleur temps, un badge "Record" si elle détient le record du circuit, et son top 3 avec médailles + écarts. N'affiche que des tours sans coupure (`GET /api/leaderboard`, voir 3.1) ; état vide explicite tant qu'aucun tour propre n'a été enregistré (distinct d'un état de chargement). Toutes les images/noms viennent de `ContentPreview`/`ContentLabel` déjà existants, aucune nouvelle donnée à scanner côté agent.
- **Écrans de blanking de l'agent (lancement/résultats) affichent aussi le nom personnalisé depuis v2.2.81** — résolu **côté backend** cette fois (l'agent n'a pas accès à `ContentLabel`) : `StationsController#launch()` et `DedicatedServersController#join()` injectent `ContentLabelsService` + les mêmes fonctions partagées, et ajoutent `carName`/`trackName` (résolus) aux payloads `session:launch`/`server:join` — en plus de `carAcId`/`track` (les acId techniques, toujours utilisés tels quels pour le lancement réel du jeu, inchangés). `agent.ts` transporte `carName`/`trackName` jusqu'à `BlankingManager.showLaunching()`/`showResults()` (via `currentSession`), qui les préfère à `carAcId`/`track` dans le HTML généré si présents.

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
| `blankingMediaSync.ts`    | Synchronise les médias de blanking par station, 3 catégories (voir 5.5)                    |
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
- **Fonds d'écran personnalisés pour lancement/fin, 3 catégories bien séparées, ne jamais les mélanger** (v2.2.95, demandé par l'utilisateur) — `BlankingMedia.category` (`idle`/`launching`/`results`) sépare complètement les trois écrans : `idle` reste le diaporama existant de l'écran d'attente (`setMediaPaths()`, inchangé), `launching` est une liste d'images dont une est choisie **au hasard à chaque nouvelle session** (`setLaunchingMediaPaths()`, consommée par `pickRandomLaunchingImage()` dans `generateLaunchingHtml()`), `results` est un **logo unique** (`setResultsLogoPath()`, un nouvel upload remplace l'ancien côté backend, pas de liste). `blankingMediaSync.ts` télécharge et stocke chaque catégorie dans son propre sous-dossier (`blanking-media/idle/`, `.../launching/`, `.../results/`).
- **Launching/résultats globaux, pas per-station** (v2.2.96, demandé par l'utilisateur : "vu que tous les simus auront le même écran, configurer ça au même endroit pour tous les pods") — `launching`/`results` basculés en médias globaux (`BlankingMedia.stationId = NULL`, endpoints `/blanking-media/global*`, voir 3.1/3.2) ; `idle` reste seule per-station. `blankingMediaSync.ts` route les deux catégories globales vers `GET /blanking-media/global?category=` au lieu de l'endpoint par station. Une mise à jour globale diffuse `blanking:mediaUpdated` à **tous** les agents connectés (`this.server.emit(...)`, même mécanisme que `settings:updated`) plutôt que de cibler la room d'une seule station (`agent.gateway.ts`).
- **Refonte visuelle complète des écrans lancement/résultats** (v2.2.96, à partir d'une maquette Claude Design fournie par l'utilisateur) — nouveau panneau HUD translucide centré, thème bleu racing (`#0057ff`→`#00c2ff`, orange réduit à une touche sur le meilleur tour), position finale avec couleur or/argent/bronze, classement en lignes flexbox (plus de `<table>`). `commonStyles(screen, photoPath?)` (signature changée, l'ancien paramètre `background?: {imagePath,fit}` a disparu) : fond de scène par défaut différent par écran si pas de photo (dégradés radiaux + texture diagonale, recette différente pour `launch` vs `results`), sinon la photo `launching` en cover + voile sombre. Le logo `results` était d'abord un `<img>` en filigrane centré par-dessus le fond par défaut — **changé en v2.2.99** (demandé par l'utilisateur : "les images et le logo que je donne, pas le fond par défaut") pour devenir le vrai fond d'écran (même traitement `cover`+voile sombre que les photos `launching`, via `commonStyles('results', this.resultsLogoPath)`) ; le dégradé/texture/anneau/texte "AC" par défaut ne s'affichent plus du tout dès qu'un logo est configuré, symétrique avec `launch`. **Diaporama en fondu enchaîné pour les images de lancement** (v2.2.100, demandé par l'utilisateur) — `commonStyles(screen, photoPaths?: string[])` (signature généralisée à un tableau, `results` continue de lui passer un tableau à 0 ou 1 élément). `showLaunching()`/`generateLaunchingHtml()` n'utilisent plus `pickRandomLaunchingImage()` (une seule image tirée au sort) mais `shuffleLaunchingImages()` (toute la playlist, ordre mélangé par lancement) ; `renderSceneBackgroundLayers()` empile un `<div class="scene-bg-layer">` par image (opacité 0/1, `transition: opacity 1.2s`) plus un voile sombre commun ; `renderSlideshowScript()` injecte un `<script>` **ES5 pur** (`var`, pas de flèches/template literals — moteur IE11 de `blanking.ps1`, premier script embarqué dans ces écrans) qui bascule la classe `active` toutes les 2,5s via `setInterval`, omis si 0 ou 1 image (rien à faire tourner). **Toute la mise en page est en une seule unité** (vw dérivée du design source 5120x1440, `px/5120*100`) au lieu de l'ancien système vw-base + `@media (min-width:5120px)` override en vh — fonctionne nativement aux deux résolutions sans double réglage car c'est un panneau centré compact, pas un layout plein écran. **Contraintes IE11 (moteur de `blanking.ps1`)** : `backdrop-filter` et `clip-path` du design source ne sont pas supportés — remplacés par une opacité de fond simple et des coins droits ; `display:grid` remplacé par flexbox+`gap` (déjà utilisé ailleurs dans ce fichier, confirmé fonctionnel en conditions réelles).
- **Le décompte de session démarre au reveal du jeu, pas au join/lancement** (v2.2.98, demandé par l'utilisateur) — `BlankingManager` prend un 3ᵉ callback constructeur optionnel `onSessionRevealed` (câblé `agent.ts:new BlankingManager(logger, revealGame, () => this.handleSessionRevealed())`), invoqué **une seule fois par session** via le nouveau helper privé `markRevealed()` (remplace les deux affectations directes `gameRevealedThisSession = true` dans `revealThenStop()`) — c'est le même instant que le vrai reveal (jeu confirmé au premier plan, blanking réellement retiré), pas le lancement de la commande. `agent.ts#handleJoinServer()` construit `currentSession` avec `revealed: false` et **n'appelle plus `scheduleSessionEnd()`** ; c'est `handleSessionRevealed()` qui fixe `startedAt = Date.now()`, émet `agent:session:started` au backend, et planifie l'auto-arrêt. `handleSessionExtend()` ne replanifie l'auto-arrêt que si `currentSession.revealed` est déjà vrai — sinon la nouvelle durée est juste mémorisée, appliquée par `handleSessionRevealed()` plus tard. Backend : `dedicated-servers.controller.ts` ne fixe plus `Session.startedAt` à la création du join (reste `null`) ; `agent.gateway.ts` gagne un handler `agent:session:started` qui appelle `sessionsService.start()` (méthode déjà existante, utilisée aussi par le lancement direct) et republie `session:updated`. Le frontend traitait déjà `startedAt: null` comme "pas de décompte" partout (`Sessions.tsx`, `SessionsKiosk.tsx`, `Kiosk.tsx`) sauf deux endroits qui plantaient au typecheck sur `string | null` — tri par date et calcul du temps écoulé sur `/kiosk`/`/en-cours/kiosk`, corrigés avec un repli sur l'instant présent.
- **Le décompte de retrait du blanking de lancement démarrait bien avant la vraie "mise en drive" (v2.2.104)** — signalé deux fois par l'utilisateur ("le blanking screen ... ce retire avec le temps mis dans les paramétre du site mais aprés la mise en drive"), confirmé "il se retire trop tôt" (le jeu était encore en train de charger en dessous). Deux chemins déclenchaient le décompte prématurément : `notifyDriveTriggered()` (appelé juste après l'envoi fire-and-forget de la commande `autoStart` à l'app Lua — un fichier écrit sur disque, sans accusé de réception, potentiellement des dizaines de secondes avant qu'AC n'ait fini de charger le circuit/menu) et, dans `evaluate()`, `acRunning` seul (process `acs.exe` détecté vivant dans la liste Windows dès son apparition, bien avant que le jeu n'ait chargé quoi que ce soit). Fix : `notifyDriveTriggered()` supprimé ; `evaluate()` déclenche désormais le décompte sur `acLoaded` (mémoire partagée AC mappée **et** fraîche — `packetId` qui avance réellement, seul signal reflétant une session live avec la voiture spawnée) plutôt que `acRunning || acLoaded`. `acRunning` seul ne suffit plus à démarrer le décompte mais reste un filet de sécurité (`acRunningSince` + `AC_LOADED_SAFETY_FALLBACK_MS`, 90s) pour ne jamais bloquer le blanking indéfiniment si la mémoire partagée ne se charge jamais (crash, version AC inattendue...).

### 5.6 Réseau / reconnexion

- **`reconnection: false` sur le client socket.io** — la reconnexion est gérée manuellement. Deux points de déclenchement : sur `'disconnect'` (déjà connecté puis coupé) ET sur `'connect_error'` (jamais réussi à se connecter — corrigé en **v2.2.62**, avant ça un `connect_error` isolé pendant un redémarrage backend laissait l'agent bloqué déconnecté indéfiniment). `scheduleReconnect()` coalesce les tentatives multiples dans un seul timer (5s), annulé sur connexion réussie ou re-provisioning.
- **`waitForServerReachable()`** ping `SERVER_URL` (jusqu'à 10s) avant d'ouvrir le WebSocket, log un warning clair si injoignable — aide au diagnostic réseau/DNS.
- **Statut station auto-réparé** (v2.2.43) : `reconcileReportedStatus()` à chaque heartbeat compare l'état réel `acRunning` au dernier statut envoyé, corrige après 2 ticks discordants consécutifs (immédiat à la première observation post-connexion).
- **Chaque reconnexion cassait silencieusement la télémétrie partagée, jusqu'à v2.2.72** — trouvé pendant une re-vérification complète en conditions réelles : `agent.ts`'s handler `socket.on('connect')` recrée un `AcSharedMemoryReader` à chaque reconnexion (Wi-Fi instable, redémarrage backend...), dont le constructeur réenregistrait ses 3 types `koffi.pack(...)` — sauf que le registre de types koffi est **global au process**, pas par instance. La 2ᵉ reconnexion (et toutes les suivantes) jetait `Duplicate type name 'SPageFilePhysics'`, avalé par un `catch` qui logue juste une erreur : toute lecture de télémétrie partagée restait cassée pour le reste de la vie du process, sans autre signal visible (le check "state changed"/`packetId` continue de fonctionner, lui, car indépendant). Fix : les 3 `koffi.pack(...)` sont désormais enregistrés **une seule fois au chargement du module**, pas dans le constructeur — voir `acSharedMemoryReader.ts`.

### 5.7 Mise à jour à distance (`updater.ts` + `assets/update-agent.ps1`)

- Techniciens/admins déclenchent une mise à jour depuis la page Postes (`POST /stations/:id/update-agent` → `system:update` → `handleUpdate()`).
- `Updater.update()` : vérifie la dernière release GitHub, télécharge `sim-center-agent-win.zip`, écrit `update-agent.ps1` (extrait de `assets/`) sur disque, le lance via une **tâche planifiée Windows ponctuelle** (v2.2.80, voir plus bas), puis `process.exit(0)`.
- **`update-agent.ps1` (durci en v2.2.65 après un échec réel constaté en production)** :
  1. `Wait-Process -Timeout 30` sur le PID de l'ancien agent (PowerShell, pas de boucle cmd.exe — voir bug ci-dessous).
  2. **Sauvegarde** l'exe + `build/` actuels dans `update-backup/` avant d'extraire.
  3. `Expand-Archive -Force` — si ça échoue, **restaure** la sauvegarde plutôt que de laisser un état incohérent.
  4. **Relance toujours** en fin de script (nouvelle version si l'extraction a réussi, ancienne restaurée sinon) — avant ce fix, un échec d'extraction laissait le script s'arrêter net sans jamais relancer, l'agent restant complètement mort jusqu'à une intervention physique.
  5. Toutes les étapes journalisées dans `update-agent.log` à côté de l'exécutable.
- **La MAJ à distance échouait silencieusement dès le téléchargement (v2.2.79)** — signalé par l'utilisateur ("télécharge mais ne fait rien de plus"), confirmé via les logs distants : `EPERM: operation not permitted, open '...\exe\update.zip'`. `update.zip` était écrit sous un nom **fixe**, **à côté de l'exécutable en cours d'exécution** — verrou transitoire Windows Defender (scan temps réel) ou fichier résiduel d'une tentative précédente, dans les deux cas ça bloque **toutes les tentatives suivantes** indéfiniment, sans jamais rien remonter au-delà du log local de l'agent. Fix : `zipPath`/`scriptPath` déplacés dans le dossier temp (même convention que `blanking.ps1`/`kiosk.ps1`), noms **uniques par tentative** (`update-<Date.now()>.zip`), nettoyage best-effort des fichiers résiduels au début de chaque tentative (`cleanupStaleUpdateFiles()`). `finalExePath`/`launcherPath` (les cibles réelles de la mise à jour) restent dans `baseDir`, inchangé. Un échec pousse aussi désormais un `sendLog()` vers les logs backend, pas seulement le log local de l'agent.
- **La mise à jour ne se déclenche jamais automatiquement** — chaque agent doit être mis à jour via le bouton "MAJ agent" du dashboard, ou manuellement (téléchargement + exécution de `sim-center-agent-win-setup.exe`).
- **Un agent qui tourne déjà utilise SON PROPRE `update-agent.ps1` embarqué (l'ancienne version), pas celui de la nouvelle release téléchargée** — si le script de la version installée a un bug non corrigé dans cette version-là, "MAJ agent" échouera de la même façon qu'avant tant que l'agent n'a pas été mis à jour manuellement (setup.exe) au moins une fois pour obtenir le script corrigé.
- **Le script de continuation ne survivait pas à la fermeture de l'agent (v2.2.80)** — confirmé par l'utilisateur juste après le fix v2.2.79 : le téléchargement réussissait enfin, mais l'extraction/relance ne se produisait jamais ("il manque le dézip et la relance de l'exe"), sans aucune erreur loggée. Cause probable : le process de l'agent (packagé `pkg`) appartient à un Job Object Windows avec kill-on-close — tous ses enfants meurent avec lui, `detached: true` ne fait que créer un nouveau groupe de processus, ça ne l'exempte pas d'un job auquel il appartient déjà. Fix : lancement via une **tâche planifiée ponctuelle** (`schtasks /create ... /sc once /st 00:00 /f` puis `/run` immédiat — le `/st` factice n'a aucune importance, `/run` déclenche sur demande indépendamment du planning) — le service Task Scheduler lance le process entièrement en dehors de l'arborescence/job de l'agent, il survit donc quoi qu'il arrive à ce dernier. `update-agent.ps1` reçoit ses paramètres via un fichier JSON (`-ParamsPath`, un seul argument à passer proprement à travers `schtasks`) plutôt que 5 arguments nommés séparés. Le script se désinscrit lui-même de la tâche planifiée (`schtasks /delete`) en fin d'exécution, comme il supprimait déjà son propre fichier.
- **Le zip lui-même créait un dossier `exe\exe\` imbriqué au lieu d'écraser sur place (v2.2.82)** — signalé par l'utilisateur juste après le fix v2.2.80. Confirmé en téléchargeant et inspectant l'archive réelle : tous les fichiers étaient préfixés `exe/` (`exe/sim-center-agent-win.exe`, `exe/build/...`) car l'étape de packaging (`.github/workflows/release-agent.yml`) zippait avec `exe\...` comme chemins depuis `apps/agent`, sans `cd` dans `exe/` d'abord. `update-agent.ps1` extrait pourtant directement dans le dossier `exe` déjà existant — ce préfixe créait donc `exe\exe\...` imbriqué au lieu de remplacer les fichiers en place, le nouvel exe n'était donc jamais réellement utilisé (même si le téléchargement + la tâche planifiée fonctionnaient désormais correctement). Même mismatch pour le SFX manuel : son `RunProgram="%%T\sim-center-agent-win.exe"` supposait déjà un placement à la racine. Fix : le packaging fait maintenant `Push-Location exe` avant d'appeler `7z` avec des noms de fichiers nus (sans préfixe) — la racine de l'archive correspond exactement au contenu du dossier `exe`. **Effet de bord à connaître** : une installation manuelle via le SFX doit désormais cibler le dossier `exe` existant lui-même comme destination d'extraction, plus son parent comme avant ce fix.
- **La tâche planifiée relançait l'agent en session non-interactive, invisible sur le bureau (v2.2.83)** — signalé par l'utilisateur juste après le fix v2.2.82 : l'extraction réussissait mais la relance finale (`wscript.exe` → `start-agent.vbs` → nouvel agent avec son icône de tray) ne se produisait pas visiblement, obligeant un double-clic manuel sur l'exe. Cause : `schtasks /create` sans `/RU`/`/IT` explicites crée par défaut une tâche en logon **non-interactif** (batch/S4U) — le script s'exécute (l'extraction avait déjà réussi), mais tout ce qu'il lance ensuite tourne isolé du bureau réel, invisible. Fix : `/RU <utilisateur courant via os.userInfo().username>` + `/IT` (jeton interactif, pas de mot de passe requis puisque la session est déjà déverrouillée) sur les deux usages de tâche planifiée (`updater.ts` et `handleLocalRestart()`) — exécution indiscernable d'un double-clic manuel.

### 5.8 Watchdog (`watchdogManager.ts` + `assets/watchdog.ps1`, v2.2.67)

- Processus PowerShell détaché et **indépendant** de l'agent — nécessaire car si l'agent lui-même est mort, il ne peut pas s'en apercevoir.
- Démarré par `agent.ts#start()` → `watchdogManager.ensureRunning()`, qui **ne démarre pas de doublon** si un watchdog est déjà vivant (PID tracké dans `<tmp>/simracing-manager/watchdog.pid`, confirmé vivant via `tasklist` en vérifiant que le nom du process est bien `powershell.exe`).
- Boucle : toutes les 20s, vérifie si le process de l'agent tourne (`Get-Process -Name <nom sans extension>`) ; si absent, attend 15s de grâce (tolère une mise à jour/redémarrage légitime en cours), revérifie, puis relance via `start-agent.vbs` si toujours absent.
- **Arrêté explicitement (par PID, `taskkill`) avant tout arrêt volontaire** (`agent.stop()`, `handleUpdate()`, `handleLocalRestart()`) — pour ne jamais entrer en course avec un arrêt/une mise à jour légitime. Le prochain `start()` le réétablit une fois le nouveau processus démarré.
- Journalise dans `watchdog.log` à côté de l'exécutable.
- **Contexte** : ajouté après avoir constaté en conditions réelles qu'une mise à jour ratée laissait les deux stations hors ligne ~90-100s avant de se rétablir seules (grâce au fix 5.7, mais sans garantie pour un futur mode d'échec différent).

### 5.9 Redémarrage local (console de la tray, `handleLocalRestart()`)

- **Avait le même bug cmd.exe que l'updater avant sa correction** — `set /a waitTime+=1` dans un bloc `if (...)` entre parenthèses ne s'incrémentait jamais dans la même itération (les blocs `cmd.exe` évaluent les `%var%` une seule fois, au moment où le bloc est lu). Corrigé (même passe que le watchdog, v2.2.67) avec la même approche PowerShell `Wait-Process`, relance via `start-agent.vbs` (avant : `start "" exe` direct, flash de fenêtre console).
- **Même fix tâche-planifiée que l'updater (v2.2.80)** — script généré à la volée (pas un asset), valeurs (PID, chemins) injectées directement dans le texte du script en littéraux PowerShell single-quote-échappés plutôt que passées en arguments, donc la commande de la tâche planifiée n'a besoin que d'un seul chemin entre guillemets (`-File "<script>"`), zéro risque de mauvais échappement avec plusieurs chemins.

### 5.10 Autres gotchas agent

- `envWriter.ts` doit utiliser `path.dirname(process.execPath)` (jamais `process.cwd()`), sinon l'agent packagé écrit `.env` au mauvais endroit.
- `serverLauncher.ts` utilise des ports dynamiques `9600-9700`/`8081-8181`. Vérifie la disponibilité TCP+UDP avant d'assigner. Ports alloués stockés dans `DedicatedServer.udpPort/tcpPort/httpPort`.
- **Firewall + vérification de port réellement lié (v2.2.58, fix du "Failed to handshake" #1)** : `ensureFirewallRule()` ajoute une règle Windows Firewall unique, programme-wide, pour `acServer.exe` (best-effort, ne bloque jamais le lancement). `waitForPortBound()` vérifie via `netstat -ano -p UDP` que le PID du process possède bien le port avant de considérer le lancement réussi — un process vivant n'est pas la preuve que le port UDP est réellement ouvert (pare-feu, port déjà pris au niveau OS malgré la vérif préalable).
- **`race.ini` du join direct incomplet (v2.2.64, fix du "Failed to handshake" #2, le vrai fix pour le join)** : `writeJoinRaceIni()` n'écrivait que `[RACE]`/`[CAR_0]`/`[REMOTE]`, contrairement à `agent-legacy` (référence connue pour fonctionner) et à `writeRaceIni()` (lancement direct/solo, juste à côté dans le même fichier, qui fonctionne bien) qui écrivent en plus `[AUTOSPAWN]`, `[SESSION_0]`, `[TEMPERATURE]`, `[WEATHER]`, `[WIND]`, `[LIGHTING]` (v2.2.66) et plusieurs champs `[CAR_0]`/`[REMOTE]` (`DRIVERNAME`, `TEAM`, `GUID`, `RESTRICTOR`, `SPECTATOR_MODE`, `SPAWN_POINT`, `NAME`, `__CM_EXTENDED`). Symptôme diagnostiqué via les logs distants (5.11) : `acs.exe` se lance, la mémoire partagée se mappe, mais reste "gelée" en boucle (`packetId` n'avance jamais) — le client n'entre jamais réellement en course. **Confirmé réparé en conditions réelles** (créé un serveur + envoyé un POD réel) : la mémoire partagée passe de "gelée" à "state changed" en ~15s, centaines de paquets de télémétrie reçus en quelques minutes.
- **`DRIVERNAME`/`NAME` du `race.ini` de join laissés vides jusqu'en v2.2.102** — ces champs existaient déjà dans `writeJoinRaceIni()` (depuis le fix v2.2.64 ci-dessus) mais étaient toujours écrits à `''`, alors que `clientName` est bien reçu dans le payload `server:join`. Le pilote n'apparaissait donc jamais nommé en jeu (ni pour lui, ni pour Content Manager s'il est utilisé comme overlay). Fix : `writeJoinRaceIni()` prend désormais `clientName` et le reporte dans les deux champs (CR/LF filtrés). **`SKIN=` passé à `SKIN=random`** en même temps (`[RACE]`+`[CAR_0]`, join **et** lancement direct/solo `writeRaceIni()`) — vide, tout le monde héritait du même skin par défaut.
- **Rétroviseur virtuel (F11) jamais activé jusqu'en v2.2.103** — `AcLauncher` configurait `video.ini` (`configureVideoIni`) et `assists.ini` (`configureAssistsIni`) à chaque lancement mais ne touchait jamais `cfg/gameplay.ini` : sans `[VIRTUAL_MIRROR] ACTIVE=1` dans ce fichier, l'app HUD du rétroviseur virtuel n'existe pas et la touche F11 (raccourci par défaut d'AC pour l'afficher/masquer) ne fait rien. Nouvelle méthode `configureGameplayIni()`, appelée dans `launch()` **et** `joinServer()` juste après `configureVideoIni()`, qui force cette valeur — même prudence que pour `video.ini` (ne crée pas `gameplay.ini` s'il n'existe pas encore sur le poste, AC jamais lancé).
- **`command.txt` (fichier de commande pour l'app Lua, `LuaBridge.sendCommand()`) n'était jamais effacé après exécution, jusqu'en v2.2.114** — signalé par l'utilisateur : "quand je lance le jeu sans passer par l'agent il se coupe tout de suite dès qu'on rentre dans la session". `luaBridge.quit()` (envoyé à la fin de **chaque** session) écrit `type=quit` dans ce fichier, qui y reste indéfiniment. L'app Lua repart avec `lastCommandId = nil` à chaque nouveau chargement d'AC — au tout premier tick de la session suivante, elle trouve ce `quit` périmé, le croit neuf, et l'exécute (`ac.shutdownAssettoCorsa()`) : le jeu se ferme quasi instantanément. Un lancement via l'agent échappait au bug par pur hasard de timing (`autoStart()` réécrit `command.txt` juste après le spawn d'`acs.exe`, bien avant qu'AC ait pu charger son environnement Lua) — un lancement direct (Steam, Content Manager, double-clic `acs.exe`) n'a rien qui réécrit ce fichier avant que l'app Lua ne lise le `quit` laissé par la session précédente. Fix : `LuaBridge.clearCommand()` (supprime le fichier, best-effort) appelée dans `AcLauncher.stop()` une fois AC confirmé arrêté (gracieux ou forcé) — chaque fin de session repart sur un fichier de commande propre.
- `server:join` envoie `host`, `port`, `httpPort`, `password`, `carAcId`, `track`, `trackLayout`, `serverName`, `durationMinutes?`, `clientName?`, `difficulty?`, `gearbox?`, `sessionId?`.
- `acLauncher.ts` gère le join soit via Content Manager (`acmanager://race/online/join`), soit en direct (`acs.exe` + `race.ini`).
- L'agent ne scanne **pas** activement les process `acServer.exe` en cours — le statut du serveur dédié dépend uniquement de `server:started`/`server:stopped`, ce dernier étant émis soit sur arrêt volontaire, soit sur crash tardif détecté par le listener `exit` du child process (v2.2.68, voir 5.12).
- `pkg` embarque `lua_app/**/*`, `assets/**/*`, `node_modules/koffi/**/*`. Binaires natifs koffi copiés à côté de l'exécutable par `postpackage:win`.
- koffi est **Windows uniquement**. Sur Linux/macOS le lecteur mémoire partagée ne fait rien, la télémétrie retombe sur UDP/HTTP/fichier Lua.
- **Aperçus (previews)**: `contentScanner.ts` envoie les images en base64 brut (jusqu'à 2 Mo/image). DDS converties en PNG via ImageMagick si disponible.
- **Photos de circuits manquantes (v2.2.56)** : un circuit multi-layout a son `ui_track.json`/`preview.png` par layout sous `<track>/ui/<layout>/` (convention standard), pas `<track>/<layout>/` (données 3D, référencées par `models_<layout>.ini`). L'ancien code ne vérifiait que ce dernier chemin. `discoverLayoutNames()`/`findLayoutPreview()` vérifient maintenant les trois conventions. Nécessite une resynchronisation de contenu par POD (bump de `CACHE_VERSION` la force automatiquement).
- **Schéma de circuit scanné localement (v2.2.128)** : `findLayoutSchema()`/`findTrackLayoutSchema()`, mêmes conventions de recherche que `findLayoutPreview()`/`findTrackPreview()` ci-dessus, mais pour `outline.png` (le fichier standard AC utilisé par le menu de sélection de circuit du jeu pour dessiner le tracé vu du dessus — c'est ce que Content Manager affiche dans sa fiche circuit) plutôt que `preview.png`. `Track`/`TrackLayout` gagnent `layoutImage`. Un circuit sans `outline.png` (mod incomplet) garde simplement `layoutImage: undefined`, sans erreur — `CACHE_VERSION` 9 force la resynchronisation de tout circuit déjà en cache d'une version antérieure de l'agent.
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
- **`[PRACTICE] TIME=` passé à 720 (12h) au lieu de 30 minutes (v2.2.105, demandé par l'utilisateur)** — avec `LOOP_MODE=1`, une durée courte de 30 min faisait automatiquement basculer le serveur en Qualifying puis Race, coupant les pilotes en pleine conduite libre (grille imposée, écran de session) pour un usage qui est en pratique de la conduite libre continue toute la journée. `SUN_ANGLE=80` (~17:00) était déjà une constante fixe identique pour chaque serveur créé — le second point de la demande ("bloquer sur l'heure actuelle qu'on avait mis") était déjà satisfait, aucun champ ne permettant de le faire varier à la création.
- **`writeServerConfig()` génère `[PRACTICE]`/`[QUALIFY]`/`[RACE]`/`[WEATHER_N]` dynamiquement depuis `payload.raceFormat` depuis v2.2.115** (remplace les blocs figés ci-dessus, voir "Formats de course" en 3.1/3.2/4.2) — `buildSessionSections()`/`buildWeatherSections()`. Une session désactivée est **omise entièrement** du fichier (pas un flag à 0) : `acServer.exe` passe simplement à la session suivante configurée. Repli sur `DEFAULT_RACE_FORMAT` (mêmes valeurs que l'ancien code figé) si `payload.raceFormat` est absent — protection contre un décalage de version backend/agent pendant un déploiement, pas un cas attendu en fonctionnement normal. **Limite du protocole acServer.exe vanilla, assumée et documentée plutôt que contournée par une fausse fonctionnalité** : pas de météo par type de session (Practice/Qualifying/Race partagent toujours les mêmes `[WEATHER_N]`), seulement une rotation entre plusieurs entrées d'un lancement à l'autre si `weatherGraphics` en contient plusieurs.

## 6. Contrats partagés (`packages/shared`)

Toujours builder ce workspace **avant** backend/agent/frontend si les types/contrats changent.

### 6.1 `AgentToServerEvents` (agent → backend)

`agent:register`, `agent:heartbeat` (`HeartbeatPayload`), `agent:log` (`LogPayload`), `agent:results` (`ResultsPayload`), `agent:status` (`StatusPayload`), `agent:session:started` (v2.2.98 — voir 5.5), `agent:session:ended`, `agent:content`, `agent:telemetry` (`TelemetrySnapshot`), `agent:telemetry:csv` (`TelemetryCsvPayload`), `server:started`, `server:stopped`, `agent:logs` (v2.2.63).

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
