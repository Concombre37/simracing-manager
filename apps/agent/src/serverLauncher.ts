import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import net from 'net';
import dgram from 'dgram';
import { Logger } from 'pino';
import { config } from './config';
import { LaunchDedicatedServerPayload } from '@simracing/shared';

export interface LaunchedServerInfo {
  serverDir: string;
  udpPort: number;
  tcpPort: number;
  httpPort: number;
}

interface RunningServer {
  serverId: string;
  process: ChildProcess;
  serverDir: string;
  logPath: string;
}

export class ServerLauncher {
  private servers = new Map<string, RunningServer>();

  constructor(private readonly logger: Logger) {}

  async launch(payload: LaunchDedicatedServerPayload): Promise<LaunchedServerInfo> {
    this.logger.info({ serverId: payload.serverId }, 'Launching dedicated server');

    const acPath = await this.resolveAcPath();
    const serverExe = path.join(acPath, 'server', 'acServer.exe');

    try {
      await fs.access(serverExe);
    } catch {
      throw new Error(`Serveur dédié AC non trouvé: ${serverExe}. Vérifie AC_PATH dans le .env.`);
    }

    // Ports libres pour éviter les conflits avec d'autres serveurs AC/CM
    const mainPort = await this.findAvailablePort(9600, 9700);
    const httpPort = await this.findAvailablePort(8081, 8181);

    const serverDir = path.join(acPath, 'server', `simcenter_${payload.serverId}`);
    await fs.mkdir(serverDir, { recursive: true });

    const cfgPath = path.join(serverDir, 'server_cfg.ini');
    const entryListPath = path.join(serverDir, 'entry_list.ini');
    const logPath = path.join(serverDir, 'server.log');

    await this.writeServerConfig(serverDir, payload, mainPort, httpPort);

    const child = spawn(serverExe, ['-c', cfgPath, '-e', entryListPath], {
      cwd: path.dirname(serverExe),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
    });

    this.pipeToLog(child, logPath);

    const running: RunningServer = {
      serverId: payload.serverId,
      process: child,
      serverDir,
      logPath,
    };
    this.servers.set(payload.serverId, running);

    child.on('error', (err) => {
      this.logger.error({ err, serverId: payload.serverId }, 'Server process error');
    });

    child.on('exit', (code) => {
      this.logger.info({ code, serverId: payload.serverId }, 'Server process exited');
      this.servers.delete(payload.serverId);
    });

    // Vérifier que le processus ne meurt pas immédiatement (erreur de config, port...)
    await this.verifyProcessAlive(child, payload.serverId, logPath);

    this.logger.info(
      { serverId: payload.serverId, serverDir, udpPort: mainPort, tcpPort: mainPort, httpPort },
      'Dedicated server launched',
    );

    return {
      serverDir,
      udpPort: mainPort,
      tcpPort: mainPort,
      httpPort,
    };
  }

  async stop(serverId: string): Promise<void> {
    const running = this.servers.get(serverId);
    if (!running) {
      this.logger.warn({ serverId }, 'No matching server process to stop');
      return;
    }

    this.logger.info({ serverId }, 'Stopping dedicated server');
    if (!running.process.killed) {
      running.process.kill('SIGTERM');
    }
    if (process.platform === 'win32' && running.process.pid) {
      spawn('taskkill', ['/F', '/PID', String(running.process.pid)], { stdio: 'ignore' });
    }
    this.servers.delete(serverId);
  }

  private async resolveAcPath(): Promise<string> {
    if (config.AC_PATH) {
      return config.AC_PATH;
    }

    const candidates: string[] = [];
    if (process.platform === 'win32') {
      const prefixes = [
        process.env.ProgramFiles,
        process.env['ProgramFiles(x86)'],
        'C:\\Program Files',
        'C:\\Program Files (x86)',
        'C:\\Steam',
      ].filter((p): p is string => !!p);
      const seen = new Set<string>();
      for (const prefix of prefixes) {
        const candidate = path.join(prefix, 'Steam', 'steamapps', 'common', 'assettocorsa');
        if (!seen.has(candidate)) {
          seen.add(candidate);
          candidates.push(candidate);
        }
      }
    }

    for (const candidate of candidates) {
      try {
        await fs.access(path.join(candidate, 'server', 'acServer.exe'));
        return candidate;
      } catch {
        // try next
      }
    }

    throw new Error(
      `Assetto Corsa non trouvé. Définis AC_PATH dans le .env à côté de l'exécutable.`,
    );
  }

