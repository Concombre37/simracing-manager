import {
  UserRole,
  StationStatus,
  LaunchMode,
  ScreenMode,
  AssistPreset,
  SessionStatus,
  RaceMode,
  GridType,
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
  macAddress: string | null;
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

/** Resolved Practice/Qualifying/Race format for a dedicated server, sent to
 * the agent as-is inside `LaunchDedicatedServerPayload` (the agent never
 * fetches `RaceFormat` itself — the backend resolves the preset once and
 * hands over plain values, same pattern as `carName`/`trackName`). At least
 * one of `practiceEnabled`/`qualifyingEnabled`/`raceEnabled` must be true —
 * `acServer.exe` needs at least one session configured to start at all. */
export interface RaceFormatConfig {
  practiceEnabled: boolean;
  practiceMinutes: number;
  qualifyingEnabled: boolean;
  qualifyingMinutes: number;
  raceEnabled: boolean;
  raceMode: RaceMode;
  raceLaps: number;
  raceMinutes: number;
  gridType: GridType;
  /** One or more AC weather graphics ids (e.g. `3_clear`, `rain`) —
   * `acServer.exe` writes one `[WEATHER_N]` section per entry and rotates
   * between them across session/server restarts when more than one is
   * given. Always at least one entry. */
  weatherGraphics: string[];
}

export type BlankingMediaCategory = 'idle' | 'launching' | 'results';

export interface BlankingMediaFile {
  id: string;
  /** Null for global media (launching/results — shared by every pod). */
  stationId: string | null;
  category: BlankingMediaCategory;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  order: number;
  downloadUrl: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}
