import { spawn, ChildProcess, execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import net from 'net';
import dgram from 'dgram';
import { promisify } from 'util';
import { Logger } from 'pino';
import { LaunchDedicatedServerPayload } from '@simracing/shared';
import { resolveAcInstallPath } from './acPathResolver';

const execFileAsync = promisify(execFile);

/** Windows Firewall rule name for acServer.exe — a single program-wide rule
 * covers every dynamic port a server ever binds, so it only needs to exist
 * once rather than being recreated per launch/per port. */
const FIREWALL_RULE_NAME = 'SimCenterManager-acServer';

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
  private intentionalStops = new Set<string>();

  constructor(
    private readonly logger: Logger,
    private readonly onUnexpectedExit?: (serverId: string, code: number | null) => void,
  ) {}

  /**
   * `servers` is purely in-memory — any dedicated server started by a
   * *previous* agent process (before an update, a crash, or a manual
   * restart) has no entry here anymore, so stop() can never find it again
   * ("No matching server process to stop"). The real acServer.exe keeps
   * running regardless, permanently squatting its port — every later launch
   * that happens to land on that same port then fails: acServer.exe doesn't
   * exit cleanly on a bind failure, it limps on with a null UDP socket and
   * panics (nil pointer dereference) the moment it tries to use it, which
   * is what actually produces the instant "exited with code 2" symptom.
   *
   * A single cleanup at agent startup (the original fix) turned out not to
   * be enough: confirmed live, the same squatted-port crash kept recurring
   * *hours* into an agent's uptime, with no restart in between — some
   * acServer.exe processes end up orphaned without an agent restart ever
   * happening (a launch attempt that appeared to fail can still leave the
   * process alive, for instance). So this now also runs right before every
   * launch, not just once — and only kills processes this instance isn't
   * currently tracking in `servers`, leaving a legitimately-running,
   * already-tracked server alone (the data model supports more than one
   * concurrent dedicated server per station). Mirrors the same orphan-kill
   * precedent already used for the blanking window
   * (BlankingManager.killOrphanedProcess) and the AC client itself
   * (AcLauncher.launchAcs() taskkill's acs.exe before every launch).
   */
  async killOrphanedProcesses(): Promise<void> {
    if (process.platform !== 'win32') return;
    const trackedPids = new Set(
      Array.from(this.servers.values())
        .map((s) => s.process.pid)
        .filter((pid): pid is number => typeof pid === 'number'),
    );
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync('tasklist', [
        '/FI',
        'IMAGENAME eq acServer.exe',
        '/FO',
        'CSV',
        '/NH',
      ]));
    } catch {
      return; // Nothing running at all — tasklist exits non-zero in that case.
    }
    const lines = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.toLowerCase().includes('acserver.exe'));
    for (const line of lines) {
      const fields = parseCsvLine(line);
      const pid = parseInt(fields[1] ?? '', 10);
      if (!Number.isFinite(pid) || trackedPids.has(pid)) continue;
      try {
        await execFileAsync('taskkill', ['/F', '/PID', String(pid)]);
        this.logger.info({ pid }, 'Killed untracked orphaned acServer.exe process');
      } catch (err) {
        this.logger.debug(
          { pid, err },
          'Failed to kill orphaned acServer.exe (likely already gone)',
        );
      }
    }
  }

  async launch(payload: LaunchDedicatedServerPayload): Promise<LaunchedServerInfo> {
    this.logger.info({ serverId: payload.serverId }, 'Launching dedicated server');
    await this.killOrphanedProcesses();

    const acPath = await this.resolveAcPath();
    const serverExe = path.join(acPath, 'server', 'acServer.exe');

    try {
      await fs.access(serverExe);
    } catch {
      throw new Error(`Serveur dédié AC non trouvé: ${serverExe}. Vérifie AC_PATH dans le .env.`);
    }

    await this.ensureFirewallRule(serverExe);

    // Ports libres pour éviter les conflits avec d'autres serveurs AC/CM
    const requestedMainPort = payload.udpPort ?? payload.tcpPort;
    const requestedHttpPort = payload.httpPort;

    const mainPort =
      requestedMainPort && (await this.isPortAvailable(requestedMainPort))
        ? requestedMainPort
        : await this.findAvailablePort(9600, 9700);
    const httpPort =
      requestedHttpPort && (await this.isPortAvailable(requestedHttpPort))
        ? requestedHttpPort
        : await this.findAvailablePort(8081, 8181);

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
      if (this.intentionalStops.delete(payload.serverId)) return;
      this.onUnexpectedExit?.(payload.serverId, code);
    });

    // Vérifier que le processus ne meurt pas immédiatement (erreur de config, port...)
    await this.verifyProcessAlive(child, payload.serverId, logPath);

    // Le processus vivant ne prouve pas que le port UDP est réellement ouvert
    // (pare-feu, port déjà pris par un autre processus au niveau OS malgré la
    // vérif préalable...) — c'est exactement ce qui produit un "Failed to
    // handshake" côté client sans que rien ne le signale ici. On vérifie donc
    // explicitement avant de considérer le lancement comme réussi.
    if (!child.pid) {
      throw new Error('acServer.exe a démarré sans PID');
    }
    try {
      await this.waitForPortBound(child.pid, mainPort);
    } catch (err) {
      await this.stop(payload.serverId);
      throw err;
    }

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
    this.intentionalStops.add(serverId);
    if (!running.process.killed) {
      running.process.kill('SIGTERM');
    }
    if (process.platform === 'win32' && running.process.pid) {
      spawn('taskkill', ['/F', '/PID', String(running.process.pid)], { stdio: 'ignore' });
    }
    this.servers.delete(serverId);
  }

  private async resolveAcPath(): Promise<string> {
    const acPath = await resolveAcInstallPath(this.logger, path.join('server', 'acServer.exe'));
    if (!acPath) {
      throw new Error(
        `Assetto Corsa non trouvé. Définis AC_PATH dans le .env à côté de l'exécutable.`,
      );
    }
    return acPath;
  }

  /**
   * Adds a Windows Firewall inbound rule for acServer.exe, scoped to the
   * program rather than a specific port — servers use a different dynamic
   * port per launch (9600-9700), so a per-port rule would need to be
   * recreated every time. Best-effort: a failure here (e.g. non-admin
   * process) only logs a warning, it never blocks the launch — this is a
   * preventive measure, not a hard requirement to reach acServer.exe.
   */
  private async ensureFirewallRule(serverExe: string): Promise<void> {
    if (process.platform !== 'win32') return;

    try {
      const { stdout } = await execFileAsync('netsh', [
        'advfirewall',
        'firewall',
        'show',
        'rule',
        `name=${FIREWALL_RULE_NAME}`,
      ]).catch(() => ({ stdout: '' }));
      if (stdout.includes(FIREWALL_RULE_NAME)) return;

      await execFileAsync('netsh', [
        'advfirewall',
        'firewall',
        'add',
        'rule',
        `name=${FIREWALL_RULE_NAME}`,
        'dir=in',
        'action=allow',
        `program=${serverExe}`,
        'enable=yes',
        'protocol=any',
      ]);
      this.logger.info(
        { rule: FIREWALL_RULE_NAME, program: serverExe },
        'Windows Firewall rule created for acServer.exe',
      );
    } catch (err) {
      this.logger.warn(
        { err },
        'Could not create/verify the Windows Firewall rule for acServer.exe — clients may fail to handshake if the firewall blocks it',
      );
    }
  }

  /**
   * A process that hasn't exited isn't proof its UDP socket is actually
   * bound — a port already held by something else at the OS level (despite
   * the pre-launch availability check) or a firewall silently dropping
   * inbound packets both leave acServer.exe running while every client gets
   * "Failed to handshake". Polls netstat for the PID actually owning the
   * port before the launch is considered successful.
   */
  private async waitForPortBound(pid: number, port: number, timeoutMs = 5000): Promise<void> {
    if (process.platform !== 'win32') return; // no netstat-based check outside Windows (dev/CI)

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await this.isPortBoundByPid(pid, port)) return;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    throw new Error(
      `acServer.exe (PID ${pid}) n'a pas ouvert le port UDP ${port} après ${timeoutMs / 1000}s. ` +
        `Vérifie le pare-feu Windows ou qu'aucun autre processus n'utilise déjà ce port.`,
    );
  }

  private async isPortBoundByPid(pid: number, port: number): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('netstat', ['-ano', '-p', 'UDP']);
      const needle = `:${port}`;
      return stdout
        .split('\n')
        .some((line) => line.includes(needle) && line.trim().endsWith(String(pid)));
    } catch {
      return false;
    }
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
    // CARS= lists the *distinct* models allowed on the server, not one entry
    // per grid slot — entry_list.ini below is what assigns a specific model
    // to each slot (including repeats). Since the car-mixing picker started
    // allowing several slots to share the same model, payload.cars can
    // contain duplicates (e.g. a car picked 3 times); feeding that straight
    // into CARS= produced "CARS=bmw_m3_e30;bmw_m3_e30;bmw_m3_e30;..." on a
    // real launch, which acServer.exe rejected outright (exits within ~1s,
    // code 2, before even attempting to bind its port).
    const uniqueCarIds = [...new Set(carIds)];

    const serverCfg = [
      '[SERVER]',
      `NAME=${payload.name}`,
      `TRACK=${payload.track}`,
      `CONFIG_TRACK=${payload.trackLayout ?? ''}`,
      `CARS=${uniqueCarIds.join(';')}`,
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
      // Never register with Kunos' public lobby — this is a private venue,
      // players only ever join via the dashboard's direct join, never by
      // browsing a public server list. Strongly suspected cause of the
      // repeated "server dies ~29-30s after launch" crashes (v2.2.68):
      // acServer.exe appears to self-terminate after a lobby-registration
      // timeout when that registration can't complete, and the timing
      // matched exactly across every crash observed. Also removes any
      // dependency on Kunos' master server being reachable at all.
      'REGISTER_TO_LOBBY=0',
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

/** Parses one `tasklist /FO CSV` line (comma-separated, double-quoted
 * fields, no escaping of embedded quotes in practice for this output). */
function parseCsvLine(line: string): string[] {
  const matches = line.match(/"([^"]*)"/g) ?? [];
  return matches.map((field) => field.slice(1, -1));
}
