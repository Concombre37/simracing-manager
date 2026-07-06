# SimRacing Manager — Skill

Project-scope knowledge for working on the `simracing-manager` monorepo.

## 1. Project Overview

- **Repo**: `/root/sim-center-manager`
- **GitHub**: `Concombre37/simracing-manager`
- **Production**: `https://simracing.hytlabs.com`
- **Architecture**: NestJS backend + React/Vite frontend + Node.js Windows agent, all in npm workspaces.
- **Current version**: `2.2.49` (agent version is the source of truth; root `package.json` may lag).

### Active agent

| Path            | Role                                                                                                          | Version  | Released?              |
| --------------- | ------------------------------------------------------------------------------------------------------------- | -------- | ---------------------- |
| `apps/agent/`   | New monorepo agent, uses `@simracing/shared`, auto-provisioning + API-key auth, koffi shared-memory telemetry | `2.2.49` | Released               |
| `agent-legacy/` | Legacy standalone agent (archived, do not use or release)                                                     | —        | Legacy, do not release |

## 2. Monorepo Layout

```
sim-center-manager/
├── apps/
│   ├── backend/          # NestJS 10 + Prisma 5 + PostgreSQL 16
│   ├── frontend/         # React 18 + Vite + Tailwind 3.4
│   └── agent/            # Windows agent (Node 20, pkg)
├── packages/
│   └── shared/           # Shared types, enums, Socket.IO contracts
├── agent-legacy/         # LEGACY agent (archived, do not use)
├── docker-compose.yml
├── nginx-simracing.hytlabs.com.conf
├── CHANGELOG.md
└── .kimi/skills/simracing-manager/SKILL.md  (this file)
```

## 3. Backend (`apps/backend`)

- **Framework**: NestJS 10, global prefix `/api`, port `3002` in production/Docker.
- **Real-time**: two Socket.IO gateways:
  - `/agent` — agent provisioning, heartbeat, commands (`AgentGateway`, guarded by `AgentAuthGuard`).
  - root namespace `/` — dashboard gateway for frontend, emits `station:updated`.
- **Auth**: JWT (`accessToken`) for users; SHA-256 hashed API keys for agents.
- **Key modules**: `Auth`, `Users`, `Stations`, `Sessions`, `DedicatedServers`, `Agent`, `Dashboard`, `Content`, `ContentPreviews`, `BlankingMedia`, `PowerManagement`, `Telemetry`.
- **Prisma**: schema at `apps/backend/prisma/schema.prisma`. **Migrations are manual** — not run by Docker. Always run `npx prisma migrate deploy --schema=apps/backend/prisma/schema.prisma` after schema changes.
- **Static files**: backend serves built frontend from `apps/frontend/dist` via `@nestjs/serve-static`.
- **Agent socket buffer**: `AgentGateway` uses `maxHttpBufferSize: 1 * 1024 * 1024 * 1024` to accept large content payloads with previews.

### Important backend endpoints

- `GET /api/stations` — list stations (admin/technician).
- `POST /api/stations/:id/wake` — Wake-on-LAN via a relay POD on the same subnet (admin/technician).
- `POST /api/stations/:id/shutdown` — remote shutdown via agent WebSocket (admin/technician).
- `POST /api/stations/:id/launch`, `POST /api/stations/:id/stop` — session control. `launch` is rejected (400) unless the station's `role` is `simulator`.
- `POST /api/stations/:id/sync-content` — force agent content rescan.
- `GET /api/content/previews`, `GET /api/content/previews/:id`, `DELETE /api/content/previews/:id`.
- `GET|POST /api/stations/:id/blanking-media` — per-station blanking media.
- `POST /api/blanking-media/bulk` — upload one file to multiple stations.
- `POST /api/dedicated-servers` — create a dedicated server; rejected (400) unless the host station's `role` is `admin`.
- `POST /api/dedicated-servers/:id/join` — join PODs to a server; any pod whose station `role` isn't `simulator` is skipped (logged warning, not a hard error since it's a batch of PODs).

### Station roles (`simulator` vs `admin`)

- `Station.role` (`'simulator' | 'admin'`, `StationRole` enum in `@simracing/shared`), defaults to `simulator`. Set at creation (`CreateStationModal.tsx`) or changed later from the Stations page (expanded panel → "Type de poste").
- **Simulator** = player-facing POD (wheel/pedals): can run a direct/solo launch and can join a dedicated server as a POD.
- **Admin** = hosting-only PC: can host a dedicated server (`acServer.exe`), cannot launch/join sessions itself.
- Frontend enforces this via filtering (host picker in `CreateDedicatedServer.tsx` only lists `admin` stations; join picker in `DedicatedServers.tsx` only lists `simulator` stations; "Lancer" button hidden for `admin` stations in `Stations.tsx`); the backend enforces it again (see endpoints above) so this can't be bypassed by calling the API directly.

