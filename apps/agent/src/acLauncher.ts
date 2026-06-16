import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from 'pino';
import { config } from './config';
import { LaunchSessionPayload } from '@simracing/shared';

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

  constructor(private readonly logger: Logger) {}

  async launch(payload: LaunchSessionPayload): Promise<void> {
    this.logger.info({ sessionId: payload.sessionId }, 'Launching Assetto Corsa');

    const documentsPath =
      config.DOCUMENTS_PATH ??
      path.join(process.env.USERPROFILE ?? '', 'Documents', 'Assetto Corsa');
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
      await this.launchViaContentManager({
        host: String(cfg.serverIp ?? ''),
        port: Number(cfg.serverPort ?? 0),
        httpPort: Number(cfg.serverHttpPort ?? 8081),
        carAcId: String(cfg.carId ?? ''),
        track: String(cfg.trackId ?? ''),
        trackLayout: cfg.trackConfig ? String(cfg.trackConfig) : undefined,
        password: cfg.password ? String(cfg.password) : undefined,
      });
    } else {
      await this.launchDirect(documentsPath);
    }
  }

  async joinServer(joinConfig: JoinServerConfig): Promise<void> {
    this.logger.info(joinConfig, 'Joining server');

    const documentsPath =
      config.DOCUMENTS_PATH ??
      path.join(process.env.USERPROFILE ?? '', 'Documents', 'Assetto Corsa');
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
      await this.launchViaContentManager(joinConfig);
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

  private async launchViaContentManager(cfg: JoinServerConfig): Promise<void> {
    const cmPath =
      config.CM_PATH ?? path.join(process.env.LOCALAPPDATA ?? '', 'AcTools Content Manager');
    const cmExe = path.join(cmPath, 'Content Manager.exe');

    const params = new URLSearchParams({
      acs_exe: 'acs.exe',
      b1: '1',
      guid: '',
      ip: cfg.host,
      port: String(cfg.port),
      httpPort: String(cfg.httpPort),
      car: cfg.carAcId,
    });
    if (cfg.password) params.set('plainPassword', cfg.password);

    const uri = `acmanager://race/online?${params.toString()}`;

    this.currentProcess = spawn(cmExe, [uri], { detached: true, stdio: 'ignore' });
    this.logger.info({ uri }, 'Launched via Content Manager');
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
}
