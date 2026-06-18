import { spawn, ChildProcess } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { Logger } from 'pino';
import { TelemetrySnapshot } from '@simracing/shared';

export type BlankingOverride = 'auto' | 'hide' | 'show';

interface PlaylistItem {
  path: string;
  type: 'image' | 'video';
}

export class BlankingManager {
  private process: ChildProcess | null = null;
  private override: BlankingOverride = 'auto';
  private acRunning = false;
  private acLoaded = false;
  private driving = false;
  private lastTelemetryAt = 0;
  private readonly telemetryTimeoutMs = 5000;
  private scriptPath: string | null = null;
  private mediaPaths: string[] = [];
  private slideIntervalMs = 10000;

  constructor(private readonly logger: Logger) {}

  async init(): Promise<void> {
    try {
      const src = path.join(__dirname, '..', 'assets', 'blanking.ps1');
      const tmpDir = path.join(process.env.TEMP || '/tmp', 'simracing-manager');
      await fs.mkdir(tmpDir, { recursive: true });
      this.scriptPath = path.join(tmpDir, 'blanking.ps1');
      const content = await fs.readFile(src, 'utf-8');
      await fs.writeFile(this.scriptPath, content, 'utf-8');
      this.logger.debug({ scriptPath: this.scriptPath }, 'Blanking script extracted');
    } catch (err) {
      this.logger.error({ err }, 'Failed to extract blanking script');
    }
  }

  setAcRunning(running: boolean): void {
    this.acRunning = running;
    this.evaluate();
  }

  setAcLoaded(loaded: boolean): void {
    if (this.acLoaded !== loaded) {
      this.acLoaded = loaded;
      this.logger.info({ acLoaded: loaded }, 'AC shared memory state changed');
      this.evaluate();
    }
  }

  onTelemetry(snapshot: TelemetrySnapshot): void {
    this.lastTelemetryAt = Date.now();
    this.driving = this.isDriving(snapshot);
    this.evaluate();
  }

  hide(): void {
    this.logger.info('Blanking override: hide');
    this.override = 'hide';
    this.evaluate();
  }

  show(): void {
    this.logger.info('Blanking override: show');
    this.override = 'show';
    this.evaluate();
  }

  setAuto(): void {
    this.logger.info('Blanking override: auto');
    this.override = 'auto';
    this.evaluate();
  }

  setMediaPaths(paths: string[]): void {
    const changed =
      paths.length !== this.mediaPaths.length || paths.some((p, i) => p !== this.mediaPaths[i]);

    if (!changed) return;

    this.mediaPaths = paths;
    this.logger.info({ count: paths.length }, 'Blanking media paths updated');

    // If currently blanking, restart with new playlist
    if (this.override !== 'hide' && this.process && !this.process.killed) {
      this.stopBlanking();
      this.process = null;
      this.startBlanking();
    }
  }

  isBlankingActive(): boolean {
    return this.process !== null && !this.process.killed;
  }

  private isDriving(snapshot: TelemetrySnapshot): boolean {
    if (snapshot.isInMainMenu === true) return false;
    if (snapshot.isSessionStarted === false) return false;

    return (
      snapshot.speedKmh > 0.5 ||
      snapshot.rpm > 100 ||
      snapshot.gear > 0 ||
      snapshot.throttle > 0 ||
      snapshot.brake > 0
    );
  }

  private evaluate(): void {
    if (this.override === 'hide') {
      this.stopBlanking();
      return;
    }
    if (this.override === 'show') {
      this.startBlanking();
      return;
    }

    const telemetryRecent = Date.now() - this.lastTelemetryAt < this.telemetryTimeoutMs;
    // Hide blanking when AC shared memory is loaded (game fully initialized).
    // Keep legacy fallback: also hide when acs.exe is running AND telemetry shows driving.
    const shouldHide = this.acLoaded || (this.acRunning && this.driving && telemetryRecent);

    if (shouldHide) {
      this.stopBlanking();
    } else {
      this.startBlanking();
    }
  }

  private buildPlaylist(): PlaylistItem[] {
    return this.mediaPaths.map((p) => {
      const ext = path.extname(p).toLowerCase();
      const isVideo = ext === '.mp4' || ext === '.webm';
      return { path: p, type: isVideo ? 'video' : 'image' };
    });
  }

  private startBlanking(): void {
    if (this.process && !this.process.killed) return;
    if (!this.scriptPath) {
      this.logger.warn('Blanking script not extracted, cannot start');
      return;
    }

    this.logger.info('Starting blanking screen');

    const playlist = this.buildPlaylist();
    const playlistJson = JSON.stringify(playlist);
    const args = [
      '-Sta',
      '-WindowStyle',
      'Hidden',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      this.scriptPath,
      '-PlaylistJson',
      playlistJson,
      '-SlideIntervalMs',
      String(this.slideIntervalMs),
    ];

    this.process = spawn('powershell.exe', args, {
      detached: false,
      windowsHide: true,
    });

    this.process.on('exit', (code) => {
      this.logger.debug({ code }, 'Blanking screen process exited');
      this.process = null;
    });
    this.process.on('error', (err) => {
      this.logger.error({ err }, 'Blanking screen process error');
      this.process = null;
    });
  }

  private stopBlanking(): void {
    if (!this.process || this.process.killed) return;

    this.logger.info('Stopping blanking screen');
    const proc = this.process;
    proc.kill('SIGTERM');

    setTimeout(() => {
      if (proc && !proc.killed) {
        this.logger.warn('Force killing blanking screen');
        proc.kill('SIGKILL');
      }
    }, 2000);
  }
}