  private isTcpPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      server.listen(port, '0.0.0.0');
    });
  }

  private isUdpPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = dgram.createSocket('udp4');
      socket.once('error', () => resolve(false));
      socket.once('listening', () => {
        socket.close(() => resolve(true));
      });
      socket.bind(port, '0.0.0.0');
    });
  }

  private async isPortAvailable(port: number): Promise<boolean> {
    const [tcp, udp] = await Promise.all([
      this.isTcpPortAvailable(port),
      this.isUdpPortAvailable(port),
    ]);
    return tcp && udp;
  }

  private async findAvailablePort(start: number, end: number): Promise<number> {
    for (let port = start; port <= end; port++) {
      if (await this.isPortAvailable(port)) return port;
    }
    throw new Error(`Aucun port libre trouvé entre ${start} et ${end}`);
  }

  private async verifyProcessAlive(
    child: ChildProcess,
    serverId: string,
    logPath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        settled = true;
      };

      child.once('error', (err) => {
        if (!settled) {
          settled = true;
          reject(new Error(`Impossible de lancer acServer.exe: ${err.message}`));
        }
      });

      child.once('exit', (code) => {
        if (!settled) {
          settled = true;
          reject(
            new Error(
              `acServer.exe s'est arrêté immédiatement (code ${code}). Consulte ${logPath}.`,
            ),
          );
        }
      });

      setTimeout(() => {
        if (settled) return;
        if (!child.pid) {
          settled = true;
          reject(new Error('acServer.exe a démarré sans PID'));
          return;
        }
        try {
          process.kill(child.pid, 0);
          cleanup();
          resolve();
        } catch {
          settled = true;
          reject(
            new Error(
              `acServer.exe s'est arrêté immédiatement après le lancement. Consulte ${logPath}.`,
            ),
          );
        }
      }, 2500);
    });
  }

  private pipeToLog(child: ChildProcess, logPath: string): void {
    const writeLog = async (data: Buffer) => {
      try {
        await fs.appendFile(logPath, data.toString(), 'utf-8');
      } catch {
        // ignore
      }
    };
    child.stdout?.on('data', writeLog);
    child.stderr?.on('data', writeLog);
    child.on('exit', (code) => {
      void fs.appendFile(logPath, `[serverLauncher] Process exited with code ${code}\n`, 'utf-8');
    });
  }

  private async writeServerConfig(
    serverDir: string,
    payload: LaunchDedicatedServerPayload,
    mainPort: number,
    httpPort: number,
  ): Promise<void> {
    const serverCfgPath = path.join(serverDir, 'server_cfg.ini');
    const entryListPath = path.join(serverDir, 'entry_list.ini');

    const carIds = payload.cars.length > 0 ? payload.cars : ['ks_mazda_mx5_cup'];

    const serverCfg = [
      '[SERVER]',
      `NAME=${payload.name}`,
      `TRACK=${payload.track}`,
      `CONFIG_TRACK=${payload.trackLayout || 'random'}`,
      `CARS=${carIds.join(';')}`,
      `MAX_CLIENTS=${payload.maxClients}`,
      `PASSWORD=${payload.password ?? ''}`,
      `WELCOME_MESSAGE=Bienvenue sur ${payload.name}`,
      `ADMIN_PASSWORD=${payload.rconPassword ?? 'admin'}`,
      `UDP_PORT=${mainPort}`,
      `TCP_PORT=${mainPort}`,
      `HTTP_PORT=${httpPort}`,
      `SERVER_IP=0.0.0.0`,
      'PICKUP_MODE_ENABLED=1',
      'LOOP_MODE=1',
      'SLEEP_TIME=1',
      'ABS_ALLOWED=1',
      'TC_ALLOWED=1',
      'STABILITY_ALLOWED=1',
      'AUTOCLUTCH_ALLOWED=1',
      'DAMAGE_MULTIPLIER=0',
      'FUEL_RATE=1',
      'TYRE_WEAR_RATE=1',
      'ALLOWED_TYRES_OUT=2',
      'MAX_BALLAST_KG=150',
      'RACE_OVER_TIME=60',
      'RESULT_SCREEN_TIME=20',
      'RACE_GAS_PENALTY_DISABLED=1',
      'MAX_CONTACTS_PER_KM=3',
      'MINIMUM_SECURITY_LEVEL=1',
      'REGISTER_TO_LOBBY=1',
      '',
      '[PRACTICE]',
      'NAME=Practice',
      'TIME=30',
      'IS_OPEN=1',
      '',
      '[QUALIFY]',
      'NAME=Qualifying',
      'TIME=15',
      'IS_OPEN=1',
      '',
      '[RACE]',
      'NAME=Race',
      'LAPS=5',
      'WAIT_TIME=60',
      'IS_OPEN=1',
      '',
      '[DYNAMIC_TRACK]',
      'SESSION_START=89',
      'RANDOMNESS=2',
      'LAP_GAIN=22',
      'SESSION_TRANSFER=90',
      '',
      '[WEATHER_0]',
      'GRAPHICS=3_clear',
      'BASE_TEMPERATURE_AMBIENT=26',
      'BASE_TEMPERATURE_TRACK=34',
      'VARIATION_AMBIENT=2',
      'VARIATION_TRACK=2',
      '',
    ].join('\n');

    let entryList = '';
    for (let i = 0; i < payload.maxClients; i++) {
      entryList += `[CAR_${i}]\nMODEL=${carIds[i % carIds.length]}\nSKIN=random\nSPECTATOR_MODE=0\nDRIVERNAME=\nTEAM=\nGUID=\nBALLAST=0\n`;
    }

    await fs.writeFile(serverCfgPath, serverCfg, 'utf-8');
    await fs.writeFile(entryListPath, entryList, 'utf-8');

    this.logger.info({ serverDir, mainPort, httpPort }, 'Server config written');
  }
}
