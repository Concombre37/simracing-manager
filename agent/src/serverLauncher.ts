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

export function getLaunchedServer(): LaunchedServer | null {
  return launchedServer;
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
LOOP_MODE=0
SLEEP_TIME=1
ABS_ALLOWED=1
TC_ALLOWED=1
STABILITY_ALLOWED=0
AUTOCLUTCH_ALLOWED=0
DAMAGE_MULTIPLIER=0
FUEL_RATE=1
TYRE_WEAR_RATE=1
ALLOWED_TYRES_OUT=2
MAX_BALLAST_KG=150

[PRACTICE]
NAME=Practice
TIME=30
IS_OPEN=1

[DYNAMIC_TRACK]
SESSION_START=89
RANDOMNESS=2
LAP_GAIN=22
SESSION_TRANSFER=90
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
