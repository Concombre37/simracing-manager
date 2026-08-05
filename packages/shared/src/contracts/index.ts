import { StationConfig } from '../types';
import { StationStatus, StationRole } from '../enums';

export interface AgentToServerEvents {
  'agent:register': (payload: { stationId: string; stationName: string; version?: string }) => void;
  'agent:heartbeat': (payload: HeartbeatPayload) => void;
  'agent:log': (payload: LogPayload) => void;
  'agent:results': (payload: ResultsPayload) => void;
  'agent:status': (payload: StatusPayload) => void;
  /** Sent once per session, the moment the player can actually drive
   * (blanking confirmed torn down) — not at launch/join time. The backend
   * stamps Session.startedAt on receipt so the duration countdown shown on
   * the dashboard doesn't tick down during the loading screen. */
  'agent:session:started': (payload: { sessionId: string }) => void;
  'agent:session:ended': (payload: { sessionId: string }) => void;
  'agent:content': (payload: { stationId: string; content: Record<string, unknown> }) => void;
  'agent:telemetry': (payload: TelemetrySnapshot) => void;
  'agent:telemetry:csv': (payload: TelemetryCsvPayload) => void;
  'server:started': (payload: {
    serverId: string;
    serverDir?: string;
    udpPort: number;
    tcpPort: number;
    httpPort: number;
  }) => void;
  'server:stopped': (payload: { serverId: string; error?: string }) => void;
  /** Response to 'logs:request' — the agent's in-memory ring buffer of its
   * last ~100 log lines (same content shown in its local tray console),
   * so an admin can check what happened on a POD without walking up to it. */
  'agent:logs': (payload: { stationId: string; lines: string[] }) => void;
}

export interface ServerToAgentEvents {
  'agent:provisioned': (payload: { stationId: string; apiKey: string }) => void;
  'agent:unauthorized': (payload: { reason: string }) => void;
  'session:launch': (payload: LaunchSessionPayload) => void;
  'session:stop': () => void;
  'session:extend': (payload: {
    sessionId: string;
    minutes: number;
    newDurationMinutes: number;
  }) => void;
  'ac:idealLine': () => void;
  'ac:autoShifter': () => void;
  'ac:teleportToPits': () => void;
  'vr:recenter': () => void;
  'system:restart': () => void;
  'system:update': () => void;
  'system:shutdown': () => void;
  'wol:send': (payload: { targetMac: string; targetIp?: string }) => void;
  'content:sync': () => void;
  'server:join': (payload: {
    host: string;
    port: number;
    httpPort: number;
    password?: string;
    carAcId: string;
    /** Resolved display name (custom rename if set, else the cleaned raw AC
     * name) — shown on the launching/results blanking screens instead of
     * the raw acId. Optional so older backends without this field don't
     * break the contract; the agent falls back to carAcId if absent. */
    carName?: string;
    track: string;
    /** Same resolution as carName, for the track. */
    trackName?: string;
    trackLayout?: string;
    serverName?: string;
    durationMinutes?: number;
    clientName?: string;
    difficulty?: 'EASY' | 'PRO' | 'CUSTOM';
    gearbox?: 'MANUAL' | 'AUTO';
    sessionId?: string;
  }) => void;
  'server:launch': (payload: LaunchDedicatedServerPayload) => void;
  'server:stop': (payload: { serverId: string }) => void;
  'blanking:hide': () => void;
  'blanking:show': () => void;
  'blanking:mediaUpdated': () => void;
  'settings:updated': (payload: { blankingDelaySeconds: number }) => void;
  /** Pushed on every connect and whenever an admin changes the station's role
   * from the dashboard, so the agent can gate the blanking screen off
   * entirely for hosting-only (admin) stations. */
  'station:role': (payload: { role: StationRole }) => void;
  /** Asks the agent to send back its current log ring buffer via 'agent:logs'. */
  'logs:request': () => void;
}

export interface ServerToClientEvents {
  'station:updated': (payload: {
    stationId: string;
    status: string;
    blankingActive: boolean;
  }) => void;
  'station:telemetry': (payload: TelemetrySnapshot) => void;
  'session:updated': (payload: {
    sessionId: string;
    stationId: string;
    durationMinutes?: number;
    remainingSeconds?: number;
    status: string;
  }) => void;
}

export interface HeartbeatPayload {
  stationId: string;
  stationName: string;
  version: string;
  localIp: string | null;
  macAddress: string | null;
  acRunning: boolean;
  blankingActive: boolean;
  timestamp: number;
}

export interface LogPayload {
  stationId: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  meta?: Record<string, unknown>;
  timestamp: number;
}

export interface ResultsPayload {
  stationId: string;
  sessionId: string;
  result: Record<string, unknown>;
}

export interface TelemetryCsvPayload {
  stationId: string;
  sessionId: string;
  csv: string;
}

export interface StatusPayload {
  stationId: string;
  status: StationStatus;
  message?: string;
}

export interface TelemetrySnapshot {
  stationId: string;
  sessionId?: string;
  timestamp: number;
  speedKmh: number;
  rpm: number;
  gear: number;
  throttle: number;
  brake: number;
  steering: number;
  lapTimeMs?: number;
  bestLapMs?: number;
  lastLapMs?: number;
  lapCount?: number;
  position?: number;
  trackPosition?: number;
  worldPosition?: { x: number; y: number; z: number };
  isInMainMenu?: boolean;
  isSessionStarted?: boolean;
  isOnlineRace?: boolean;
}

export interface LaunchSessionPayload {
  sessionId: string;
  config: unknown;
  stationConfig?: StationConfig;
  /** Resolved display names for the blanking launching/results screens —
   * see 'server:join' for the same fields on the join-a-dedicated-server
   * path. */
  carName?: string;
  trackName?: string;
}

export interface LaunchDedicatedServerPayload {
  serverId: string;
  name: string;
  track: string;
  trackLayout?: string;
  cars: string[];
  maxClients: number;
  password?: string;
  rconPassword?: string;
  udpPort?: number;
  tcpPort?: number;
  httpPort?: number;
}
