import dotenv from 'dotenv';
import path from 'path';
import os from 'os';

dotenv.config();

function getEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export const config = {
  serverUrl: getEnv('SERVER_URL', 'http://localhost:3001'),
  stationId: getEnv('STATION_ID', 'poste-1'),
  stationName: getEnv('STATION_NAME', 'Poste 1'),

  // Chemins Windows par défaut (à adapter selon l'installation)
  acPath: getEnv('AC_PATH', 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\assettocorsa'),
  cmPath: getEnv('CM_PATH', 'C:\\Program Files\\Content Manager'),
  documentsPath: getEnv('DOCUMENTS_PATH', path.join(os.homedir(), 'Documents')),

  // Options de lancement
  launchMode: getEnv('LAUNCH_MODE', 'cm') as 'cm' | 'ac',
  cmExecutable: getEnv('CM_EXECUTABLE', 'Content Manager.exe'),
  acExecutable: getEnv('AC_EXECUTABLE', 'acs.exe'),

  // Intervalles
  heartbeatIntervalMs: parseInt(getEnv('HEARTBEAT_INTERVAL_MS', '5000')),
  resultCheckIntervalMs: parseInt(getEnv('RESULT_CHECK_INTERVAL_MS', '10000')),
};

export function getCmPresetsPath(): string {
  return path.join(os.homedir(), 'AppData', 'Local', 'AcTools Content Manager Ltd', 'Cyberpak Content Manager', 'Presets');
}

export function getAcOutPath(): string {
  return path.join(config.documentsPath, 'Assetto Corsa', 'out');
}
