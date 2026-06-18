# SimRacing Manager — Skill

Project-scope knowledge for working on the `simracing-manager` monorepo.

## 1. Project Overview

- **Repo**: `/root/sim-center-manager`
- **GitHub**: `Concombre37/simracing-manager`
- **Production**: `https://simracing.hytlabs.com`
- **Architecture**: NestJS backend + React/Vite frontend + Node.js Windows agent, all in npm workspaces.
- **Current version**: matches root `package.json` (e.g. `2.0.x`).

There are **two agent implementations** in the repo. Always confirm which one is being changed/released:

| Path          | Role                                                                                                 | Version  | Released?                      |
| ------------- | ---------------------------------------------------------------------------------------------------- | -------- | ------------------------------ |
| `apps/agent/` | New monorepo agent, uses `@simracing/shared`, auto-provisioning + API-key auth                       | `2.0.x`  | **Yes** (manual release asset) |
| `agent/`      | Legacy standalone agent, includes `PressDriveKey.exe`, `ViGEmBus`, richer dedicated-server/POD logic | `1.3.23` | Legacy, do not release         |

## 2. Monorepo Layout

```
sim-center-manager/
├── apps/
│   ├── backend/          # NestJS 10 + Prisma 5 + PostgreSQL 16
│   ├── frontend/         # React 18 + Vite + Tailwind 3.4
│   └── agent/            # NEW Windows agent (Node 20, pkg)
├── packages/
│   └── shared/           # Shared types, enums, Socket.IO contracts
├── agent-legacy/         # LEGACY agent (archived, do not use)
├── docker-compose.yml
├── nginx-simracing.hytlabs.com.conf
└── .kimi/skills/simracing-manager/SKILL.md  (this file)
```

## 3. Backend (`apps/backend`)

- **Framework**: NestJS 10, global prefix `/api`, port `3002` in production/Docker.
- **Real-time**: two Socket.IO gateways:
  - `/agent` — agent provisioning, heartbeat, telemetry, commands (`AgentGateway`, guarded by `AgentAuthGuard`).
  - root namespace `/` — dashboard gateway for frontend, emits `station:updated` and `station:telemetry`.
- **Auth**: JWT (`accessToken`) for users; SHA-256 hashed API keys for agents.
- **Key modules**: `Auth`, `Users`, `Stations`, `Sessions`, `DedicatedServers`, `Agent`, `Dashboard`, `Content`.
- **Prisma**: schema at `apps/backend/prisma/schema.prisma`. **Migrations are manual** — not run by Docker. Always run `npx prisma migrate deploy --schema=apps/backend/prisma/schema.prisma` after schema changes.
- **Static files**: backend serves built frontend from `apps/frontend/dist` via `@nestjs/serve-static`.

### Important backend gotchas

- `AgentAuthGuard` joins authenticated sockets to room `station:<stationId>`. All agent-targeted commands use `this.server.to('station:<id>').emit(...)`. **The `<id>` is the station’s `stationId` string, not the DB UUID.**
- `AgentGateway` sets `maxHttpBufferSize: 10 MB` so the agent can upload scanned content with embedded preview images.
- `DedicatedServersController.join` emits `server:join` to `station:<stationId>` using the station’s textual `stationId`. The frontend must send `station.stationId`, not `station.id`.
- `join-server.dto.ts` validates `stationIds` as `z.array(z.string().min(1)).min(1)` (not UUIDs).
- `AgentGateway.emitJoinServer` now enumerates sockets in the target room and logs the count. If it logs `0 socket(s) found`, the POD agent is not connected or not authenticated to the `/agent` namespace.
- `AgentGateway` tracks connected station IDs and exposes `getConnectedStationIds()`. `GET /stations/connected` returns the currently connected agent station IDs for quick diagnostics.
- Dedicated-server ports are pre-allocated by the backend at creation time (TCP/UDP 9600–9700, HTTP 8081–8181) and passed to the agent.
- Agent content previews are extracted by `StationsService.updateContent()` and stored in the `content_previews` table. The stored `Station.content` JSON contains preview URLs (`/api/content/previews/<id>`), not inline base64.
- `GET /api/content/previews/<id>` is a public endpoint that returns the image binary with a 24h cache header.
- `AGENT_API_KEY_SALT` env var is validated but **not used** in code (plain SHA-256).
- The existing migration `20260616022757_init` defines an older `dedicated_servers` table that does **not** match the current Prisma schema. After any schema change, generate a new migration or use `prisma db push` in dev.
- Dashboard `station:command` accepts `launch`/`stop` but they are **not forwarded** to agents; use REST endpoints instead.

