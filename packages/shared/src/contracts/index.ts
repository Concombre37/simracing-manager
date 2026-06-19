import { StationConfig } from '../types';
import { StationStatus } from '../enums';

export interface AgentToServerEvents {
  'agent:register': (payload: { stationId: string; stationName: string; version?: string }) => void;
  'agent:heartbeat': (payload: HeartbeatPayload) => void;
  'agent:log': (payload: LogPayload) => void;
  'agent:results': (payload: ResultsPayload) => void;
  'agent:status': (payload: StatusPayload) => void;
  'agent:content': (payload: { stationId: string; content: Record<string, unknown> }) => void;
  'agent:telemetry': (payload: TelemetrySnapshot) => void;
  'server:started': (payload: {
    serverId: string;
    serverDir?: string;
    udpPort: number;
    tcpPort: number;
    httpPort: number;
  }) => void;
  'server:stopped': (payload: { serverId: string; error?: string }) => void;
}

export interface ServerToAgentEvents {
  'agent:provisioned': (payload: { stationId: string; apiKey: string }) => void;
  'agent:unauthorized': (payload: { reason: string }) => void;
  'session:launch': (payload: LaunchSessionPayload) => void;
  'session:stop': () => void;
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
    track: string;
    trackLayout?: string;
    serverName?: string;
    durationMinutes?: number;
  }) => void;
  'server:launch': (payload: LaunchDedicatedServerPayload) => void;
  'server:stop': (payload: { serverId: string }) => void;
  'blanking:hide': () => void;
  'blanking:show': () => void;
  'blanking:mediaUpdated': () => void;
}

export interface ServerToClientEvents {
  'station:updated': (payload: { stationId: string; status: string }) => void;
  'station:telemetry': (payload: TelemetrySnapshot) => void;
}

export interface HeartbeatPayload {
  stationId: string;
  stationName: string;
  version: string;
  localIp: string | null;
  macAddress: string | null;
  acRunning: boolean;
  cmRunning: boolean;
  vrConnected: boolean;
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
