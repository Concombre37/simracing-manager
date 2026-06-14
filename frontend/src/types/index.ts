export type UserRole = 'admin' | 'technician';

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
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
  last_heartbeat?: string;
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
  layouts?: TrackLayout[];
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
  created_at: string;
  car_name?: string;
  car_ac_id?: string;
  track_name?: string;
  track_ac_id?: string;
  layout_name?: string;
}

export type SimSessionStatus = 'starting' | 'running' | 'paused' | 'finished' | 'crashed';

export interface SimSession {
  id: string;
  station_id: string;
  config_id: string;
  launched_by: string;
  started_at: string;
  ended_at?: string;
  status: SimSessionStatus;
  station_name?: string;
  config_name?: string;
  first_name?: string;
  last_name?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}