## 4. Frontend (`apps/frontend`)

- **Stack**: React 18 + TypeScript + Vite + Tailwind 3.4 + TanStack Query + Axios + Socket.IO.
- **Routes**: `/login`, `/`, `/stations`, `/dedicated-servers`, `/leaderboard`, `/telemetry`, `/users`.
- **API base**: `import.meta.env.VITE_API_URL` or `/api`.
- **Real-time**: `useSocket.ts` connects to root namespace with JWT; listens to `station:updated` and `station:telemetry`. Stations page emits `station:command` for AC assists, VR recenter, and blanking hide/show.
- **Auth context**: stores JWT in `localStorage.accessToken`, fetches `/api/auth/me` on mount.

### Frontend gotchas

- `DedicatedServers.tsx` uses image grids for track and car selection. Pass `station.stationId` (not `station.id`) when targeting agents for POD commands.
- Selecting a track auto-fills the server name as `Serveur <track name>` if the name field is empty.
- `Stations.tsx` registers `socket.on('station:updated', ...)` directly in render, causing duplicate listeners. Wrap in `useEffect` when modifying.
- `Leaderboard` is a placeholder.
- `/settings` nav item exists but has no route.
- Build outputs to `apps/frontend/dist`; backend serves it in production.

## 5. New Agent (`apps/agent`)

- **Entry**: `src/index.ts`. Packaged with `pkg` target `node18-win-x64` → `apps/agent/exe/sim-center-agent-win.exe`.
- **Config**: `.env` next to the executable (`path.dirname(process.execPath)`). Auto-generated if missing.
- **Auth**: auto-provisioning when `API_KEY` is empty; connects to `/agent` namespace.
- **Key modules**:
  - `config.ts` — Zod-validated `.env` loader.
  - `agent.ts` — WebSocket lifecycle, heartbeat, command handlers.
  - `contentScanner.ts` — scans `content/cars` and `content/tracks`.
  - `serverLauncher.ts` — launches `acServer.exe`.
  - `acLauncher.ts` — launches AC/CM sessions.
  - `luaBridge.ts` — writes command files for the in-game Lua app.

### Agent gotchas