### Important backend gotchas

- `AgentAuthGuard` joins authenticated sockets to room `station:<stationId>` only if not already present. All agent-targeted commands use `this.server.to('station:<id>').emit(...)`.
- **`Session.stationId` is the internal Station UUID (Prisma FK), not the business `stationId` the agent's socket room is named after.** Always navigate through the relation (`session.station.stationId`) when emitting to the agent gateway — using the raw `session.stationId` silently emits to a room nobody has joined (found and fixed in `sessions.controller.ts`'s `extend()`/`stop()` in v2.2.30; `stop()` also needs `include: { station: true }` in `sessions.service.ts`, it didn't have it originally). Every other controller (`stations.controller.ts`, `dedicated-servers.controller.ts`) already does this correctly by going through `station.stationId`.
- `AGENT_API_KEY_SALT` env var is validated but **not used** in code (plain SHA-256).
- Migrations are applied manually; the Docker image does not run migrations on startup.
- Dashboard `station:command` accepts `shutdown`/`wake` but Wake-on-LAN is handled by the `power-management` REST endpoint.
- `AdminOrStationAuthGuard` allows either an admin JWT or a station API key; when used in a module, import `AuthModule` (not raw `JwtModule`) so JWT verification uses the configured secret.

## 4. Frontend (`apps/frontend`)

- **Stack**: React 18 + TypeScript + Vite + Tailwind 3.4 + TanStack Query + Axios + Socket.IO.
- **Routes**: `/login`, `/`, `/stations`, `/dedicated-servers`, `/dedicated-servers/create`, `/dedicated-servers/:id/join`, `/leaderboard`, `/en-cours`, `/users` (admin), `/content-previews` (admin), `/blanking-media` (admin), `/settings` (admin).
- **API base**: `import.meta.env.VITE_API_URL` or `/api`.
- **Real-time**: `useSocket.ts` connects to root namespace with JWT; listens to `station:updated`.
- **Auth context**: stores JWT in `localStorage.accessToken`, fetches `/api/auth/me` on mount.

### Frontend gotchas

- `Stations.tsx` registers `socket.on('station:updated', ...)` directly in render, causing duplicate listeners. Wrap in `useEffect` when modifying.
- `Leaderboard` is a placeholder.
- `/settings` (menu "Paramètres") shows network info (IP/MAC) and WoL/shutdown controls.
- `/blanking-media` (menu "Écrans") allows multi-station bulk upload of blanking media.
- Build outputs to `apps/frontend/dist`; backend serves it in production.
- `Stations.tsx` has both a status filter and a role filter (Tous types/Simulateurs/Admin) as separate pill rows; both apply together (AND, not OR).
- **`JoinServer.tsx`** (full page at `/dedicated-servers/:id/join`, replaced the old `JoinServerModal` in v2.2.x post-2.2.48) — game-style POD send screen: visual POD roster cards, per-pilot name plate, difficulty as three descriptive cards (copy grounded in the actual `assists.ini` values `acLauncher.ts` writes per preset), car grid with preview images (same picker style as `CreateDedicatedServer.tsx`). Defaults `durationMinutes` to `undefined` ("Illimité") — this is the common case operators pick, not an edge case. Any agent/backend logic around sessions must work correctly without a duration (see the agent gotcha about `acSharedMemoryReader` below).
- **`Sessions.tsx`** (`/en-cours`) — session cards use a track-preview banner with the driver name as a nameplate, colored difficulty badges, and a top stat strip (PODs in session, live avg speed, sessions ending within a minute). Resolves car/track names+previews from the joined `stations` query's `content` field (same technique `DedicatedServers.tsx` uses), matched by `session.station.stationId`. `CircularGauge.tsx`'s colors must stay in the app's actual dark palette (`dark-950`/`dark-900` etc., not generic Tailwind grays) — this was a real bug found and fixed (clashing `#111827`/`#1f2937`).

## 5. New Agent (`apps/agent`)

