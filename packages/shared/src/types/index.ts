import {
  UserRole,
  StationStatus,
  LaunchMode,
  ScreenMode,
  AssistPreset,
  SessionStatus,
} from '../enums';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface Station {
  id: string;
  stationId: string;
  name: string;
  version: string | null;
  localIp: string | null;
  lastSeenAt: Date | null;
  status: StationStatus;
  config: StationConfig | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StationConfig {
  acPath?: string;
  cmPath?: string;
  documentsPath?: string;
  launchMode?: LaunchMode;
  screenMode?: ScreenMode;
  assistPreset?: AssistPreset;
  autoMapAcControls?: boolean;
  autoDriveHelper?: boolean;
}

export interface SessionConfig {
  carId: string;
  trackId: string;
  sessionType: string;
  weather?: string;
  serverIp?: string;
  serverHttpPort?: number;
  password?: string;
}

export interface Session {
  id: string;
  stationId: string;
  config: SessionConfig;
  status: SessionStatus;
  startedAt: Date | null;
  endedAt: Date | null;
  result: SessionResult | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionResult {
  players?: RacePlayer[];
  rawJson?: Record<string, unknown>;
}

export interface RacePlayer {
  name: string;
  guid: string;
  carId: string;
  bestLapTimeMs: number | null;
  totalTimeMs: number | null;
  laps: number;
}