- `envWriter.ts` must use `path.dirname(process.execPath)` (not `process.cwd()`), otherwise packaged agent writes `.env` in the wrong place.
- `contentScanner.ts` embeds car/track previews as base64 data URLs (max 100 KB per preview) by reading `preview.png` / `preview.jpg` from the AC content folders.
- `serverLauncher.ts` uses dynamic ports `9600-9700` / `8081-8181` since v2.0.5. Allocated ports are stored in `DedicatedServer.udpPort/tcpPort/httpPort`.
- `serverLauncher.ts` writes `CONFIG_TRACK=${payload.trackLayout ?? ''}` so tracks without a layout use an empty `CONFIG_TRACK`. Do **not** use `random` for tracks that have no layout folder, or AC clients will get "layout random for track X is missing".
- `server:join` payload (v2.0.5+) sends `host`, `port`, `httpPort`, `password`, `carAcId`, `track`, `trackLayout`, `serverName`.
- `acLauncher.ts` verifies that `Content Manager.exe` exists before spawning and logs spawn errors.
- **v2.0.16+ join flow**: instead of launching Content Manager, the agent kills any running `acs.exe`, writes a minimal `race.ini` with a `[REMOTE]` section, updates `video.ini`/`assists.ini`, then launches `acs.exe` directly. The bundled CSP Lua app (`SimCenterManager`) detects a `join.flag` and calls `ac.tryToStart(true)` every 0.5s while AC is still in the main menu, which skips the red-wheel screen and drives onto the server automatically.
- **v2.0.18+**: the agent auto-resolves the Assetto Corsa installation path at startup (same logic as the content scanner) and writes it to `.env` as `AC_PATH`. This ensures the Lua app is installed even when `AC_PATH` is not manually configured.
- **v2.0.19+**: the Lua app manifest uses `LAZY=NONE` (not `LAZY=1`) so the script starts automatically with Assetto Corsa, instead of only running when the app window is opened.
- **v2.0.20+**: the Lua app follows the CSP convention: it defines a global `function script.update(dt)` hook and has no `FUNCTION_MAIN` window mapping. This is the same pattern used by the decompiled RS Launcher `RSconnect.lua`.
- **v2.0.21+**: the Lua app is installed at agent startup (not only at join time), and the `join.flag` is kept active during loading screens. It is removed only once the player is actually in an online race (`sim.isOnlineRace`), so `ac.tryToStart(true)` keeps firing until the main menu is reached.
- **v2.0.23+**: the startup Lua app installation runs even when `AC_PATH` is already configured in `.env` (previously it short-circuited and skipped the install).
- **v2.0.22+**: packaged agent snapshot gotcha fixed. `fs.access` + `fs.copyFile` do not reliably read files embedded by `pkg`; use `fs.readFile` + `fs.writeFile` to copy the Lua app from the snapshot to the real AC folder.
- **v2.1.0+**: kiosk / blanking screen mode. The agent shows a full-screen WPF window via an embedded PowerShell script whenever the player is not actively driving. By default it starts in **auto** mode. It hides automatically as soon as Assetto Corsa's shared memory is detected (`Local\acpmf_physics/graphics/static`), meaning the game has finished loading. A legacy fallback also hides the screen when `acs.exe` is running and telemetry indicates real driving. Manual `blanking:hide` and `blanking:show` commands remain available from the Stations page.
- **v2.2.0+**: customizable blanking screen media. Each station can have a playlist of images (PNG/JPG/WEBP) and muted videos (MP4/WEBM) uploaded from the Stations page (`Écran d'attente`). The backend stores files under `uploads/blanking-media/` and notifies the agent via the `blanking:mediaUpdated` WebSocket event. The agent downloads missing media into `%TEMP%\simracing-manager\blanking-media\` and the PowerShell blanking script cycles through them with cross-fade transitions.
- The agent does **not** scan running `acServer.exe` processes; server status relies on `server:started` / `server:stopped`.
- `pkg` config only bundles `lua_app/**/*`; native helpers (`PressDriveKey.exe`, `ViGEmBus`) are not included in the new agent.

## 6. Shared Contracts (`packages/shared`)

- Build this workspace **before** backend/agent/frontend if types/contracts changed.
- Key files: `src/contracts/index.ts`, `src/enums/index.ts`, `src/types/index.ts`.
- Changing contracts requires rebuilding dependent workspaces.

## 7. Build & Deploy

### Development build order

```bash
cd /root/sim-center-manager
npm ci
npx prisma generate --schema=apps/backend/prisma/schema.prisma
npm run build --workspace=@simracing/shared
npm run build --workspace=@simracing/backend
npm run build --workspace=@simracing/frontend
npm run build --workspace=@simracing/agent
```

### Production deploy

```bash
npx prisma migrate deploy --schema=apps/backend/prisma/schema.prisma
docker compose up -d --build backend
```

The backend image copies pre-built `dist/` and `node_modules` from the host. Do **not** build Docker from a clean checkout without building workspaces first.

### Agent packaging

```bash
cd apps/agent
npm run package:win      # outputs exe/agent.exe, rename to sim-center-agent-win.exe
```

## 8. Release Process

1. Bump version in root + all workspace `package.json` files.
2. Build shared → backend → frontend → agent.
3. Package agent: `cd apps/agent && npm run package:win && mv exe/agent.exe exe/sim-center-agent-win.exe`.
4. Commit, tag `vX.Y.Z`, push.
5. Create GitHub release and upload `apps/agent/exe/sim-center-agent-win.exe`. Prefer a versioned asset name (e.g. `sim-center-agent-win-v2.0.14.exe`) to avoid GitHub CDN serving a stale build.
6. Redeploy backend Docker image.

### Release gotchas

- `npm run package:win` produces `apps/agent/exe/agent.exe`. **Always rename it** to the final asset name (`sim-center-agent-win.exe` or `sim-center-agent-win-vX.Y.Z.exe`) before uploading.
- Before uploading, double-check the local exe version: `strings apps/agent/exe/sim-center-agent-win.exe | grep '"version":'` should show the new version.
- GitHub `releases/download` URLs are heavily cached. Reusing the same filename on a release can cause users to download an old build even after a re-upload. Prefer a versioned filename (`sim-center-agent-win-v2.0.14.exe`) or delete the old asset before re-uploading.
- After uploading, **download the asset from the release URL** and verify its version string/hashes match the local file.
- Do **not** release the legacy `agent/exe/sim-center-agent-win.exe`.

## 9. Agent Version Gotcha

Dedicated-server and POD commands (`server:launch`, `server:join`, `server:stop`) were added in agent **v2.0.5** and improved in **v2.0.6**. Content previews are stored in the `content_previews` table since **v2.0.7**. If an agent logs `"version":"2.0.4"` (or older), it will stay silent when receiving these commands even though it is online and other commands (e.g. `ac:autoShifter`) may work.

Release asset expected SHA-256 for v2.2.2 (manual release build):

```
4f6c2a0445c52eeaac1e12b6cd1319092ed5a49541d30e4ed0a275bfea8f67d2
```

To fix a stuck station, replace its local `sim-center-agent-win.exe` with the latest release asset (or re-run the updater) and restart the agent.

### Release token

A GitHub personal access token for pushing releases is stored in `.kimi/skills/simracing-manager/.github-token` (gitignored). Use it with `git remote set-url origin https://<token>@github.com/Concombre37/simracing-manager.git` before pushing tags, or reset the URL afterward.

