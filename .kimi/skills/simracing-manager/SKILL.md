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
├── agent/                # LEGACY agent (do not modify unless migrating)
├── docker-compose.yml
├── nginx-simracing.hytlabs.com.conf
└── .kimi/skills/simracing-manager/SKILL.md  (this file)
```

## 3. Backend (`apps/backend`)

- **Framework**: NestJS 10, global prefix `/api`, port `3002` in production/Docker.
- **Real-time**: two Socket.IO gateways:
  - `/agent` — agent provisioning, heartbeat, commands (`AgentGateway`, guarded by `AgentAuthGuard`).
  - root namespace `/` — dashboard gateway for frontend, emits `station:updated`.
- **Auth**: JWT (`accessToken`) for users; SHA-256 hashed API keys for agents.
- **Key modules**: `Auth`, `Users`, `Stations`, `Sessions`, `DedicatedServers`, `Agent`, `Dashboard`, `Content`.
- **Prisma**: schema at `apps/backend/prisma/schema.prisma`. **Migrations are manual** — not run by Docker. Always run `npx prisma migrate deploy --schema=apps/backend/prisma/schema.prisma` after schema changes.
- **Static files**: backend serves built frontend from `apps/frontend/dist` via `@nestjs/serve-static`.

### Important backend gotchas

- `AgentAuthGuard` joins authenticated sockets to room `station:<stationId>`. All agent-targeted commands use `this.server.to('station:<id>').emit(...)`.
- `AGENT_API_KEY_SALT` env var is validated but **not used** in code (plain SHA-256).
- The existing migration `20260616022757_init` defines an older `dedicated_servers` table that does **not** match the current Prisma schema. After any schema change, generate a new migration or use `prisma db push` in dev.
- Dashboard `station:command` accepts `launch`/`stop` but they are **not forwarded** to agents; use REST endpoints instead.

## 4. Frontend (`apps/frontend`)

- **Stack**: React 18 + TypeScript + Vite + Tailwind 3.4 + TanStack Query + Axios + Socket.IO.
- **Routes**: `/login`, `/`, `/stations`, `/dedicated-servers`, `/leaderboard`, `/users`.
- **API base**: `import.meta.env.VITE_API_URL` or `/api`.
- **Real-time**: `useSocket.ts` connects to root namespace with JWT; listens to `station:updated`.
- **Auth context**: stores JWT in `localStorage.accessToken`, fetches `/api/auth/me` on mount.

### Frontend gotchas

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
- `serverLauncher.ts` currently hardcodes ports `9600`/`8081`. The legacy agent used dynamic ports `9600-9700` / `8081-8181`. Multiple servers on one station will collide until dynamic allocation is restored.
- `server:join` payload only sends `host`, `port`, `password`. For full POD support it must also send `carAcId`, `track`, `trackLayout`, `serverHttpPort`.
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
5. Create GitHub release and upload `apps/agent/exe/sim-center-agent-win.exe` as `sim-center-agent-win.exe`.
6. Redeploy backend Docker image.

### Release gotchas

- Verify the uploaded asset hash/size against the local file. CDN caching can serve an old asset; use `?nocache=<ts>` to test.
- Do **not** release the legacy `agent/exe/sim-center-agent-win.exe`.

## 9. Testing Checklist

After agent/backend changes, verify:

- [ ] Agent provisions and appears `online` on the Stations page.
- [ ] Heartbeat keeps station online.
- [ ] Content scan shows cars/tracks for the station.
- [ ] Creating a dedicated server launches `acServer.exe` on the agent.
- [ ] Server ports are unique per server on the same host.
- [ ] Join/POD command reaches the agent and launches CM/AC with the right car/track.
- [ ] Stop server terminates only the correct process.
- [ ] Agent update (`system:update`) downloads and restarts from latest release.

## 10. Common Commands

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

## 11. When Modifying This Project

- Keep changes minimal and aligned with existing NestJS/React patterns.
- Update `@simracing/shared` contracts before backend/agent when adding WebSocket events.
- Always run `npm run build --workspace=@simracing/shared` after changing shared code.
- After Prisma schema changes, generate a migration and apply it.
- Update this skill file if you change architecture, build steps, or deployment.
