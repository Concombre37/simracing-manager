import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';
import { config } from './config';

export interface ServerLaunchConfig {
  serverId: string;
  name: string;
  track: string;
  trackLayout?: string;
  cars: string[];
  maxClients?: number;
  password?: string;
}

export interface LaunchedServer {
  pid: number;
  serverDir: string;
}

let launchedServer: LaunchedServer | null = null;
const knownServers = new Map<number, string>();

export function getLaunchedServer(): LaunchedServer | null {
  return launchedServer;
}

export function getKnownServerDir(pid: number): string | undefined {
  return knownServers.get(pid);
}

export function registerKnownServer(pid: number, serverDir: string) {
  knownServers.set(pid, serverDir);
}

export async function launchDedicatedServer(cfg: ServerLaunchConfig): Promise<LaunchedServer> {
  const acServerExe = path.join(config.acServerPath, 'acServer.exe');
  if (!(await fs.pathExists(acServerExe))) {
    throw new Error(`Serveur dédié AC non trouvé: ${acServerExe}`);
  }

  // Dossier de travail du serveur : sous-dossier simcenter dans le dossier serveur AC
  const serverDir = path.join(config.acServerPath, `simcenter_${cfg.serverId}`);
  await fs.ensureDir(serverDir);

  const carIds = cfg.cars.length > 0 ? cfg.cars : ['ks_mazda_mx5_cup'];

  // server_cfg.ini
  const serverCfg = `[SERVER]
NAME=${cfg.name}
TRACK=${cfg.track}
CONFIG_TRACK=${cfg.trackLayout || ''}
CARS=${carIds.join(';')}
MAX_CLIENTS=${cfg.maxClients || 10}
PASSWORD=${cfg.password || ''}
WELCOME_MESSAGE=Bienvenue sur ${cfg.name}
ADMIN_PASSWORD=${cfg.password || 'admin'}
UDP_PORT=9600
TCP_PORT=9600
HTTP_PORT=8081
PICKUP_MODE_ENABLED=1
LOOP_MODE=1
SLEEP_TIME=1
ABS_ALLOWED=1
TC_ALLOWED=1
STABILITY_ALLOWED=1
AUTOCLUTCH_ALLOWED=1
DAMAGE_MULTIPLIER=0
FUEL_RATE=1
TYRE_WEAR_RATE=1
ALLOWED_TYRES_OUT=2
MAX_BALLAST_KG=150
RACE_OVER_TIME=60
RESULT_SCREEN_TIME=20
RACE_GAS_PENALTY_DISABLED=1
MAX_CONTACTS_PER_KM=3
SERVER_IP=0.0.0.0
REGISTER_TO_LOBBY=1
MINIMUM_SECURITY_LEVEL=1

[PRACTICE]
NAME=Practice
TIME=30
IS_OPEN=1

[QUALIFY]
NAME=Qualifying
TIME=15
IS_OPEN=1

[RACE]
NAME=Race
LAPS=5
WAIT_TIME=60
IS_OPEN=1

[DYNAMIC_TRACK]
SESSION_START=89
RANDOMNESS=2
LAP_GAIN=22
SESSION_TRANSFER=90

[WEATHER_0]
GRAPHICS=3_clear
BASE_TEMPERATURE_AMBIENT=26
BASE_TEMPERATURE_TRACK=34
VARIATION_AMBIENT=2
VARIATION_TRACK=2
`;

  await fs.writeFile(path.join(serverDir, 'server_cfg.ini'), serverCfg, 'utf-8');

  // entry_list.ini
  let entryList = '[CAR_0]\nMODEL=' + carIds[0] + '\nSKIN=random\nSPECTATOR_MODE=0\nDRIVERNAME=\nTEAM=\nGUID=\nBALLAST=0\n';
  for (let i = 1; i < (cfg.maxClients || 10); i++) {
    entryList += `[CAR_${i}]\nMODEL=${carIds[i % carIds.length]}\nSKIN=random\nSPECTATOR_MODE=0\nDRIVERNAME=\nTEAM=\nGUID=\nBALLAST=0\n`;
  }
  await fs.writeFile(path.join(serverDir, 'entry_list.ini'), entryList, 'utf-8');

  console.log(`[serverLauncher] Lancement serveur dédié: ${acServerExe}`);
  console.log(`[serverLauncher] Dossier serveur: ${serverDir}`);

  const child = spawn(acServerExe, ['-c', 'server_cfg.ini', '-e', 'entry_list.ini'], {
    cwd: serverDir,
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });

  child.unref();
  launchedServer = { pid: child.pid || 0, serverDir };
  if (child.pid) {
    registerKnownServer(child.pid, serverDir);
  }
  return launchedServer;
}

export async function stopDedicatedServer(): Promise<void> {
  try {
    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);
    await execAsync('taskkill /F /IM acServer.exe');
    console.log('[serverLauncher] Serveur dédié arrêté');
  } catch (err) {
    console.log('[serverLauncher] Aucun serveur dédié à arrêter');
  }
  launchedServer = null;
}