## 10. Testing Checklist

After agent/backend changes, verify:

- [ ] Agent provisions and appears `online` on the Stations page.
- [ ] Heartbeat keeps station online.
- [ ] Content scan shows cars/tracks for the station, including preview images.
- [x] Creating a dedicated server launches `acServer.exe` on the agent.
- [x] Server ports are unique per server on the same host.
- [x] Join/POD command reaches the agent and launches CM/AC with the right car/track.
- [x] Tracks without a layout use an empty `CONFIG_TRACK` (not `random`).
- [ ] Stop server terminates only the correct process.
- [ ] Agent update (`system:update`) downloads and restarts from latest release.
- [ ] In-game telemetry appears on `/telemetry` when a POD is `in_game` (UDP `127.0.0.1:19900` or fallback `telemetry.json`).
- [ ] Blanking screen hides as soon as AC shared memory is available and reappears on exit.
- [ ] Manual blanking hide/show buttons work from the Stations page even when AC is closed.
- [ ] Custom blanking images/videos uploaded from the Stations page appear on the POD.
- [ ] Blanking playlist reordering and deletion sync to the agent within seconds.

## 11. Common Commands

```bash
# Logs
docker compose logs -f backend

# Database shell
docker exec -it simracing-postgres psql -U simracing -d simracing

# Prisma migrate dev
npx prisma migrate dev --schema=apps/backend/prisma/schema.prisma

# Agent dev (Linux)
npm run dev --workspace=@simracing/agent

# Frontend dev
npm run dev --workspace=@simracing/frontend
```

## 13. Direct Join Reference (RS Launcher)

The extracted RS launcher at `/root/rs-launcher-extracted` (Electron app + CSP Lua app `RSconnect`) is the reference for a reliable direct-join flow:

1. **Server endpoints**: `GET /INFO` returns track/cars/ports; `GET /JSON|{GUID}` returns the assigned car slot.
2. **race.ini** written under `Documents\Assetto Corsa\cfg\race.ini`:
   - `[RACE]` with `TRACK`, `CONFIG_TRACK`, `MODEL`
   - `[CAR_0]` with `MODEL`, `SKIN`
   - `[REMOTE]` with `ACTIVE=1`, `SERVER_IP`, `SERVER_PORT`, `SERVER_HTTP_PORT`, `REQUESTED_CAR`, `PASSWORD`
