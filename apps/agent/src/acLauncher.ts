import { spawn, ChildProcess, execFile } from 'child_process';
import { promises as fs, readFileSync } from 'fs';
import path from 'path';
import { Logger } from 'pino';
import { config } from './config';
import { LaunchSessionPayload } from '@simracing/shared';
import { LuaBridge } from './luaBridge';

export interface JoinServerConfig {
  host: string;
  port: number;
  httpPort: number;
  password?: string;
  carAcId: string;
  track: string;
  trackLayout?: string;
  serverName?: string;
}

export class AcLauncher {
  private currentProcess: ChildProcess | null = null;
  private readonly luaBridge: LuaBridge;

  constructor(private readonly logger: Logger) {
    this.luaBridge = new LuaBridge(logger);
  }

  async launch(payload: LaunchSessionPayload): Promise<void> {
    this.logger.info({ sessionId: payload.sessionId }, 'Launching Assetto Corsa');

    const documentsPath = this.getDocumentsPath();
    const cfgDir = path.join(documentsPath, 'cfg');
    await fs.mkdir(cfgDir, { recursive: true });

    const cfg = (payload.config ?? {}) as Record<string, unknown>;
    await this.writeRaceIni(cfgDir, {
      track: String(cfg.trackId ?? 'ks_nordschleife'),
      trackLayout: cfg.trackConfig ? String(cfg.trackConfig) : undefined,
      car: String(cfg.carId ?? 'ks_porsche_911_gt3_rs'),
      serverIp: cfg.serverIp ? String(cfg.serverIp) : undefined,
      serverPort: cfg.serverPort ? Number(cfg.serverPort) : undefined,
      serverHttpPort: cfg.serverHttpPort ? Number(cfg.serverHttpPort) : undefined,
      password: cfg.password ? String(cfg.password) : undefined,
      serverName: cfg.serverName ? String(cfg.serverName) : undefined,
    });

    if (config.LAUNCH_MODE === 'cm') {
      await this.ensureLuaAppInstalled();
      await this.launchViaContentManager({
        host: String(cfg.serverIp ?? ''),
        port: Number(cfg.serverPort ?? 0),
        httpPort: Number(cfg.serverHttpPort ?? 8081),
        carAcId: String(cfg.carId ?? ''),
        track: String(cfg.trackId ?? ''),
        trackLayout: cfg.trackConfig ? String(cfg.trackConfig) : undefined,
        password: cfg.password ? String(cfg.password) : undefined,
      });
      await this.luaBridge.autoStart();
    } else {
      await this.launchDirect(documentsPath);
    }
  }

  async joinServer(joinConfig: JoinServerConfig): Promise<void> {
    this.logger.info(joinConfig, 'Joining server');

    const documentsPath = this.getDocumentsPath();
    const cfgDir = path.join(documentsPath, 'cfg');
    await fs.mkdir(cfgDir, { recursive: true });

    await this.writeRaceIni(cfgDir, {
      track: joinConfig.track,
      trackLayout: joinConfig.trackLayout,
      car: joinConfig.carAcId,
      serverIp: joinConfig.host,
      serverPort: joinConfig.port,
      serverHttpPort: joinConfig.httpPort,
      password: joinConfig.password,
      serverName: joinConfig.serverName,
    });

    if (config.LAUNCH_MODE === 'cm') {
      await this.ensureLuaAppInstalled();
      await this.launchViaContentManager(joinConfig, 'join');
      await this.luaBridge.joinServer(joinConfig.host, joinConfig.port, joinConfig.password);
    } else {
      await this.launchDirect(documentsPath);
    }
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping Assetto Corsa');
    if (this.currentProcess && !this.currentProcess.killed) {
      this.currentProcess.kill('SIGTERM');
    }
    if (process.platform === 'win32') {
      spawn('taskkill', ['/F', '/IM', 'acs.exe'], { stdio: 'ignore' });
      spawn('taskkill', ['/F', '/IM', 'ContentManager.exe'], { stdio: 'ignore' });
    }
  }

  private getDocumentsPath(): string {
    return (
      config.DOCUMENTS_PATH ??
      path.join(process.env.USERPROFILE ?? '', 'Documents', 'Assetto Corsa')
    );
  }

