import dotenv from 'dotenv';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

// Le .env est toujours créé/lect dans le dossier de l'exécutable, pas du shell courant.
const baseDir = path.dirname(process.execPath);
const envPath = path.join(baseDir, '.env');

const defaultEnvContent = `# Configuration SimRacing Manager Agent
# Généré automatiquement - modifiez selon votre installation

SERVER_URL=https://simracing.hytlabs.com
STATION_ID=poste-1
STATION_NAME=Poste 1

# Chemins Windows (à adapter)
AC_PATH=C:\\Program Files (x86)\\Steam\\steamapps\\common\\assettocorsa
AC_SERVER_PATH=C:\\Program Files (x86)\\Steam\\steamapps\\common\\assettocorsa\\server
CM_PATH=C:\\Program Files\\Content Manager
DOCUMENTS_PATH=${path.join(os.homedir(), 'Documents').replace(/\\/g, '\\\\')}

# Mode de lancement : 'cm' (Content Manager) ou 'ac' (Assetto Corsa direct)
LAUNCH_MODE=cm
CM_EXECUTABLE=Content Manager.exe
CM_ALLOW_WITHOUT_STEAM_ID=0
AC_EXECUTABLE=acs.exe

HEARTBEAT_INTERVAL_MS=5000
RESULT_CHECK_INTERVAL_MS=10000
SERVER_SCAN_INTERVAL_MS=15000

# Token GitHub (optionnel, requis si le repo de releases est privé)
# GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
`;

function ensureEnvFile() {
  if (!fs.pathExistsSync(envPath)) {
    fs.writeFileSync(envPath, defaultEnvContent, 'utf-8');
    console.log(`Fichier .env créé: ${envPath}`);
    console.log('Vérifiez et adaptez les chemins avant de relancer.');
  }
}

ensureEnvFile();
dotenv.config({ path: envPath });

function getEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export const config = {
  baseDir,
  serverUrl: getEnv('SERVER_URL', 'https://simracing.hytlabs.com'),
  stationId: getEnv('STATION_ID', 'poste-1'),
  stationName: getEnv('STATION_NAME', 'Poste 1'),

  // Chemins Windows par défaut (à adapter selon l'installation)
  acPath: getEnv('AC_PATH', 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\assettocorsa'),
  acServerPath: getEnv('AC_SERVER_PATH', 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\assettocorsa\\server'),
  cmPath: getEnv('CM_PATH', 'C:\\Program Files\\Content Manager'),
  documentsPath: getEnv('DOCUMENTS_PATH', path.join(os.homedir(), 'Documents')),

  // Options de lancement
  launchMode: getEnv('LAUNCH_MODE', 'cm') as 'cm' | 'ac',
  cmExecutable: getEnv('CM_EXECUTABLE', 'Content Manager.exe'),
  cmAllowWithoutSteamId: getEnv('CM_ALLOW_WITHOUT_STEAM_ID', '0') === '1',
  acExecutable: getEnv('AC_EXECUTABLE', 'acs.exe'),

  // Intervalles
  heartbeatIntervalMs: parseInt(getEnv('HEARTBEAT_INTERVAL_MS', '5000')),
  resultCheckIntervalMs: parseInt(getEnv('RESULT_CHECK_INTERVAL_MS', '10000')),
  serverScanIntervalMs: parseInt(getEnv('SERVER_SCAN_INTERVAL_MS', '15000')),

  // Token GitHub pour les mises à jour automatiques (repo privé)
  githubToken: getEnv('GITHUB_TOKEN', ''),
};

export function getCmPresetsPath(): string {
  return path.join(os.homedir(), 'AppData', 'Local', 'AcTools Content Manager Ltd', 'Cyberpak Content Manager', 'Presets');
}

export function getAcOutPath(): string {
  return path.join(config.documentsPath, 'Assetto Corsa', 'out');
}