- **Entry**: `src/index.ts`. Packaged with `pkg` target `node18-win-x64`.
- **Config**: `.env` next to the executable (`path.dirname(process.execPath)`). Auto-generated if missing.
- **Auth**: auto-provisioning when `API_KEY` is empty; connects to `/agent` namespace.
- **Key modules**:
  - `config.ts` — Zod-validated `.env` loader.
  - `agent.ts` — WebSocket lifecycle, heartbeat, command handlers.
  - `network.ts` — local IP, MAC address, broadcast address detection.
  - `wol.ts` — Wake-on-LAN magic packet sender (uses `wake_on_lan`, ports 9 + 7, unicast/broadcast).
  - `wolDiagnostics.ts` — checks Windows WoL prerequisites at startup (Fast Startup, adapter settings).
  - `contentScanner.ts` — scans `content/cars` and `content/tracks`.
  - `serverLauncher.ts` — launches `acServer.exe`.
  - `acLauncher.ts` — launches AC/CM sessions.
  - `luaBridge.ts` — writes command files for the in-game Lua app.
  - `acSharedMemoryReader.ts` — reads Assetto Corsa shared memory (`Local\acpmf_physics`, `Local\acpmf_graphics`, `Local\acpmf_static`) via koffi and emits live telemetry snapshots.
  - `telemetryReceiver.ts` — legacy UDP/HTTP telemetry fallback from the CSP Lua app.
  - `telemetryFileReader.ts` — legacy telemetry fallback from a JSON file written by the CSP Lua app.
  - `raceResultReader.ts` — reads `Documents/Assetto Corsa/out/race_out.json` after a session ends and forwards it to the backend via `agent:results`.
  - `blankingManager.ts` / `blankingMediaSync.ts` — blanking screen management.
  - `kioskManager.ts` — kiosk mode during a session (hides taskbar, minimizes other windows); also owns `revealGame()`, called only via `BlankingManager`'s `onGameRevealed` callback (see kiosk/blanking gotcha below) — never call it directly at launch time.
  - `processMonitor.ts` — verifies AC is genuinely running, not just present in `tasklist` (see "Process/shared-memory verification" below).
  - `trayManager.ts` — tray icon + local console window lifecycle (flag-file command bridge, `updateStatus()` snapshot writer). See "Local console" below.
  - `logRingBuffer.ts` / `logFileStream.ts` — in-memory ring buffer + persisted rotated log file (`%TEMP%\simracing-manager\logs\agent.log`) feeding the local console's log panel; the packaged agent normally runs with its console window hidden, so without this file logging, errors were previously discarded entirely.

### Telemetry

The agent has three telemetry sources, all feeding the same `onTelemetrySnapshot()` handler:

1. **Shared memory (primary, Windows-only)** — `AcSharedMemoryReader` polls AC at 10 Hz using koffi. It does not depend on CSP/Lua UDP.
2. **UDP/HTTP receiver (fallback)** — `TelemetryReceiver` listens on `127.0.0.1:19900` (UDP) and `127.0.0.1:19901` (HTTP) for the CSP Lua app.
3. **File reader (fallback)** — `TelemetryFileReader` reads `Documents/Assetto Corsa/cfg/SimCenterManager/telemetry.json`.

`onTelemetrySnapshot()` forwards to the backend via `agent:telemetry` and updates the blanking manager / best-lap tracking.

### Session results

All three ways a tracked session can end — duration expires naturally, is reduced to 0 via extend, or is stopped manually — go through the single `agent.ts#endSession()` method, so they behave identically. On end:

