CREATE DATABASE IF NOT EXISTS sim_center CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sim_center;

DROP TABLE IF EXISTS session_results;
DROP TABLE IF EXISTS sim_sessions;
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS track_layouts;
DROP TABLE IF EXISTS tracks;
DROP TABLE IF EXISTS cars;
DROP TABLE IF EXISTS stations;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  role ENUM('admin', 'employee', 'customer') DEFAULT 'customer',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE stations (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  pc_identifier VARCHAR(100) UNIQUE NOT NULL,
  status ENUM('offline', 'online', 'in_use', 'maintenance', 'error') DEFAULT 'offline',
  config JSON,
  current_user_id CHAR(36),
  last_heartbeat DATETIME,
  FOREIGN KEY (current_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE cars (
  id CHAR(36) PRIMARY KEY,
  ac_id VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  brand VARCHAR(100),
  category VARCHAR(100),
  is_premium BOOLEAN DEFAULT FALSE,
  image_url VARCHAR(500)
);

CREATE TABLE tracks (
  id CHAR(36) PRIMARY KEY,
  ac_id VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  country VARCHAR(100),
  length_km DECIMAL(6,2),
  image_url VARCHAR(500)
);

CREATE TABLE track_layouts (
  id CHAR(36) PRIMARY KEY,
  track_id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

CREATE TABLE reservations (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  station_id CHAR(36) NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  status ENUM('pending', 'confirmed', 'cancelled', 'no_show', 'completed') DEFAULT 'pending',
  price DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE
);

CREATE TABLE sim_sessions (
  id CHAR(36) PRIMARY KEY,
  reservation_id CHAR(36) UNIQUE NOT NULL,
  station_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  car_id CHAR(36),
  track_layout_id CHAR(36),
  weather_preset VARCHAR(100),
  session_type ENUM('practice', 'race', 'hotlap') DEFAULT 'practice',
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  status ENUM('starting', 'running', 'paused', 'finished', 'crashed') DEFAULT 'starting',
  FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
  FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE SET NULL,
  FOREIGN KEY (track_layout_id) REFERENCES track_layouts(id) ON DELETE SET NULL
);

CREATE TABLE session_results (
  id CHAR(36) PRIMARY KEY,
  session_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  lap_count INT,
  best_lap_time_ms INT,
  total_time_ms INT,
  position INT,
  replay_url VARCHAR(500),
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sim_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE events (
  id CHAR(36) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  event_type ENUM('competition', 'league', 'private_event') DEFAULT 'competition',
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  max_entries INT,
  price DECIMAL(10,2) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
