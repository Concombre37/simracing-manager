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
  /** True while the leaderboard is still being read from race_out.json.
   * Shows a loading placeholder instead of an empty gap. */
  pending?: boolean;
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
  private podInGame = false;
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

  /**
   * Mirrors the status reported to the backend via `agent:status`.
   * While a launched session is in progress (`in_game`), auto blanking must
   * stay up until telemetry confirms the car is really on track.
   */
  setPodInGame(inGame: boolean): void {
    if (this.podInGame === inGame) return;
    this.podInGame = inGame;
    if (inGame) {
      // A new session must always start from a clean auto state: a manual
      // hide/show left over from maintenance (Escape, "Masquer écran") would
      // otherwise stick forever. This is done here, atomically with
      // podInGame flipping to true and before the evaluate() call below,
      // rather than via a separate setAuto() call beforehand — doing it
      // separately left a brief window where evaluate() would run with
      // podInGame still false and could use stale acLoaded/acRunning state
      // to incorrectly dismiss blanking for a moment.
      this.override = 'auto';
      this.clearResults();
      this.restartIfActive();
      // Force a fresh ready confirmation for the new session so blanking
      // cannot be dismissed by stale state from a previous run.
      this.clearReady();
    }
    this.logger.info({ podInGame: inGame }, 'POD in-game status changed');
    this.evaluate();
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
    // Coming back from the results screen (or any other content) must force
    // a fresh window: startBlanking() no-ops if a process is already up, so
    // without this the results screen could stay stuck on-screen forever.
    this.restartIfActive();
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
      this.restartIfActive();
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
    // The plain waiting screen may already be up at this point (e.g. it
    // came back briefly while we were reading race_out.json). startBlanking()
    // no-ops if a process is already running, so without a forced restart
    // the results HTML would never actually be displayed.
    this.restartIfActive();
    this.evaluate();
  }

  /** Forces the current blanking window to relaunch so it picks up new content
   * (results HTML, or dropping it). No-op if blanking isn't currently shown. */
  private restartIfActive(): void {
    if (this.process && !this.process.killed) {
      this.stopBlanking();
      this.process = null;
    }
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
    const leaderboard = summary.result
      ? this.renderLeaderboard(summary.result)
      : summary.pending
        ? `<div class="leaderboard placeholder">
  <div class="spinner"></div>
  <p>Chargement du classement…</p>
</div>`
        : `<div class="leaderboard placeholder">
  <p>Classement indisponible</p>
</div>`;

    // Rendered inside a WPF WebBrowser control (IE11 engine): no CSS grid,
    // no clamp()/conic-gradient. Layout uses flexbox/vw units and a
    // repeating-linear-gradient checkerboard, all supported in IE11 edge
    // mode (see the FEATURE_BROWSER_EMULATION fix in blanking.ps1).
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
      background:
        radial-gradient(circle at 50% -10%, rgba(255,51,51,0.16) 0%, transparent 55%),
        radial-gradient(circle at 50% 110%, rgba(168,85,247,0.12) 0%, transparent 55%),
        #050508;
      color: #fff;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      text-align: center;
      animation: fadeIn 0.4s ease-out;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes revealUp {
      from { opacity: 0; transform: translateY(18px); }
      to { opacity: 1; transform: translateY(0); }
    }
    header, .driver-banner, .summary, .leaderboard {
      opacity: 0;
      animation: revealUp 0.55s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    header { animation-delay: 0.05s; }
    .driver-banner { animation-delay: 0.15s; }
    .summary { animation-delay: 0.25s; }
    .leaderboard { animation-delay: 0.35s; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .checkers {
      width: 100%;
      height: 14px;
      background-image:
        linear-gradient(45deg, #0a0a0f 25%, transparent 25%, transparent 75%, #0a0a0f 75%, #0a0a0f),
        linear-gradient(45deg, #0a0a0f 25%, #e8e8e8 25%, #e8e8e8 75%, #0a0a0f 75%, #0a0a0f);
      background-size: 14px 14px;
      background-position: 0 0, 7px 7px;
      flex-shrink: 0;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1.2vw;
      padding: 2.2vw 4vw 0.6vw;
    }
    .flag { font-size: 2.6vw; line-height: 1; }
    h1 {
      font-size: 3.6vw;
      margin: 0;
      color: #fff;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 800;
      text-shadow: 0 0 24px rgba(255,51,51,0.55);
    }
    .bar {
      width: 6vw;
      height: 5px;
      background: linear-gradient(90deg, #ff3333, #ff6b35);
      border-radius: 3px;
      margin: 0.6vw auto 1.6vw;
    }
    .driver-banner { padding: 0 4vw; margin-bottom: 1.8vw; }
    .driver-name {
      font-size: 3.1vw;
      font-weight: 800;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .driver-meta {
      margin-top: 0.4vw;
      font-size: 1.3vw;
      color: #9a9aa8;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .summary {
      display: flex;
      flex-direction: column;
      gap: 0.9vw;
      width: 70%;
      max-width: 900px;
      margin: 0 auto 2vw;
    }
    .tile {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1vw;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      padding: 0.9vw 1.4vw;
      text-align: left;
    }
    .tile .label {
      color: #8a8a96;
      font-size: 1vw;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      white-space: nowrap;
    }
    .tile .value {
      font-size: 1.5vw;
      font-weight: 700;
      text-align: right;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tile.best-lap {
      background: linear-gradient(135deg, rgba(168,85,247,0.22), rgba(168,85,247,0.06));
      border-color: rgba(168,85,247,0.5);
      box-shadow: 0 0 30px -8px rgba(168,85,247,0.5);
    }
    .tile.best-lap .label { color: #c9a3fb; }
    .tile.best-lap .value {
      color: #c084fc;
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 1.8vw;
    }
    .leaderboard {
      width: 92%;
      max-width: 1400px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      overflow: hidden;
      margin-bottom: 2vw;
    }
    .leaderboard.placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.8vw;
      padding: 2.2vw;
      color: #8a8a96;
      font-size: 1.1vw;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .spinner {
      width: 2vw;
      height: 2vw;
      border-radius: 50%;
      border: 3px solid rgba(255,255,255,0.12);
      border-top-color: #ff6b35;
      animation: spin 0.8s linear infinite;
    }
    table { width: 100%; border-collapse: collapse; font-size: 1.35vw; }
    th {
      background: rgba(255,51,51,0.14);
      color: #ff8a7a;
      padding: 0.9vw 0.8vw;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 0.9vw;
      text-align: left;
    }
    th.num, td.num { text-align: center; }
    td {
      padding: 0.8vw;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    tr:last-child td { border-bottom: none; }
    tr.p1 td { background: rgba(255,215,0,0.08); }
    tr.p2 td { background: rgba(192,192,192,0.06); }
    tr.p3 td { background: rgba(205,127,50,0.06); }
    td.pos { text-align: center; }
    .pos-badge {
      display: inline-block;
      min-width: 2.2vw;
      padding: 0.25vw 0.5vw;
      border-radius: 6px;
      font-weight: 800;
      font-family: 'Consolas', 'Courier New', monospace;
    }
    .p1 .pos-badge { background: linear-gradient(135deg, #ffd700, #b8860b); color: #1a1500; }
    .p2 .pos-badge { background: linear-gradient(135deg, #d8d8d8, #9a9a9a); color: #1a1a1a; }
    .p3 .pos-badge { background: linear-gradient(135deg, #cd8a4a, #8a5a26); color: #1a0f00; }
    .pos-badge.other { background: rgba(255,255,255,0.08); color: #ccc; }
    td.time { font-family: 'Consolas', 'Courier New', monospace; }
    footer {
      margin-top: auto;
      padding: 1.2vw 0 1.6vw;
      color: #55555f;
      font-size: 0.9vw;
      text-transform: uppercase;
      letter-spacing: 0.15em;
    }
  </style>
</head>
<body>
  <div class="checkers"></div>
  <header>
    <span class="flag">🏁</span>
    <h1>Session terminée</h1>
    <span class="flag">🏁</span>
  </header>
  <div class="bar"></div>
  <div class="driver-banner">
    <div class="driver-name">${this.escapeHtml(summary.clientName ?? 'Pilote')}</div>
    <div class="driver-meta">${this.escapeHtml(summary.carAcId ?? '-')} · ${this.escapeHtml(trackDisplay)}</div>
  </div>
  <div class="summary">
    <div class="tile">
      <div class="label">Circuit</div>
      <div class="value">${this.escapeHtml(trackDisplay)}</div>
    </div>
    <div class="tile">
      <div class="label">Voiture</div>
      <div class="value">${this.escapeHtml(summary.carAcId ?? '-')}</div>
    </div>
    <div class="tile best-lap">
      <div class="label">Meilleur tour</div>
      <div class="value">${bestLap}</div>
    </div>
  </div>
  ${leaderboard}
  <footer>SimRacing Manager</footer>
</body>
</html>`;

    writeFileSync(htmlPath, html, 'utf-8');
    this.resultsHtmlPath = htmlPath;
  }

  private renderLeaderboard(result: RaceResultData): string {
    const entries = getLeaderboard(result);
    if (entries.length === 0) return '';
    const rows = entries
      .map((entry) => {
        const posClass =
          entry.position === 1
            ? 'p1'
            : entry.position === 2
              ? 'p2'
              : entry.position === 3
                ? 'p3'
                : '';
        const badgeClass = posClass || 'other';
        return `<tr class="${posClass}">
      <td class="pos"><span class="pos-badge ${badgeClass}">P${entry.position}</span></td>
      <td>${this.escapeHtml(entry.name)}</td>
      <td>${this.escapeHtml(entry.car)}</td>
      <td class="num">${entry.laps}</td>
      <td class="time">${formatLapTime(entry.bestLapMs)}</td>
    </tr>`;
      })
      .join('');
    return `<div class="leaderboard">
  <table>
    <thead>
      <tr>
        <th class="num">Pos</th>
        <th>Pilote</th>
        <th>Voiture</th>
        <th class="num">Tours</th>
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

    // During a launched session (`agent:status` = in_game), blanking must stay
    // until telemetry confirms the car has been ready for 5s: the shared
    // memory alone maps too early, while AC is still on its loading screen.
    // Outside a session, keep the legacy behavior (shared memory loaded, or
    // AC running with a confirmed ready state).
    const shouldHide = this.podInGame
      ? this.readyConfirmed
      : this.acLoaded || (this.acRunning && this.readyConfirmed);

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
