import fs from 'fs-extra';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import net from 'net';
import dgram from 'dgram';
import { config } from './config';

export interface ServerLaunchConfig {
  serverId: string;
  name: string;
  track: string;
  trackLayout?: string;
  cars: string[];
  maxClients?: number;
  password?: string;
  registerToLobby?: boolean;
}

export interface LaunchedServer {
  pid: number;
  serverDir: string;
  process: ChildProcess;
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

function isTcpPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '0.0.0.0');
  });
}

function isUdpPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    socket.once('error', () => resolve(false));
    socket.once('listening', () => {
      socket.close(() => resolve(true));
    });
    socket.bind(port, '0.0.0.0');
  });
}

async function isPortAvailable(port: number): Promise<boolean> {
  const [tcp, udp] = await Promise.all([isTcpPortAvailable(port), isUdpPortAvailable(port)]);
  return tcp && udp;
}

async function findAvailablePort(start: number, end: number): Promise<number> {
  for (let port = start; port <= end; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`Aucun port libre trouvé entre ${start} et ${end}`);
}

function pipeToLog(child: ChildProcess, logPath: string) {
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  const write = (data: Buffer) => logStream.write(data.toString());
  if (child.stdout) child.stdout.on('data', write);
  if (child.stderr) child.stderr.on('data', write);
  child.on('exit', (code, signal) => {
    logStream.write(`[serverLauncher] Processus acServer.exe termine avec code ${code}, signal ${signal}\n`);
    logStream.end();
  });
}

export async function launchDedicatedServer(
  cfg: ServerLaunchConfig,
  onExit?: (code: number | null, signal: string | null) => void
): Promise<LaunchedServer> {
  const acServerExe = path.join(config.acServerPath, 'acServer.exe');
  if (!(await fs.pathExists(acServerExe))) {
    throw new Error(`Serveur dédié AC non trouvé: ${acServerExe}`);
  }

  const serverDir = path.join(config.acServerPath, `simcenter_${cfg.serverId}`);
  await fs.ensureDir(serverDir);

  // Ports libres pour éviter les conflits avec d'autres serveurs AC/CM
  const mainPort = await findAvailablePort(9600, 9700);
  const httpPort = await findAvailablePort(8081, 8181);

  const carIds = cfg.cars.length > 0 ? cfg.cars : ['ks_mazda_mx5_cup'];

  const serverCfg = `[SERVER]
NAME=${cfg.name}
TRACK=${cfg.track}
CONFIG_TRACK=${cfg.trackLayout || ''}
CARS=${carIds.join(';')}
MAX_CLIENTS=${cfg.maxClients || 10}
PASSWORD=${cfg.password || ''}
WELCOME_MESSAGE=Bienvenue sur ${cfg.name}
ADMIN_PASSWORD=${cfg.password || 'admin'}
UDP_PORT=${mainPort}
TCP_PORT=${mainPort}
HTTP_PORT=${httpPort}
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
REGISTER_TO_LOBBY=${cfg.registerToLobby ? 1 : 0}
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

  const cfgPath = path.join(serverDir, 'server_cfg.ini');
  const entryPath = path.join(serverDir, 'entry_list.ini');
  const logPath = path.join(serverDir, 'server.log');

  await fs.writeFile(cfgPath, serverCfg, 'utf-8');

  let entryList = '[CAR_0]\nMODEL=' + carIds[0] + '\nSKIN=random\nSPECTATOR_MODE=0\nDRIVERNAME=\nTEAM=\nGUID=\nBALLAST=0\n';
  for (let i = 1; i < (cfg.maxClients || 10); i++) {
    entryList += `[CAR_${i}]\nMODEL=${carIds[i % carIds.length]}\nSKIN=random\nSPECTATOR_MODE=0\nDRIVERNAME=\nTEAM=\nGUID=\nBALLAST=0\n`;
  }
  await fs.writeFile(entryPath, entryList, 'utf-8');

  console.log(`[serverLauncher] Lancement serveur dédié: ${acServerExe}`);
  console.log(`[serverLauncher] Dossier serveur: ${serverDir}`);
  console.log(`[serverLauncher] Ports: UDP/TCP=${mainPort}, HTTP=${httpPort}`);

  return new Promise((resolve, reject) => {
    const child = spawn(acServerExe, ['-c', cfgPath, '-e', entryPath], {
      cwd: config.acServerPath,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
    });

    pipeToLog(child, logPath);

    let settled = false;
    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Impossible de lancer acServer.exe: ${err.message}`));
      }
    });

    child.on('exit', (code, signal) => {
      console.log(`[serverLauncher] acServer.exe termine (code ${code}, signal ${signal})`);
      if (launchedServer?.pid === child.pid) {
        launchedServer = null;
      }
      if (onExit) onExit(code ?? null, signal ?? null);
    });

    // Vérifier que le processus ne meurt pas immédiatement (erreur de config, port...)
    setTimeout(() => {
      if (settled) return;
      if (!child.pid) {
        settled = true;
        reject(new Error('acServer.exe a démarré sans PID'));
        return;
      }
      try {
        process.kill(child.pid, 0);
        settled = true;
        launchedServer = { pid: child.pid, serverDir, process: child };
        if (child.pid) registerKnownServer(child.pid, serverDir);
        child.unref();
        resolve(launchedServer);
      } catch (err) {
        settled = true;
        reject(new Error('acServer.exe s\'est arrêté immédiatement après le lancement. Consultez server.log.'));
      }
    }, 2500);
  });
}

export async function stopDedicatedServer(): Promise<void> {
  try {
    if (launchedServer?.pid) {
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);
      await execAsync(`taskkill /F /PID ${launchedServer.pid}`);
      console.log(`[serverLauncher] Serveur dédié PID ${launchedServer.pid} arrêté`);
    } else {
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);
      await execAsync('taskkill /F /IM acServer.exe');
      console.log('[serverLauncher] Tous les acServer.exe arrêtés');
    }
  } catch (err: any) {
    console.log('[serverLauncher] Aucun serveur dédié à arrêter');
  }
  launchedServer = null;
}
