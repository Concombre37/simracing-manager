import { StationConfig } from '../types';
import { StationStatus } from '../enums';

export interface AgentToServerEvents {
  'agent:heartbeat': (payload: HeartbeatPayload) => void;
  'agent:log': (payload: LogPayload) => void;
  'agent:results': (payload: ResultsPayload) => void;
  'agent:status': (payload: StatusPayload) => void;
}

export interface ServerToAgentEvents {
  'session:launch': (payload: LaunchSessionPayload) => void;
  'session:stop': () => void;
  'ac:idealLine': () => void;
  'ac:autoShifter': () => void;
  'ac:teleportToPits': () => void;
  'vr:recenter': () => void;
  'system:restart': () => void;
  'system:update': () => void;
  'content:sync': () => void;
}

export interface ServerToClientEvents {
  'station:updated': (payload: { stationId: string; status: string }) => void;
}

export interface HeartbeatPayload {
  stationId: string;
  stationName: string;
  version: string;
  localIp: string | null;
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

export interface LaunchSessionPayload {
  sessionId: string;
  config: unknown;
  stationConfig?: StationConfig;
}
