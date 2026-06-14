import dotenv from 'dotenv';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const envPath = path.resolve(process.cwd(), '.env');

const defaultEnvContent = `# Configuration SimRacing Manager Agent
# Généré automatiquement - modifiez selon votre installation

SERVER_URL=https://simracing.hytlabs.com
STATION_ID=poste-1
STATION_NAME=Poste 1

# Chemins Windows (à adapter)
AC_PATH=C:\\Program Files (x86)\\Steam\\steamapps\\common\\assettocorsa
CM_PATH=C:\\Program Files\\Content Manager
DOCUMENTS_PATH=${path.join(os.homedir(), 'Documents').replace(/\\/g, '\\\\')}

# Mode de lancement : 'cm' (Content Manager) ou 'ac' (Assetto Corsa direct)
LAUNCH_MODE=cm
CM_EXECUTABLE=Content Manager.exe
AC_EXECUTABLE=acs.exe

HEARTBEAT_INTERVAL_MS=5000
RESULT_CHECK_INTERVAL_MS=10000
`;

async function ensureEnvFile() {
  if (!(await fs.pathExists(envPath))) {
    await fs.writeFile(envPath, defaultEnvContent, 'utf-8');
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
  serverUrl: getEnv('SERVER_URL', 'https://simracing.hytlabs.com'),
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
