import { spawn, ChildProcess } from 'child_process';
import fs from 'fs/promises';
import { writeFileSync } from 'fs';
import path from 'path';
import { Logger } from 'pino';
import { TelemetrySnapshot } from '@simracing/shared';
import { RaceResultData, getLeaderboard } from './raceResultCleaner';
import { config } from './config';

export type BlankingOverride = 'auto' | 'hide' | 'show';

interface SessionResultsSummary {
  clientName?: string;
  carAcId?: string;
  track?: string;
  trackLayout?: string;
  bestLapMs?: number;
  result?: RaceResultData;
}

function formatLapTime(ms: number): string {
  if (!ms || ms <= 0) return '-';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

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
  private readySince: number | null = null;
  private readyTimeout: NodeJS.Timeout | null = null;
  private readyConfirmed = false;
  private readonly readyDelayMs = 5000;
  private stoppingIntentionally = false;
  private scriptPath: string | null = null;
  private playlistPath: string | null = null;
  private mediaPaths: string[] = [];
  private slideIntervalMs = 10000;
  private resultsHtmlPath: string | null = null;

  constructor(private readonly logger: Logger) {}

  async init(): Promise<void> {
    try {
      const src = path.join(__dirname, '..', 'assets', 'blanking.ps1');
      const tmpDir = path.join(process.env.TEMP || '/tmp', 'simracing-manager');
      await fs.mkdir(tmpDir, { recursive: true });
      this.scriptPath = path.join(tmpDir, 'blanking.ps1');
      const content = await fs.readFile(src, 'utf-8');
      await fs.writeFile(this.scriptPath, content, 'utf-8');
      this.playlistPath = path.join(tmpDir, 'blanking-playlist.json');
      this.logger.debug(
        { scriptPath: this.scriptPath, playlistPath: this.playlistPath },
        'Blanking script extracted',
      );
    } catch (err) {
      this.logger.error({ err }, 'Failed to extract blanking script');
    }
  }

  setAcRunning(running: boolean): void {
    this.acRunning = running;
    if (!running) this.clearReady();
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
    this.updateReadyState(snapshot);
    this.evaluate();
  }

  hide(): void {
    this.logger.info('Blanking override: hide');
    this.override = 'hide';
    this.clearResults();
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
    this.clearResults();
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

  showResults(summary: SessionResultsSummary): void {
    this.logger.info(summary, 'Showing session results');
    this.generateResultsHtml(summary);
    this.override = 'show';
    this.evaluate();
  }

  clearResults(): void {
    this.resultsHtmlPath = null;
  }

  private generateResultsHtml(summary: SessionResultsSummary): void {
    const tmpDir = path.join(process.env.TEMP || '/tmp', 'simracing-manager');
    const htmlPath = path.join(tmpDir, 'session-results.html');
    const bestLap = formatLapTime(summary.bestLapMs ?? 0);
    const trackDisplay = summary.trackLayout
      ? `${summary.track} (${summary.trackLayout})`
      : (summary.track ?? '-');
    const leaderboard = summary.result ? this.renderLeaderboard(summary.result) : '';

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Session terminée</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
    body {
      background: radial-gradient(circle at center, #111 0%, #000 100%);
      color: #fff;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: clamp(24px, 4vw, 64px);
      text-align: center;
    }
    h1 {
      font-size: clamp(32px, 5vw, 96px);
      margin: 0 0 0.5em;
      color: #00d4ff;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: clamp(12px, 2vw, 32px);
      width: min(95%, 1400px);
      margin-bottom: clamp(24px, 3vw, 48px);
    }
    .item { background: rgba(255,255,255,0.06); border-radius: 16px; padding: clamp(12px, 1.5vw, 24px); }
    .label { color: #888; font-size: clamp(12px, 1.2vw, 18px); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.4em; }
    .value { font-size: clamp(18px, 2.2vw, 40px); font-weight: 600; }
    .best-lap .value { color: #00d4ff; }
    .leaderboard { width: min(95%, 1400px); background: rgba(255,255,255,0.04); border-radius: 16px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; font-size: clamp(14px, 1.6vw, 26px); }
    th { background: rgba(0,212,255,0.15); color: #00d4ff; padding: clamp(8px, 1vw, 16px); text-transform: uppercase; letter-spacing: 0.05em; }
    td { padding: clamp(8px, 1vw, 16px); border-bottom: 1px solid rgba(255,255,255,0.06); }
    tr:last-child td { border-bottom: none; }
    .pos { font-weight: 700; color: #00d4ff; }
  </style>
</head>
<body>
  <h1>Session terminée</h1>
  <div class="summary">
    <div class="item">
      <div class="label">Pilote</div>
      <div class="value">${this.escapeHtml(summary.clientName ?? '-')}</div>
    </div>
    <div class="item">
      <div class="label">Voiture</div>
      <div class="value">${this.escapeHtml(summary.carAcId ?? '-')}</div>
    </div>
    <div class="item">
      <div class="label">Circuit</div>
      <div class="value">${this.escapeHtml(trackDisplay)}</div>
    </div>
    <div class="item best-lap">
      <div class="label">Meilleur tour</div>
      <div class="value">${bestLap}</div>
    </div>
  </div>
  ${leaderboard}
</body>
</html>`;

    writeFileSync(htmlPath, html, 'utf-8');
    this.resultsHtmlPath = htmlPath;
  }

  private renderLeaderboard(result: RaceResultData): string {
    const entries = getLeaderboard(result);
    if (entries.length === 0) return '';
    const rows = entries
      .map(
        (entry) => `<tr>
      <td class="pos">${entry.position}</td>
      <td>${this.escapeHtml(entry.name)}</td>
      <td>${this.escapeHtml(entry.car)}</td>
      <td>${entry.laps}</td>
      <td>${formatLapTime(entry.bestLapMs)}</td>
    </tr>`,
      )
      .join('');
    return `<div class="leaderboard">
  <table>
    <thead>
      <tr>
        <th>Pos</th>
        <th>Pilote</th>
        <th>Voiture</th>
        <th>Tours</th>
        <th>Meilleur tour</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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

    // Hide blanking when AC shared memory is loaded (game fully initialized).
    // Otherwise, wait for the car to be ready for a short delay before removing blanking.
    const shouldHide = this.acLoaded || (this.acRunning && this.readyConfirmed);

    if (shouldHide) {
      this.stopBlanking();
    } else {
      this.startBlanking();
    }
  }

  private updateReadyState(snapshot: TelemetrySnapshot): void {
    const ready = this.isReady(snapshot);
    if (ready && this.readySince === null) {
      this.readySince = Date.now();
      this.logger.info('Car ready detected, blanking will be removed in 5s');
      this.readyTimeout = setTimeout(() => {
        this.readyConfirmed = true;
        this.evaluate();
      }, this.readyDelayMs);
    } else if (!ready && this.readySince !== null) {
      this.clearReady();
      this.logger.info('Car ready state lost, blanking delay reset');
    }
  }

  private isReady(snapshot: TelemetrySnapshot): boolean {
    if (snapshot.isInMainMenu === true) return false;
    return snapshot.isSessionStarted === true;
  }

  private clearReady(): void {
    if (this.readyTimeout) {
      clearTimeout(this.readyTimeout);
      this.readyTimeout = null;
    }
    this.readySince = null;
    this.readyConfirmed = false;
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
    if (this.playlistPath) {
      writeFileSync(this.playlistPath, playlistJson, 'utf-8');
    }

    const args = [
      '-Sta',
      '-WindowStyle',
      'Hidden',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      this.scriptPath,
      '-PlaylistPath',
      this.playlistPath ?? '',
      '-SlideIntervalMs',
      String(this.slideIntervalMs),
    ];

    if (this.resultsHtmlPath) {
      args.push('-ResultsHtmlPath', this.resultsHtmlPath);
    }

    args.push('-MonitorIndex', String(config.BLANKING_MONITOR));

    this.process = spawn('powershell.exe', args, {
      detached: false,
      windowsHide: true,
    });

    this.process.on('exit', (code) => {
      this.logger.debug(
        { code, intentional: this.stoppingIntentionally },
        'Blanking screen process exited',
      );
      if (!this.stoppingIntentionally) {
        this.logger.info('Blanking screen was closed manually, switching to hide override');
        this.override = 'hide';
      }
      this.stoppingIntentionally = false;
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
    this.stoppingIntentionally = true;
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
