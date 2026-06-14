export type UserRole = 'admin' | 'technician';

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
}

export type StationStatus = 'offline' | 'online' | 'in_use' | 'maintenance' | 'error';

export interface AcServerInfo {
  pid: number;
  name: string;
  track?: string;
  trackLayout?: string;
  cars: string[];
  maxClients?: number;
  playerCount: number;
  hasPassword?: boolean;
  serverDir: string;
  executablePath: string;
}

export interface Station {
  id: string;
  name: string;
  pc_identifier: string;
  status: StationStatus;
  config?: Record<string, any>;
  current_session_id?: string;
  active_servers?: AcServerInfo[];
  last_heartbeat?: Date;
}

export interface Car {
  id: string;
  ac_id: string;
  name: string;
  brand?: string;
  category?: string;
  is_premium: boolean;
  image_url?: string;
}

export interface Track {
  id: string;
  ac_id: string;
  name: string;
  country?: string;
  length_km?: number;
  image_url?: string;
}

export interface TrackLayout {
  id: string;
  track_id: string;
  name: string;
}

export interface SessionConfig {
  id: string;
  name: string;
  car_id: string;
  track_layout_id: string;
  weather_preset?: string;
  session_type: 'practice' | 'race' | 'hotlap';
  is_default: boolean;
  created_at: Date;
}

export type SimSessionStatus = 'starting' | 'running' | 'paused' | 'finished' | 'crashed';

export interface SimSession {
  id: string;
  station_id: string;
  config_id: string;
  launched_by: string;
  started_at: Date;
  ended_at?: Date;
  status: SimSessionStatus;
}

export interface SessionResult {
  id: string;
  session_id: string;
  lap_count?: number;
  best_lap_time_ms?: number;
  total_time_ms?: number;
  position?: number;
  replay_url?: string;
  recorded_at: Date;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}
