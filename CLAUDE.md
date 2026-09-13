
# SimRacing Manager

Use this as the project operating guide. Treat the repository and GitHub as the source of truth; do not rely on older chat summaries.

## Current verified state

- Repository: Concombre37/simracing-manager
- Local workspace: C:/Users/Concombre/Documents/ChatGPT/simracing manager
- Production URL: https://simracing.hytlabs.com
- Production SSH alias: hytlabs; checkout: /root/sim-center-manager
- Current main/tag: ba230a3, v2.2.175 (2026-09-12)
- Stack: NestJS 10 + Prisma/PostgreSQL 16, React/Vite/Tailwind, Windows Node agent packaged with pkg, npm workspaces.
- Agent source: apps/agent; legacy reference only: agent-legacy.
- Never commit or delete the existing untracked transfer archives, transfer-box/, ws2025.png, or ws2025.ppm unless the user explicitly asks.

For host inventory, Proxmox, SSH safety, and sensitive infrastructure instructions, read the concombre-infrastructure skill before operating a server.

## Release and feature history

The agent release chain is cumulative. Do not remove an older fix because a later tag is not obvious. The recent verified chain is:

- v2.2.144–v2.2.153: Wake-on-LAN, fleet controls, parallel actions, mandatory Drive, Lua/PressDriveKey and robust dedicated-server/race handling.
- v2.2.154–v2.2.157: spectator role, automatic spectator screen, FFmpeg capture and startup fixes.
- v2.2.158–v2.2.165: end-of-session targeted ranking, no-valid-time protection, historical BDD times, vehicle fallback and robust podium/context groups.
- v2.2.166–v2.2.169: hidden track layouts, merged layout inventories, per-station content presence and rescan cache invalidation.
- v2.2.170–v2.2.174: menu public/subscriber prices limited to Cuisine/Bar, grams, reorderable categories/items, optional descriptions, tablet idle timeout and blanking security-bar fix.
- v2.2.175: fleet Mods workflow, admin inventory visibility, leaderboard driver attribution fix, missing-mod sorting and source-to-station content propagation.

The complete historical detail lives in CHANGELOG.md and GitHub releases.

## Repository map

- apps/backend: REST API, Socket.IO agent gateway, services, Prisma schema/migrations.
- apps/frontend: authenticated dashboard and public/tablet routes.
- apps/agent: Windows agent: Content Manager/AC launch, Drive helper, blanking, scans, telemetry, spectator capture, content sync.
- packages/shared: shared enums, DTO-like types and Socket.IO contracts. Change this before changing backend/agent event payloads.
- apps/backend/prisma/schema.prisma: database schema.
- apps/backend/prisma/migrations: append-only migrations; never edit an applied migration.
- .github/workflows/ci.yml: lint/typecheck, builds and tests.
- .github/workflows/release-agent.yml: tag-driven Windows/Linux agent artifacts.
- CLAUDE.md: Claude project notes; keep aligned with this skill when architecture changes.

## Roles and boundaries

Station roles are simulator, admin, and spectator.

- Simulator: player POD; may launch direct sessions and join dedicated servers.
- Admin: hosting/control machine; may host dedicated servers and appear in Mods inventory, but must never be a player target.
- Spectator: display/capture station; excluded from driving, fleet content comparison, joins and blanking commands unless a feature explicitly says otherwise.

Apply role checks in both frontend and backend. Never trust a UI filter as authorization.

## Important API and realtime paths

All backend routes use the global /api prefix unless stated otherwise.

- Stations: GET /stations, POST/PATCH/DELETE /stations, POST /stations/:id/sync-content, POST /stations/:id/update-agent, GET /stations/:id/logs.
- Fleet actions: /api/bulk-actions/{wake,restart,shutdown,blanking-hide,blanking-show,update-agent,sync-content}; use Promise.allSettled semantics so one POD cannot block the fleet.
- Content catalog: GET /content/catalog, GET /content/packages/:id/download.
- Content labels/previews: /content/labels, /content/previews; public tablet catalogue is under /external/v1/content.
- Mods propagation (v2.2.175): admin calls POST /stations/:id/share-content with {type, acId, targetStationIds}. The source agent receives Socket.IO content:share, archives only the validated AC folder, and uploads multipart to POST /content/source-upload. The server stores the archive in ContentPackage.archiveData and emits content:sync to targets. Migration: 20260912160000_add_content_package_data.
- Agent namespace: /agent. Shared events include content:sync, content:share, agent:content, agent:results, status/heartbeat, launch/join, blanking, power and logs.
- Results/leaderboard: GET /leaderboard and GET /leaderboard/history. A multi-driver result must attribute each clean lap to its driver/car index; never use the session client name blindly.
- Spectator: /spectator dashboard, public /spectator/screen, recording/live capture endpoints documented in the backend module.
- Tablet: /tablet-menu is handled by TabletMenuHtmlController, outside the normal static fallback. Do not break its modulepreload injection.

## Content and Mods rules

