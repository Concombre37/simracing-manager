PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS session_results;
DROP TABLE IF EXISTS sim_sessions;
DROP TABLE IF EXISTS session_configs;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS track_layouts;
DROP TABLE IF EXISTS tracks;
DROP TABLE IF EXISTS cars;
DROP TABLE IF EXISTS stations;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT DEFAULT 'technician' CHECK(role IN ('admin', 'technician')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE stations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pc_identifier TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'offline' CHECK(status IN ('offline', 'online', 'in_use', 'maintenance', 'error')),
  config TEXT,
  current_session_id TEXT,
  active_servers TEXT,
  content_data TEXT,
  last_heartbeat DATETIME
);

CREATE TABLE cars (
  id TEXT PRIMARY KEY,
  ac_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  is_premium INTEGER DEFAULT 0,
  image_url TEXT
);

CREATE TABLE tracks (
  id TEXT PRIMARY KEY,
  ac_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  country TEXT,
  length_km REAL,
  image_url TEXT
);

CREATE TABLE track_layouts (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL,
  name TEXT NOT NULL,
  FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

CREATE TABLE session_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  car_id TEXT NOT NULL,
  track_layout_id TEXT NOT NULL,
  weather_preset TEXT,
  session_type TEXT DEFAULT 'practice' CHECK(session_type IN ('practice', 'race', 'hotlap')),
  is_default INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE CASCADE,
  FOREIGN KEY (track_layout_id) REFERENCES track_layouts(id) ON DELETE CASCADE
);

CREATE TABLE sim_sessions (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL,
  config_id TEXT NOT NULL,
  launched_by TEXT NOT NULL,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  status TEXT DEFAULT 'starting' CHECK(status IN ('starting', 'running', 'paused', 'finished', 'crashed')),
  FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE,
  FOREIGN KEY (config_id) REFERENCES session_configs(id) ON DELETE CASCADE,
  FOREIGN KEY (launched_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE dedicated_servers (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL,
  name TEXT NOT NULL,
  track TEXT,
  track_layout TEXT,
  cars TEXT,
  max_clients INTEGER DEFAULT 10,
  password TEXT,
  status TEXT DEFAULT 'creating' CHECK(status IN ('creating', 'running', 'stopped', 'error')),
  server_dir TEXT,
  config_json TEXT,
  started_at DATETIME,
  ended_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE
);

CREATE TABLE session_results (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  lap_count INTEGER,
  best_lap_time_ms INTEGER,
  total_time_ms INTEGER,
  position INTEGER,
  replay_url TEXT,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sim_sessions(id) ON DELETE CASCADE
);