1. `blankingManager.showResults({ ...pending: true })` is called **immediately** (driver/car/track/best-lap already known from live telemetry), showing an F1-styled results screen with a loading spinner where the leaderboard will go — instead of leaving the plain waiting screen up.
2. The agent then waits ~3s for AC to write `Documents/Assetto Corsa/out/race_out.json`, reads it via `raceResultReader.ts`, cleans it via `raceResultCleaner.ts`, and emits `agent:results` to the backend (`AgentGateway` → `sessionsService.finish()` stores the raw JSON in `Session.result`).
3. `showResults()` is called again with the final leaderboard (or a "Classement indisponible" placeholder if `race_out.json` wasn't usable). Sections reveal with a staggered fade/slide-up animation (`generateResultsHtml()` in `blankingManager.ts`).
4. After 60s, `setAuto()` returns to normal blanking.

The results HTML is rendered inside a WPF `WebBrowser` control (legacy IE engine) — `blanking.ps1` sets `FEATURE_BROWSER_EMULATION` for the host process so it renders in IE11 "edge" mode instead of IE7 quirks; CSS must stay IE11-safe (no `clamp()`/CSS Grid/conic-gradient — use flexbox + `vw` units instead).

### Agent gotchas

- `envWriter.ts` must use `path.dirname(process.execPath)` (not `process.cwd()`), otherwise packaged agent writes `.env` in the wrong place.
- `serverLauncher.ts` uses dynamic ports `9600-9700` / `8081-8181`. Allocated ports are stored in `DedicatedServer.udpPort/tcpPort/httpPort`.
- `server:join` payload sends `host`, `port`, `httpPort`, `password`, `carAcId`, `track`, `trackLayout`, `serverName`.
- `acLauncher.ts` handles joining a server via Content Manager (`acmanager://race/online/join`) or direct `acs.exe`.
- The agent does **not** scan running `acServer.exe` processes; server status relies on `server:started` / `server:stopped`.
- `pkg` config bundles `lua_app/**/*`, `assets/**/*`, and `node_modules/koffi/**/*`. koffi native binaries (`.node`/`.lib`) are copied next to the executable by `postpackage:win` and loaded at runtime via a patched koffi loader.
- koffi is **Windows-only**. On Linux/macOS the shared-memory reader no-ops gracefully; telemetry falls back to Lua UDP/HTTP or file.
- Native helpers (`PressDriveKey.exe`, `ViGEmBus`) are not included in the new agent.
- **Previews**: `contentScanner.ts` reads car/track preview images and sends them raw as base64 data URLs (up to 2 MB per image). Jimp compression was removed because it fails inside the packaged executable (`Invalid host defined options`). DDS previews are converted to PNG via ImageMagick (`magick convert`) when available.
- **Sessions**: the backend `Session` model tracks dedicated-server joins with `clientName`, `difficulty`, `carAcId`, `durationMinutes`, etc. The agent emits `agent:status` (`in_game`/`online`) immediately on join/stop and supports `session:extend` to adjust the remaining time. The backend now sends the absolute `newDurationMinutes` so the agent timer stays in sync.
- **`currentSession.durationMinutes` can be `null`** (unlimited/"Illimité" join, the frontend's default). Session tracking (`agent.ts#currentSession`) and the results screen on stop both start regardless of whether a duration was set — **only** the auto-end timer (`scheduleSessionEnd()`) is conditional on having one. Extend can add a duration to a previously-unlimited session later.
- **Known dead-code cleanup (v2.2.40/v2.2.41)**: `HeartbeatPayload.cmRunning`/`vrConnected` were always `false` and never consumed by backend or frontend — removed from the shared contract and the agent. `AcSharedMemoryChecker` (`acSharedMemory.ts`, PowerShell-based polling every 2s) looks redundant with `AcSharedMemoryReader` but isn't: it's the signal for `acLoaded` used by blanking's hide logic above, including **outside** an agent-managed session (e.g. someone launches AC manually without going through the dashboard) — don't remove it.
- **Blanking hide logic is based on AC process presence, not telemetry** (rewritten v2.2.41, after v2.2.29-v2.2.40 all chased pieces of the same "blanking never clears" symptom via a telemetry/shared-memory approach that was never fully reliable — two independent telemetry sources could disagree on "car ready" and the confirmation would never land). `blankingManager.evaluate()`'s auto branch is `shouldHide = acRunning || acLoaded`: `acRunning` from `processMonitor.ts#isAcRunning()`, `acLoaded` from `acSharedMemory.ts` (both polled every 2s in the heartbeat loop). There is no more "car ready" confirmation delay, `onTelemetry()`/`isReady()`/`updateReadyState()`/`clearReady()` were removed from `BlankingManager` entirely, and `podInGame` no longer affects the hide decision (it only resets a stale manual override to `auto` at session start — see below). This matches the previous production launcher ("RS Launcher", closed-source Electron app, not `agent-legacy/`), reverse-engineered specifically to resolve this bug — it hides its idle screen purely on `acs.exe` presence too.
- **Configurable hide delay (v2.2.42)**: `hideDelaySeconds` (default 10s, `BlankingManager.setHideDelaySeconds()`) is a plain timer applied uniformly once `shouldHide` becomes true — gives the game time to actually load before blanking disappears. Configurable from the dashboard (`AppSettings.blankingDelaySeconds`, `/api/settings`, pushed to all agents via `settings:updated`).
- **Kiosk foreground timing must be tied to blanking, not to launch (v2.2.46)**: `kioskManager.enter()` (called at launch) only hides the taskbar and minimizes other windows — it must **never** call `revealGame()` itself. Early versions had `kiosk.ps1`'s `Enter` action bring the game window to the foreground immediately once it existed, racing ahead of the hide-delay timer above and visually covering blanking (topmost or not — a window becoming the OS foreground window always draws above non-foreground topmost windows) well before its grace period elapsed, making the configurable delay look broken. Fixed by giving `kiosk.ps1` a separate `Foreground` action, triggered only via `BlankingManager`'s `onGameRevealed` constructor callback — fired exactly when blanking actually hides (grace period elapsed, or a manual hide override), never earlier.
- **A blanking-process crash must not be treated as a manual close (v2.2.48)**: the window has no title bar/close button (fullscreen kiosk overlay) — the only deliberate way to close it is Escape. The exit handler used to treat _any_ unexpected process exit as "user closed it manually" and switch to `hide` override, instantly revealing the game and completely bypassing `hideDelaySeconds`. Now an exit within `EARLY_EXIT_THRESHOLD_MS` (2s) of spawning is treated as a crash — blanking restarts instead (up to `MAX_EARLY_EXIT_RETRIES` = 3 consecutive attempts before falling back to the old hide-override behavior). The script's stdout/stderr are also piped to the logger so a real crash leaves a trace (see "Local console" below).
- **Process/shared-memory verification, not just presence (v2.2.49)**: a process literally named `acs.exe` existing, or AC's shared-memory sections being mapped, isn't proof the game is actually running/usable — both can outlive the real session (a hung/crashed instance that a previous `taskkill`/`quit()` failed to fully reap, or a shared-memory mapping kept alive by a stale handle). Checked the latest decompiled RS Launcher (`isAssettoRunning()`) for a better technique first — it does the exact same plain `tasklist` check with no extra verification, so this isn't something to copy from there, it had to be built new:
  - `processMonitor.ts#isAcRunning()` now calls `tasklist /V` (verbose) and reads the `Status` column: `acs.exe` present but flagged **"Not Responding"** by Windows no longer counts as running (so it can't fool blanking into hiding). If it stays unresponsive past `NOT_RESPONDING_KILL_THRESHOLD_MS` (5 minutes — deliberately long, since AC's own loading screens can legitimately make it "Not Responding" for a while and killing a game that's genuinely still loading would be worse than leaving a real zombie a bit longer), it's force-killed as cleanup.
  - `check-ac-shared-memory.ps1` / `acSharedMemory.ts` now also check **freshness**: `acpmf_graphics`' `packetId` (first 4 bytes) is read twice, 200ms apart — if it hasn't moved, the mapping is stale (left over from a previous session) and ignored, even if all three sections technically exist.
  - If blanking issues resurface, check both signals independently (heartbeat logs, or the local console's live status) before assuming it's the delay/timer logic — a stale process/mapping bypasses that logic entirely by making `shouldHide` true when it shouldn't be.
- **Session end / results**: on session end the agent reads AC's `race_out.json`, cleans it via `raceResultCleaner.ts`, pushes it to the backend with `agent:results`, and renders a leaderboard on the blanking screen for 60 seconds. See "Session results" above for the instant-display flow.
- **Blanking override reset on session start must be atomic.** `setPodInGame(true)` resets a stale manual override (`hide`/`show` left over from Escape/"Masquer écran") to `auto` **inside itself**, not via a separate `setAuto()` call beforehand — doing it as two steps left a window where `evaluate()` ran with `podInGame` still `false` and could use stale `acLoaded`/`acRunning` state to flicker blanking off for a moment right after launch (fixed v2.2.36). `podInGame` itself no longer feeds the hide decision (see above) but is kept for this reset and for gating kiosk mode/results-screen triggers in `agent.ts`.
- **Blanking/results window orphaning across restarts.** The blanking screen is a child PowerShell/WPF process; on Windows it does **not** die automatically when the agent process exits. `Updater.update()` used to call `process.exit(0)` directly with zero cleanup, so every self-update (or crash) left the old window running while the new agent spawned its own on top — duplicates piling up across restarts (fixed v2.2.38). Now: `BlankingManager.shutdown()` force-kills the active window and is called from `agent.stop()` and from the updater (`onBeforeExit` callback) before exiting; a pid file (`<tmp>/simracing-manager/blanking.pid`) lets `init()` kill any window orphaned by a previous crash on the next startup. `index.ts` also handles `SIGINT`/`SIGTERM` for a graceful stop. If you ever see duplicated blanking/results windows on a POD, it's from _before_ this fix — close them manually (or reboot) once; new duplicates should never appear again.
- **Blanking manual close**: the blanking window can be closed locally by pressing `Escape`; the agent detects this and switches to `hide` override so it does not restart automatically.
- **Blanking video playback**: videos loop when alone, and playback failures skip to the next playlist item.
- **Blanking display targeting**: the `BLANKING_MONITOR` env var selects which screen the blanking/results window appears on (`1` = primary, `2` = secondary, etc.).
- **Kiosk mode** (`kioskManager.ts` + `assets/kiosk.ps1`, Win32 P/Invoke): on session launch (direct or join), hides the Windows taskbar, force-minimizes any other visible window (Explorer, etc. — explicitly **excluding** the blanking window by title and the game's own window by process id, to avoid disrupting a fullscreen game's rendering/telemetry state), and brings the game window to the foreground once it appears (polls up to 20s). Restored (taskbar shown again) on session end via `kioskManager.exit()`, called from the same `endSession()`/`handleStop()` paths as blanking cleanup.
- **Windows auto-start**: setting `AUTO_START=1` in `.env` registers the agent in `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` so it starts automatically on user login.
- **Tray icon + local console (v2.2.47)**: `TRAY_ICON=1` (now the **default** in newly generated `.env` files — existing installs keep whatever they already had, edit `.env` manually to enable) shows a system-tray icon with a context menu: toggle blanking, quit, sync content, check for updates, restart the agent (new — reuses `Updater`'s wait-for-this-PID-then-relaunch technique, no download), and **"Ouvrir la console"** (also double-click the tray icon). The console is a normal (non-kiosk) WPF window — same `WebBrowser`-hosting pattern as `blanking.ps1`, styled with the dashboard's dark palette — showing live status (connected/AC running/blanking active), the last ~100 log lines, and those same actions as buttons. Communication reuses the existing flag-file mechanism (`TrayManager`'s 500ms poll) for clicks, and a `console-status.json` snapshot (written every heartbeat tick via `TrayManager.updateStatus()`) that the console polls and re-renders — no new IPC channel, no Electron (the agent stays a lightweight `pkg` executable).
- **Best invalid (cut) lap on the results screen (v2.2.44)**: AC's own `bestLapMs` (`iBestTime`) already excludes invalid laps. `agent.ts#trackBestLap()` detects a "best invalid lap" by comparison alone — no `numberOfTyresOut` heuristic needed: if a just-completed lap (`lastLapMs`) is faster than the currently known valid best but didn't become the new official best, AC must have rejected it. Shown as a second, red tile on the results screen only when one was actually recorded.
- **`endSession()` shows results before quitting AC, not after (v2.2.46)**: `acLauncher.quit()` can take up to 15s (polls for graceful exit before force-killing). Showing the results screen _first_ (topmost, covers the still-running game) then quitting in the background removes what used to be a dead gap between the session ending and the results appearing.
- **Per-lap telemetry CSV**: during a session the agent records a `laps.csv` file with each completed lap (lap time, max speed/RPM, average throttle/brake, best lap). On session end it uploads the CSV to the backend over the `agent:telemetry:csv` WebSocket event; the backend stores it in `uploads/telemetry/<sessionId>.csv`.
- **AC quit**: agent polls `tasklist` up to 15s after the Lua quit command, then force-kills the process tree if needed (RS Launcher style).
- **Remote agent update**: technicians and admins can trigger an agent update from the Stations page. The agent downloads `sim-center-agent-win.zip` from the latest GitHub release and replaces itself (including koffi native binaries).
- **Server reachability check**: the agent pings `SERVER_URL` before opening the WebSocket and logs a clear warning if the backend is unreachable (helps diagnose network/DNS issues).
- **Single-instance enforcement**: the agent acquires a TCP lock on port `33291` at startup. If another agent instance is already running, the new process exits immediately.
- **Self-healing status reconciliation (v2.2.43)**: `agent.ts#reconcileReportedStatus()` runs every heartbeat tick, comparing the actual `acRunning` state to the last status reported to the backend (`agent:status`) and correcting drift after 2 consecutive mismatched ticks (immediate on the very first observation post-connect). Mirrors RS Launcher's `syncAssettoState()`. Blanking's own state was already implicitly reconciled every tick via `setAcRunning()`'s unconditional `evaluate()` call (since v2.2.41) — no separate fix needed there.
- **Live blanking-status LED (v2.2.45)**: `blankingActive` (from `BlankingManager.isBlankingActive()`) rides the existing heartbeat/`station:updated` channel — no new socket event. Shown as an amber (pulsing)/gray LED per station card on `/stations`. New `stations.blanking_active` DB column.
- **Session stop**: technicians (not only admins) can stop/extend sessions from `/en-cours`.
- **Session end flow**: when duration reaches zero the agent ends the session, pushes `race_out.json` results, shows the results overlay for 60 seconds, then returns to auto blanking.
- **En cours page**: redesigned with circular RPM/speed gauges, throttle/brake bars, larger timer and cleaner info cards; lists active sessions with extend/stop controls.
- **Per-POD join**: the join modal on `DedicatedServers.tsx` lets the operator set a client name, difficulty (EASY/PRO/CUSTOM), and car per POD. Difficulty writes `assists.ini`; client name is shown in-game by the Lua app overlay.
- Heartbeat includes `macAddress` (v2.2.3+).
- WoL packets are sent on ports 9 and 7, unicast to target IP when known, otherwise broadcast (v2.2.4+).
- Startup diagnostics log warnings if Fast Startup is enabled or if no adapter supports Wake on Magic Packet (v2.2.4+).
- Shutdown command (`system:shutdown`) runs `shutdown /s /t 0` on Windows; no-op on Linux/macOS.

## 6. Shared Contracts (`packages/shared`)

- Build this workspace **before** backend/agent/frontend if types/contracts changed.
- Key files: `src/contracts/index.ts`, `src/enums/index.ts`, `src/types/index.ts`.
- Recent additions (v2.2.3): `HeartbeatPayload.macAddress`, `ServerToAgentEvents['system:shutdown']`, `ServerToAgentEvents['wol:send']`.
- `StationRole` enum (`SIMULATOR = 'simulator'`, `ADMIN = 'admin'`) added for the station role feature — see "Station roles" under Backend.
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
npm run package:win      # outputs exe/agent.exe + exe/build/koffi/win32_x64/*.node
```

`package:win` runs:

- `prepackage:win` → build + patch koffi for `pkg`.
- `package:win` → `pkg . --targets node18-win-x64 --out-path exe`.
- `postpackage:win` → copy `koffi.node` / `koffi.lib` / `koffi.exp` to `exe/build/koffi/win32_x64/`.

For distribution, the CI builds a self-extracting Windows installer. Locally you can create a zip of the executable together with the `build/` folder so the native module is found at runtime:

```bash
cd apps/agent/exe
7z a -tzip sim-center-agent-win-vX.Y.Z.zip sim-center-agent-win-vX.Y.Z.exe build
```

The release workflow produces:

- `sim-center-agent-win-setup.exe` — 7-Zip SFX for manual installation.
- `sim-center-agent-win.zip` — used by the agent’s built-in auto-updater (replaces the executable + `build/koffi/win32_x64/` native binaries).

## 8. Release Process

1. Bump version in `apps/agent/package.json` (agent is the source of truth).
2. Update `CHANGELOG.md` if the repo has one.
3. Build shared → backend → frontend → agent.
4. Package agent: `cd apps/agent && npm run package:win`.
5. Commit, tag `vX.Y.Z`, push: `git push origin main --tags`.
6. The `Release SimCenter Agent` workflow builds Windows + Linux assets and publishes them to the GitHub release automatically.
7. Redeploy backend Docker image and apply migrations if backend changes were made.

### Post-release deployment

After a release is published you **must** deploy both sides for the changes to take effect:

1. **Backend / frontend** (server side):

   ```bash
   cd /root/sim-center-manager
   git pull
   npm ci
   npm run build --workspace=@simracing/shared
   npm run build --workspace=@simracing/backend
   npm run build --workspace=@simracing/frontend
   docker compose up -d --build backend
   ```

   The backend image copies the pre-built `apps/frontend/dist`. If backend code changed (routes, roles, gateways, Prisma schema), rebuild and restart the container.

2. **Agent** (Windows POD side):
   - Download `sim-center-agent-win-setup.exe` from the GitHub release.
   - Install it on each POD (it overwrites the previous agent and native binaries).
   - Restart the agent service / process.
   - Verify the version in the agent logs or heartbeat.

### Release gotchas

- **The Windows release asset lags behind the Linux one.** `Release SimCenter Agent` runs `build-windows` and `build-linux` as separate parallel jobs. The Linux job (ubuntu-latest, no extra tooling) finishes fast and uploads `sim-center-agent-linux-x64.tar.gz` first. The Windows job (windows-latest runner, `choco install 7zip`, `pkg`, SFX packaging) takes a few minutes longer. If you check the GitHub release page right after pushing the tag and only see the `.tar.gz`, this is expected — wait a couple of minutes and refresh, or check the workflow run status, before assuming the Windows build failed.
- **Always test the packaged `.exe` on Windows before publishing a release.** `pkg` can build successfully but fail at runtime with `MODULE_NOT_FOUND` for dynamically required files.
- The Windows release asset is a **self-extracting installer** (`sim-center-agent-win-setup.exe`) built with 7-Zip SFX; it extracts the executable **and** `build/koffi/win32_x64/` native binaries. Do not distribute the bare `.exe` alone.
- Verify the uploaded asset hash/size against the local file. CDN caching can serve an old asset; use `?nocache=<ts>` to test.
- Do **not** release the legacy `agent-legacy/` build.
- If the frontend or backend changed, the Docker image must be rebuilt and the container restarted. Releasing only the agent `.exe` is not enough.
- **Agent update does not happen automatically.** Each POD must install the new release or be updated via the dashboard button **MAJ agent** (requires backend/agent v2.2.26+).

## 9. Troubleshooting

### "Stop" or "0 seconds" does nothing

1. **Check the backend is deployed.** Frontend buttons call `POST /sessions/:id/stop` and `POST /sessions/:id/extend`. If backend code changed (roles, gateways), the Docker container must be rebuilt/restarted.
2. **Check the agent version on the POD.** Open the agent log or heartbeat and verify it reports `v2.2.24` (or the target version). If not, install the latest release asset and restart the agent.
3. **Check logs:**
   - Backend: `docker compose logs -f backend`
   - Agent: local log file next to the executable (usually `sim-center-agent-win.log` or console output).
4. **Common causes:**
   - Frontend `dist/` was not rebuilt before Docker image build.
   - Agent `.exe` was not replaced on the POD.
   - CDN served an old release asset (append `?nocache=<timestamp>` to the download URL).

### Blanking screen cannot be closed

- Press `Escape` while the blanking window is focused to close it locally.
- Use the **Masquer écran** button in Stations (requires backend/agent up to date).
- If videos fail to play, convert them to H.264 MP4; WPF `MediaElement` has limited codec support.

## 10. Testing Checklist

After agent/backend changes, verify:

- [ ] Packaged `sim-center-agent-win.exe` starts without `MODULE_NOT_FOUND` on Windows.
- [ ] Agent provisions and appears `online` on the Stations page.
- [ ] Heartbeat keeps station online and MAC address appears in Settings.
- [ ] Content scan shows cars/tracks for the station.
- [ ] `content_previews` table is populated after the content scan.
- [ ] Creating a dedicated server launches `acServer.exe` on the agent.
- [ ] Server ports are unique per server on the same host.
- [ ] Join/POD command reaches the agent and launches CM/AC with the right car/track.
- [ ] Shared-memory telemetry appears live on the `/en-cours` page when AC is running (Windows).
- [ ] Session end pushes `race_out.json` results to the backend and stores them in `Session.result`.
- [ ] Results overlay shows a leaderboard (position, driver, car, laps, best lap) on the blanking screen.
- [ ] Starting a second agent instance on the same POD exits instead of creating duplicate connections.
- [ ] Blanking/results overlay appears on the monitor configured by `BLANKING_MONITOR`.
- [ ] Setting `AUTO_START=1` adds the agent to the Windows startup registry and it launches on next login.
- [ ] With `TRAY_ICON=1`, a Windows tray icon appears and its menu can toggle blanking / quit the agent.
- [ ] After a session, a `laps.csv` file exists with one row per completed lap and is uploaded to `uploads/telemetry/<sessionId>.csv` on the backend.
- [ ] Stop server terminates only the correct process.
- [ ] Agent update (`system:update`) downloads and restarts from latest release.
- [ ] Wake-on-LAN works when a relay POD is online on the same subnet.
- [ ] Remote shutdown powers off the target Windows POD.
- [ ] Joining a POD **without** picking a duration ("Illimité") still: dismisses blanking once the car is ready, shows the results screen on stop, and can receive a duration afterward via extend.
- [ ] Blanking clears when the car is confirmed ready, with no flicker in the first few seconds after launch.
- [ ] Results screen appears immediately on session end (driver/car/track/best lap), with the leaderboard filling in a few seconds later — no plain blanking gap in between.
- [ ] Only one blanking/results window is ever visible at a time — restart the agent (or trigger "MAJ agent") twice in a row and confirm no duplicate window appears.
- [ ] During a session, the taskbar is hidden and the game is in the foreground; other windows open before launch are minimized. Ends when the session ends.
- [ ] Creating a dedicated server rejects a `simulator`-role station as host; joining rejects an `admin`-role station as a POD.

## 10. Common Commands

```bash
# Logs
docker compose logs -f backend

# Database shell
docker exec -it simracing-postgres psql -U simracing -d simracing

# Prisma migrate dev
npx prisma migrate dev --schema=apps/backend/prisma/schema.prisma

# Prisma migrate deploy
npx prisma migrate deploy --schema=apps/backend/prisma/schema.prisma

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