3. **video.ini**: `CAMERA.MODE` set to `DEFAULT`/`TRIPLE`/`OPENVR` for SINGLE/TRIPLE/VR.
4. **assists.ini**: full `[ASSISTS]` section, `easy` vs `pro` presets.
5. **acs.exe**: launched with no extra arguments (AC reads `race.ini` automatically).
6. **Lua auto-start**: `RSconnect.lua` calls `ac.tryToStart(true)` while `ac.getSim().isInMainMenu` is true and the server sends `skip_menu=true`.
7. **TV mode**: force teleport to pits with `ac.tryToTeleportToPits()`.

Our v2.0.16+ agent mirrors this flow using the `SimCenterManager` Lua app and `acLauncher.ts`.

## 14. Agent First-Run CM Path Prompt (v2.0.15+)

If `LAUNCH_MODE=cm` and Content Manager cannot be found automatically, the agent opens a Windows `InputBox` on first run. The chosen path is saved to `.env` as `CM_PATH`. For silent/headless installs, set `CM_PATH` before starting the agent.

## 13. Troubleshooting Guide

### Modal création de serveur vide / pas de voitures ni circuits

- Vérifie que l’agent Windows est en v2.0.13+ (de préférence la dernière).
- Vérifie que l’agent a bien scanné le contenu : logs `Assetto Corsa content scanned` avec `cars` / `tracks`.
- Supprime `content-cache.json` à côté de l’exe et relance l’agent.
- Dans le front, clique sur **Synchroniser le contenu** pour forcer l’upload.
- Vérifie en DB : `SELECT station_id, content FROM stations;` — `content` doit contenir `cars` et `tracks`.

### Layout “random” manquant pour un circuit

- Les circuits sans variante doivent avoir `CONFIG_TRACK=` vide, **pas** `random`.
- v2.0.17+ corrige `serverLauncher.ts` : `CONFIG_TRACK=${payload.trackLayout ?? ''}`.
- Si le serveur a été créé avant la correction, recrée-le.

### Join serveur / POD : “Content Manager non trouvé”

- L’agent cherche CM dans les emplacements classiques et dans le dossier Steam d’AC.
- Si ce n’est pas trouvé, v2.0.15+ ouvre une boîte de dialogue au premier lancement pour demander le chemin.
- Ou crée un `.env` à côté de l’exe : `CM_PATH=C:\chemin\vers\Content Manager.exe`.

### Join serveur arrive sur l’info serveur CM au lieu de lancer directement

- v2.0.16+ utilise un join direct par `acs.exe` + `race.ini` `[REMOTE]`, sans URI `acmanager://`.
- Le serveur dédié hôte et les POD clients utilisent tous ce flow.

### Menu rouge / pas d’auto-drive à la fin du chargement

- Nécessite **Custom Shaders Patch (CSP)** installé (`ac.tryToStart(true)` est une fonction CSP).
- L’app Lua doit être présente dans `AC\apps\lua\SimCenterManager\` avec :
  - `manifest.ini` contenant `LAZY=NONE`
  - `SimCenterManager.lua` définissant `function script.update(dt)`
- v2.0.20+ corrige le format de l’app Lua.
- v2.0.22+ corrige la copie depuis le snapshot `pkg` (`fs.readFile` + `fs.writeFile`, pas `fs.access`/`fs.copyFile`).
- v2.0.23+ installe l’app Lua au démarrage, même si `AC_PATH` est déjà dans le `.env`.
- Si le dossier est vide après le démarrage : lancer l’agent **en tant qu’administrateur** (écriture dans `Program Files`).

### Pas d’aperçu images dans les cartes voiture/circuit

- Les previews sont générées par l’agent (`contentScanner.ts`) et stockées dans `content_previews`.
- Si `has_content` est faux ou `content` est vide, forcer un rescan (supprimer `content-cache.json`).

## 12. When Modifying This Project

- Keep changes minimal and aligned with existing NestJS/React patterns.
- Update `@simracing/shared` contracts before backend/agent when adding WebSocket events.
- Always run `npm run build --workspace=@simracing/shared` after changing shared code.
- After Prisma schema changes, generate a migration and apply it.
- Update this skill file if you change architecture, build steps, or deployment.