  private async writeRaceIni(
    cfgDir: string,
    cfg: {
      track: string;
      trackLayout?: string;
      car: string;
      serverIp?: string;
      serverPort?: number;
      serverHttpPort?: number;
      password?: string;
      serverName?: string;
    },
  ): Promise<void> {
    const raceIniPath = path.join(cfgDir, 'race.ini');
    const lines = [
      '[HEADER]',
      'VERSION=2',
      'TYPE=RACE',
      '',
      '[RACE]',
      'CARS=1',
      'AI_LEVEL=100',
      `MODEL=${cfg.car}`,
      'MODEL_CONFIG=',
      'SKIN=',
      `TRACK=${cfg.track}`,
      `CONFIG_TRACK=${cfg.trackLayout ?? ''}`,
      'PENALTIES=0',
      'RACE_LAPS=0',
      'DRIFT_MODE=0',
      'FIXED_SETUP=0',
      'JUMP_START_PENALTY=0',
      '',
      '[CAR_0]',
      `MODEL=${cfg.car}`,
      'MODEL_CONFIG=',
      'SKIN=',
      'DRIVERNAME=',
      'TEAM=',
      'GUID=',
      'SETUP=',
      'BALLAST=0',
      'RESTRICTOR=0',
      'SPECTATOR_MODE=0',
      'SPAWN_POINT=1',
      '',
      '[REMOTE]',
      'ACTIVE=1',
      `SERVER_IP=${cfg.serverIp ?? ''}`,
      `SERVER_PORT=${cfg.serverPort ?? ''}`,
      `SERVER_HTTP_PORT=${cfg.serverHttpPort ?? 8081}`,
      `SERVER_NAME=${cfg.serverName ?? 'Serveur SimCenter'}`,
      `PASSWORD=${cfg.password ?? ''}`,
      `REQUESTED_CAR=${cfg.car}`,
      'NAME=',
      'TEAM=',
      'GUID=',
      '__CM_EXTENDED=0',
      '',
      '[AUTOSPAWN]',
      'ACTIVE=1',
      '',
      '[SESSION_0]',
      'NAME=Practice',
      'TYPE=1',
      'DURATION_MINUTES=0',
      'SPAWN_SET=PIT',
      '',
      '[TEMPERATURE]',
      'AMBIENT=20',
      'ROAD=20',
      '',
      '[WEATHER]',
      'NAME=3_clear',
      '',
      '[WIND]',
      'DIRECTION_DEG=0',
      'SPEED_KMH_MIN=0',
      'SPEED_KMH_MAX=0',
      '',
      '[LIGHTING]',
      'SUN_ANGLE=-48',
      'TIME_MULT=1',
      'CLOUD_SPEED=0.2',
      '',
    ];
    await fs.writeFile(raceIniPath, lines.join('\n'), 'utf-8');
    this.logger.info({ path: raceIniPath }, 'race.ini written');
  }

