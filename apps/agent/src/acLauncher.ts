import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from 'pino';
import { config } from './config';
import { LaunchSessionPayload } from '@simracing/shared';

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

    await this.writeRaceIni(cfgDir, payload.config);

    if (config.LAUNCH_MODE === 'cm') {
      await this.launchViaContentManager(payload.config);
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

  private async writeRaceIni(cfgDir: string, sessionConfig: unknown): Promise<void> {
    const cfg = (sessionConfig ?? {}) as Record<string, unknown>;
    const raceIniPath = path.join(cfgDir, 'race.ini');
    const lines = [
      '[RACE]',
      `TRACK=${cfg.trackId ?? 'ks_nordschleife'}`,
      `CONFIG_TRACK=${cfg.trackConfig ?? ''}`,
      `MODEL=${cfg.carId ?? 'ks_porsche_911_gt3_rs'}`,
      `CARS=${cfg.carId ?? 'ks_porsche_911_gt3_rs'}`,
      `DIFFICULTY=${cfg.assistPreset ?? 'pro'}`,
      '',
      '[SERVER]',
      `NAME=${cfg.serverName ?? ''}`,
      `IP=${cfg.serverIp ?? ''}`,
      `PORT=${cfg.serverPort ?? ''}`,
      `PASSWORD=${cfg.password ?? ''}`,
      '',
      '[REMOTE]',
      'ACTIVE=1',
      `SERVER_IP=${cfg.serverIp ?? ''}`,
      `SERVER_PORT=${cfg.serverHttpPort ?? ''}`,
    ];
    await fs.writeFile(raceIniPath, lines.join('\n'), 'utf-8');
    this.logger.info({ path: raceIniPath }, 'race.ini written');
  }

  private async launchViaContentManager(sessionConfig: unknown): Promise<void> {
    const cmPath =
      config.CM_PATH ?? path.join(process.env.LOCALAPPDATA ?? '', 'AcTools Content Manager');
    const cmExe = path.join(cmPath, 'Content Manager.exe');
    const cfg = (sessionConfig ?? {}) as Record<string, unknown>;

    const uri =
      `acmanager://launch?` +
      new URLSearchParams({
        acs_exe: 'acs.exe',
        b1: '1',
        guid: '',
        host: String(cfg.serverIp ?? ''),
        port: String(cfg.serverPort ?? ''),
        http_port: String(cfg.serverHttpPort ?? ''),
        password: String(cfg.password ?? ''),
        car_id: String(cfg.carId ?? ''),
        track_id: String(cfg.trackId ?? ''),
        car_skin: '',
      }).toString();

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
