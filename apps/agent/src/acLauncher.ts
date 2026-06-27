import { spawn, ChildProcess, execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from 'pino';
import { config } from './config';
import { LaunchSessionPayload } from '@simracing/shared';
import { LuaBridge } from './luaBridge';
import { findContentManagerExe } from './cmLocator';
import { ProcessMonitor } from './processMonitor';

export interface JoinServerConfig {
  host: string;
  port: number;
  httpPort: number;
  password?: string;
  carAcId: string;
  track: string;
  trackLayout?: string;
  serverName?: string;
  durationMinutes?: number;
  clientName?: string;
  difficulty?: 'EASY' | 'PRO' | 'CUSTOM';
  sessionId?: string;
}

export class AcLauncher {
  private currentProcess: ChildProcess | null = null;
  private readonly luaBridge: LuaBridge;
  private readonly processMonitor: ProcessMonitor;

  constructor(private readonly logger: Logger) {
    this.luaBridge = new LuaBridge(logger);
    this.processMonitor = new ProcessMonitor(logger);
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
    this.logger.info(joinConfig, 'Joining server (direct acs.exe)');

    const documentsPath = this.getDocumentsPath();
    const cfgDir = path.join(documentsPath, 'cfg');
    await fs.mkdir(cfgDir, { recursive: true });

    await this.ensureLuaAppInstalled();
    await this.luaBridge.setJoinFlag();

    await this.writeJoinRaceIni(cfgDir, {
      track: joinConfig.track,
      trackLayout: joinConfig.trackLayout,
      car: joinConfig.carAcId,
      serverIp: joinConfig.host,
      serverPort: joinConfig.port,
      serverHttpPort: joinConfig.httpPort,
      password: joinConfig.password,
      serverName: joinConfig.serverName,
    });

    await this.configureVideoIni(documentsPath);
    await this.configureAssistsIni(documentsPath, joinConfig.difficulty);
    if (joinConfig.clientName) {
      await this.luaBridge.setClientName(joinConfig.clientName);
    }
    if (joinConfig.sessionId) {
      await this.luaBridge.setSessionId(joinConfig.sessionId);
    }

    await this.launchAcs();

    // The Lua app will continuously call ac.tryToStart(true) while the join flag
    // is present and AC is in the main menu. We also send an explicit command now.
    await this.luaBridge.autoStart();
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping Assetto Corsa');
    if (this.currentProcess && !this.currentProcess.killed) {
      this.currentProcess.kill('SIGTERM');
    }
    if (process.platform === 'win32') {
      await this.killProcess('acs.exe');
      await this.killProcess('acShowroom.exe');
      await this.killProcess('ContentManager.exe');
    }
  }

  async quit(): Promise<void> {
    this.logger.info('Sending quit command to Assetto Corsa');
    await this.luaBridge.quit();
    // Give AC a few seconds to shut down gracefully, then force kill if still running.
    await new Promise((resolve) => setTimeout(resolve, 5000));
    if (await this.processMonitor.isAcRunning()) {
      this.logger.warn('AC still running after quit command, forcing stop');
      await this.stop();
    } else {
      this.logger.info('AC quit confirmed');
    }
  }

  private async killProcess(imageName: string): Promise<void> {
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn('taskkill', ['/F', '/IM', imageName], { stdio: 'ignore' });
        proc.on('exit', (code) => {
          if (code === 0 || code === 128) {
            resolve();
          } else {
            reject(new Error(`taskkill exited with code ${code}`));
          }
        });
        proc.on('error', (err) => reject(err));
      });
      this.logger.info({ imageName }, 'Process killed');
    } catch {
      // Process may not be running; this is fine.
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
    const cmExe = await findContentManagerExe(this.logger);
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
    await this.launchAcs();
  }

  private async launchAcs(): Promise<void> {
    const acPath = this.getAcPath();
    const acsExe = path.join(acPath, 'acs.exe');
    if (!(await this.pathExists(acsExe))) {
      throw new Error(`acs.exe introuvable à ${acsExe}. Vérifie AC_PATH dans le .env.`);
    }

    // Kill any existing AC process so the new race.ini is read.
    if (process.platform === 'win32') {
      spawn('taskkill', ['/F', '/IM', 'acs.exe'], { stdio: 'ignore' });
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    this.currentProcess = spawn(acsExe, [], {
      cwd: acPath,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    this.currentProcess.on('error', (err) => {
      this.logger.error({ err }, 'Failed to spawn acs.exe');
    });
    this.logger.info({ exe: acsExe }, 'Launched acs.exe');
  }

  private getAcPath(): string {
    return config.AC_PATH ?? 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\assettocorsa';
  }

  private async writeJoinRaceIni(
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
      `TRACK=${cfg.track}`,
      `CONFIG_TRACK=${cfg.trackLayout ?? ''}`,
      `MODEL=${cfg.car}`,
      '',
      '[CAR_0]',
      `MODEL=${cfg.car}`,
      'SKIN=',
      'SETUP=',
      '',
      '[REMOTE]',
      'ACTIVE=1',
      `SERVER_IP=${cfg.serverIp ?? ''}`,
      `SERVER_PORT=${cfg.serverPort ?? ''}`,
      `SERVER_HTTP_PORT=${cfg.serverHttpPort ?? 8081}`,
      `SERVER_NAME=${cfg.serverName ?? 'Serveur SimCenter'}`,
      `PASSWORD=${cfg.password ?? ''}`,
      `REQUESTED_CAR=${cfg.car}`,
      '',
    ];
    await fs.writeFile(raceIniPath, lines.join('\n'), 'utf-8');
    this.logger.info({ path: raceIniPath }, 'race.ini written for direct join');
  }

  private async configureVideoIni(documentsPath: string): Promise<void> {
    const videoIniPath = path.join(documentsPath, 'cfg', 'video.ini');
    if (!(await this.pathExists(videoIniPath))) return;

    const modeMap: Record<string, string> = {
      single: 'DEFAULT',
      triple: 'TRIPLE',
      vr: 'OPENVR',
    };
    const targetMode = modeMap[config.SCREEN_MODE] ?? 'DEFAULT';

    try {
      const content = await fs.readFile(videoIniPath, 'utf-8');
      const updated = this.setIniValue(content, 'CAMERA', 'MODE', targetMode);
      await fs.writeFile(videoIniPath, updated, 'utf-8');
      this.logger.info({ path: videoIniPath, mode: targetMode }, 'video.ini updated');
    } catch (err) {
      this.logger.warn({ err }, 'Failed to update video.ini');
    }
  }

  private async configureAssistsIni(
    documentsPath: string,
    difficulty?: 'EASY' | 'PRO' | 'CUSTOM',
  ): Promise<void> {
    const assistsIniPath = path.join(documentsPath, 'cfg', 'assists.ini');
    const preset = difficulty ?? (config.ASSIST_PRESET.toUpperCase() as 'EASY' | 'PRO' | 'CUSTOM');
    const isEasy = preset === 'EASY';
    const isPro = preset === 'PRO';

    const lines = [
      '[ASSISTS]',
      `IDEAL_LINE=${isEasy ? 1 : 0}`,
      'AUTO_BLIP=1',
      `STABILITY_CONTROL=${isEasy ? 100 : isPro ? 50 : 0}`,
      'AUTO_BRAKE=0',
      `AUTO_SHIFTER=${isEasy ? 1 : 0}`,
      `ABS=${isEasy ? 1 : isPro ? 1 : 0}`,
      `TRACTION_CONTROL=${isEasy ? 1 : isPro ? 1 : 0}`,
      `AUTO_CLUTCH=${isEasy ? 1 : isPro ? 1 : 0}`,
      'VISUALDAMAGE=1',
      'DAMAGE=0',
      'FUEL_RATE=1',
      'TYRE_WEAR=1',
      'TYRE_BLANKETS=1',
      'SLIPSTREAM=1',
      '',
    ];

    try {
      await fs.writeFile(assistsIniPath, lines.join('\n'), 'utf-8');
      this.logger.info({ path: assistsIniPath, preset }, 'assists.ini written');
    } catch (err) {
      this.logger.warn({ err }, 'Failed to write assists.ini');
    }
  }

  private setIniValue(content: string, section: string, key: string, value: string): string {
    const sectionPattern = new RegExp(`\\[${section}\\]`, 'i');
    if (!sectionPattern.test(content)) {
      return content + `\n[${section}]\n${key}=${value}\n`;
    }

    const lines = content.split('\n');
    let inSection = false;
    let replaced = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('[') && line.endsWith(']')) {
        inSection = line.slice(1, -1).toLowerCase() === section.toLowerCase();
        continue;
      }
      if (inSection && line.toLowerCase().startsWith(key.toLowerCase() + '=')) {
        lines[i] = `${key}=${value}`;
        replaced = true;
        break;
      }
    }

    if (!replaced) {
      // Append after the section header.
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().toLowerCase() === `[${section.toLowerCase()}]`) {
          lines.splice(i + 1, 0, `${key}=${value}`);
          break;
        }
      }
    }

    return lines.join('\n');
  }

  async ensureLuaAppInstalled(): Promise<void> {
    if (process.platform !== 'win32') {
      this.logger.debug('Lua app install skipped: not Windows');
      return;
    }
    const acPath = config.AC_PATH;
    if (!acPath) {
      this.logger.warn('Lua app install skipped: AC_PATH not set');
      return;
    }

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
        try {
          const content = await fs.readFile(src, 'utf-8');
          await fs.writeFile(dest, content, 'utf-8');
          this.logger.info({ src, dest }, 'Lua app file copied');
        } catch (readErr) {
          this.logger.warn({ src, err: readErr }, 'Lua app source not readable from snapshot');
        }
      }
      const manifestPath = path.join(targetDir, 'manifest.ini');
      const luaPath = path.join(targetDir, 'SimCenterManager.lua');
      const manifestExists = await this.pathExists(manifestPath);
      const luaExists = await this.pathExists(luaPath);
      this.logger.info({ targetDir, manifestExists, luaExists }, 'Lua app install completed');
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