  private async launchViaContentManager(
    cfg: JoinServerConfig,
    mode: 'online' | 'join' = 'online',
  ): Promise<void> {
    const cmExe = await this.findContentManagerExe();
    if (!cmExe) {
      throw new Error("Content Manager non trouvé. Définissez CM_PATH dans le .env de l'agent.");
    }

    await this.ensureSteamRunning();

    const params = new URLSearchParams({
      ip: cfg.host,
      port: String(cfg.port),
      httpPort: String(cfg.httpPort),
      car: cfg.carAcId,
    });
    if (cfg.password) params.set('plainPassword', cfg.password);

    const uri = `acmanager://race/online${mode === 'join' ? '/join' : ''}?${params.toString()}`;

    const cmDir = path.dirname(cmExe);
    this.currentProcess = spawn(cmExe, [uri], {
      cwd: cmDir,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    this.currentProcess.on('error', (err) => {
      this.logger.error({ err }, 'Failed to spawn Content Manager');
    });
    this.logger.info({ uri, cmExe }, 'Launched via Content Manager');
  }

  private async findContentManagerExe(): Promise<string | undefined> {
    if (config.CM_PATH) {
      const cmExe = path.join(config.CM_PATH, 'Content Manager.exe');
      if (await this.pathExists(cmExe)) return cmExe;
      this.logger.warn({ cmExe }, 'Configured CM_PATH does not contain Content Manager.exe');
    }

    const defaultPaths = [
      path.join(process.env.LOCALAPPDATA ?? '', 'AcTools Content Manager', 'Content Manager.exe'),
      path.join(process.env.PROGRAMFILES ?? '', 'AcTools Content Manager', 'Content Manager.exe'),
      path.join(
        process.env['PROGRAMFILES(X86)'] ?? '',
        'AcTools Content Manager',
        'Content Manager.exe',
      ),
    ];

    for (const p of defaultPaths) {
      if (await this.pathExists(p)) return p;
    }

    const libraries = this.getSteamLibraries();
    for (const lib of libraries) {
      const dir = path.join(lib, 'steamapps', 'common', 'Assetto Corsa');
      if (!(await this.pathExists(dir))) continue;
      try {
        const entries = await fs.readdir(dir);
        const found = entries.find((e) => /^Content Manager\s*.+\.exe$/i.test(e));
        if (found) return path.join(dir, found);
      } catch {
        // ignore
      }
    }

    return undefined;
  }

  private getSteamLibraries(): string[] {
    const libs: string[] = [];
    const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    for (const letter of letters) {
      libs.push(`${letter}:\\Steam`);
      libs.push(`${letter}:\\Program Files (x86)\\Steam`);
      libs.push(`${letter}:\\Program Files\\Steam`);
    }

    const vdf = path.join('C:', 'Program Files (x86)', 'Steam', 'steamapps', 'libraryfolders.vdf');
    try {
      const data = readFileSync(vdf, 'utf-8');
      const matches = data.match(/"path"\s+"(.+?)"/g);
      if (matches) {
        for (const m of matches) {
          const p = m.replace(/\\"/g, '"').match(/"path"\s+"(.+?)"/);
          if (p && p[1] && !libs.includes(p[1])) libs.push(p[1]);
        }
      }
    } catch {
      // ignore
    }

    return libs;
  }

  private async ensureSteamRunning(): Promise<void> {
    if (process.platform !== 'win32') return;

    const isRunning = await new Promise<boolean>((resolve) => {
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          'Get-Process steam -ErrorAction SilentlyContinue | Select-Object -First 1',
        ],
        (err, stdout) => {
          resolve(!err && stdout.trim().length > 0);
        },
      );
    });

    if (isRunning) {
      this.logger.debug('Steam already running');
      return;
    }

    const steamExe = await this.findSteamExe();
    if (!steamExe) {
      this.logger.warn('Steam.exe not found, skipping Steam startup');
      return;
    }

    this.logger.info({ steamExe }, 'Starting Steam');
    const child = spawn(steamExe, [], {
      cwd: path.dirname(steamExe),
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();
    await new Promise((resolve) => setTimeout(resolve, 8000));
  }

  private async findSteamExe(): Promise<string | undefined> {
    const candidates = [
      path.join('C:', 'Program Files (x86)', 'Steam', 'steam.exe'),
      path.join('C:', 'Program Files', 'Steam', 'steam.exe'),
    ];
    for (const c of candidates) {
      if (await this.pathExists(c)) return c;
    }
    return undefined;
  }

  private async launchDirect(_documentsPath: string): Promise<void> {
    const acPath =
      config.AC_PATH ?? 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\assettocorsa';
    const acsExe = path.join(acPath, 'acs.exe');
    this.currentProcess = spawn(acsExe, [], {
      cwd: acPath,
      detached: true,
      stdio: 'ignore',
    });
    this.logger.info({ exe: acsExe }, 'Launched Assetto Corsa directly');
  }

  private async ensureLuaAppInstalled(): Promise<void> {
    if (process.platform !== 'win32') return;
    const acPath = config.AC_PATH;
    if (!acPath) return;

    const targetDir = path.join(acPath, 'apps', 'lua', 'SimCenterManager');
    const files = [
      {
        src: path.join(__dirname, '..', 'lua_app', 'SimCenterManager', 'manifest.ini'),
        dest: path.join(targetDir, 'manifest.ini'),
      },
      {
        src: path.join(__dirname, '..', 'lua_app', 'SimCenterManager', 'SimCenterManager.lua'),
        dest: path.join(targetDir, 'SimCenterManager.lua'),
      },
    ];

    try {
      await fs.mkdir(targetDir, { recursive: true });
      for (const { src, dest } of files) {
        if (await this.pathExists(src)) {
          await fs.copyFile(src, dest);
        } else {
          this.logger.warn({ src }, 'Lua app source not found in snapshot');
        }
      }
      this.logger.info({ targetDir }, 'Lua app installed');
    } catch (err) {
      this.logger.warn({ err }, 'Failed to install Lua app');
    }
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