collectModInventory() deduplicates cars/tracks by type:acId across simulator and admin station scans. Spectators are excluded. A row contains per-station presence, layouts and missing locations.

The Mods page must keep these workflows:

1. Search by display name, AC id or layout.
2. Filter by type, present station, missing station and “missing only”.
3. Sort missing first, complete first or by name.
4. Show every source and missing station without duplicating a car/circuit card.
5. Propagate from a station that has the content to all selected missing stations.

Source sharing is asynchronous. A target that was offline is caught up by agent catalog sync on connection. Agents older than v2.2.175 cannot handle content:share; update the agent before diagnosing a propagation failure.

The agent catalog sync resolves relative archive URLs against SERVER_URL, sends the station API key on downloads, awaits extraction, and prevents concurrent duplicate syncs. Keep archive paths restricted to a scanner-derived car/track folder and reject path traversal.

## Race and result rules

- Practice, qualifying and race formats are stored/configured in the backend and sent as RaceFormatConfig; preserve defaults and all enabled phases.
- Every course format must send the required server/drive flow through the current agent path; inspect logs before changing launch behavior.
- End-of-session screen uses archived BDD times from sessions before the current session. It never ranks from the current race_out.json.
- Display groups are positions 1–3, then the concerned driver plus immediate predecessor/successor, with one ··· separator and no invented positions.
- If no valid time exists, show the required fallback message and dashes; never fabricate a time.
- For multi-driver sessions, use the result's player/car mapping and normalize names only for matching.

## Agent/AC gotchas

- Drive: the modern agent uses the packaged PressDriveKey.exe helper (ViGEmBus) plus Lua fallback. For a real POD diagnosis, inspect remote agent logs and Documents/Assetto Corsa/logs/pressdrivekey.log.
- Content Manager is the normal launch path. Do not replace it with a local desktop-only workaround.
- Blanking is role-gated and the delay comes from backend settings; do not hardcode a new timeout.
- Content scans must preserve known-good inventories and invalidate track cache when layout UI/outline files change.
- Spectator capture is intentionally Windows/FFmpeg based; missing FFmpeg is logged and non-blocking.
- Agents receive settings and role on first heartbeat; keep that handshake when adding events.

## Safe implementation workflow

1. Read git status --short, current branch, latest tag and relevant CHANGELOG.md entries.
2. Inspect the actual code, shared contract and existing tests before proposing a new protocol.
3. For backend/agent events, edit packages/shared first, then backend and agent.
4. For Prisma changes, add a new timestamped migration, run npx prisma generate, apply npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma with the configured production DATABASE_URL, then build.
5. Run targeted tests plus:
   - npm run build --workspace=@simracing/shared
   - npm run typecheck --workspace=@simracing/agent
   - npm run typecheck --workspace=@simracing/backend
   - npm run typecheck --workspace=@simracing/frontend
   - npm run build --workspace=@simracing/backend
   - npm run build --workspace=@simracing/frontend
6. Commit only tracked intended changes. If a local hook fails because the runtime cannot find npx, fix the environment first; use a bypass only when the user has authorized the commit and the hook itself is unavailable.
7. Push main only for requested work. For agent code, bump all workspace versions and apps/agent/src/version.ts, update CHANGELOG.md, tag vX.Y.Z, and wait for Release SimCenter Agent to finish before telling the user the artifact is ready.
8. Deploy backend/frontend from the server checkout:
   ssh hytlabs
   cd /root/sim-center-manager
   git pull --ff-only origin main
   if schema changed: npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma
   npm run build --workspace=@simracing/shared
   npm run build --workspace=@simracing/frontend
   docker compose up -d --build backend
   docker ps --filter name=simracing-backend
   Build backend too when backend source changed; Docker copies the host-built dist.
9. Verify the deployed result: container state/logs, production route or bundle string, migration status and (for agent releases) GitHub release assets. Do not claim deployment from a local build alone.

## Validation and safety

- Never print or paste JWTs, station API keys, SSH keys, cookies, database URLs with credentials or raw secret-bearing logs.
- Do not use production station commands (launch, join, shutdown, restart, WOL) without explicit user authorization. Clean up test sessions/servers.
- For UI changes, verify the real route after deployment and account for browser cache/hash changes.
- If CI fails, inspect the failing job and distinguish setup/test incompatibility from a regression. Current known issue: the backend Jest configuration also discovers a Vitest-based leaderboard spec under CommonJS; run that spec with Vitest or fix the test runner configuration before treating it as a product failure.
- Keep production database backups and ZFS/infrastructure concerns in the infrastructure skill, not in application code or chat logs.

## Release checklist

- [ ] Shared contract/build updated.
- [ ] Tests/typechecks pass or failures are documented with cause.
- [ ] Prisma migration generated/applied when needed.
- [ ] Version/changelog/tag/release assets updated for agent changes.
- [ ] Production backend/frontend rebuilt and container healthy.
- [ ] Deployed bundle/route and relevant logs verified.
- [ ] No secrets or unrelated untracked artifacts committed.

