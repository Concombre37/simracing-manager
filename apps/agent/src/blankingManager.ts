import { spawn, execFileSync, ChildProcess } from 'child_process';
import fs from 'fs/promises';
import { writeFileSync, existsSync, readFileSync, unlinkSync } from 'fs';
import path from 'path';
import { Logger } from 'pino';
import { RaceResultData, getLeaderboard } from './raceResultCleaner';
import { config } from './config';

export type BlankingOverride = 'auto' | 'hide' | 'show';

/** Below this uptime, an unexpected exit is treated as a crash (the window
 * has no visible close button — the only deliberate way to close it is the
 * Escape key, which can't plausibly happen this fast right after spawning)
 * and blanking is restarted instead of revealing the game. */
const EARLY_EXIT_THRESHOLD_MS = 2000;
/** Caps the restart-on-crash loop so a genuinely broken script doesn't spin
 * forever — after this many consecutive early exits, fall back to the
 * previous behavior (switch to hide override) so the POD is at least usable. */
const MAX_EARLY_EXIT_RETRIES = 3;
/** Consecutive ~2s heartbeat polls in a row reporting "AC not detected"
 * required before blanking is allowed to reappear mid-session — protects
 * against a single transient tasklist.exe/shared-memory glitch yanking
 * blanking back over a live race. See evaluate(). */
const MISSING_STREAK_THRESHOLD_DURING_SESSION = 3;
/** Time each launching-screen background photo stays as the visible one
 * before crossfading to the next (see renderSlideshowStyles()). Kept well
 * above SLIDESHOW_CROSSFADE_MS so most of the slot is a calm, fully-settled
 * hold rather than a near-constant fade — the previous 2500ms/1200ms pair
 * left barely 1.3s of hold, which read as restless/busy rather than smooth. */
const SLIDESHOW_INTERVAL_MS = 4000;
/** Duration of the opacity crossfade between two consecutive photos —
 * carved out of the tail end of each SLIDESHOW_INTERVAL_MS slot. Long
 * enough to read as a deliberate, cinematic dissolve rather than a quick
 * blend. */
const SLIDESHOW_CROSSFADE_MS = 1800;
/** Hard cap on how long a single revealThenStop() attempt waits on
 * onGameRevealed() before treating it as "not confirmed" and moving on
 * (retry, or give up and hide anyway on the last attempt) — see
 * revealThenStop(). This is the outermost of three nested timeouts and
 * should normally never be the one that fires: kiosk.ps1's own
 * ForegroundTimeoutMs (6s) times out first, then KioskManager's own
 * force-kill watchdog (9s) if the PowerShell process itself gets wedged;
 * this 12s one only matters if something upstream of both of those hangs. */
const REVEAL_WATCHDOG_MS = 12000;
/** Safety-net ceiling on how long blanking will keep waiting on `acLoaded`
 * (AC shared memory mapped and fresh — the real "car has spawned, player is
 * in Drive" signal) once the process is confirmed running, before falling
 * back to hiding anyway. Deliberately generous (a slow track/PC can take
 * well over a minute to load) — this only exists so a genuine failure to
 * ever see shared memory (crash, unexpected AC version, ...) doesn't leave
 * blanking stuck forever; it is not meant to be the common case. See
 * evaluate(). */
const AC_LOADED_SAFETY_FALLBACK_MS = 90000;

interface SessionResultsSummary {
  clientName?: string;
  carAcId?: string;
  /** Resolved display name (custom rename if set, else the cleaned raw AC
   * name) — shown instead of carAcId when present. */
  carName?: string;
  track?: string;
  /** Same resolution as carName, for the track. */
  trackName?: string;
  trackLayout?: string;
  bestLapMs?: number;
  /** Fastest lap AC rejected as invalid (cut, etc.) — only set when it would
   * otherwise have beaten bestLapMs. */
  bestInvalidLapMs?: number;
  result?: RaceResultData;
  /** True while the leaderboard is still being read from race_out.json.
   * Shows a loading placeholder instead of an empty gap. */
  pending?: boolean;
}

interface SessionLaunchInfo {
  clientName?: string;
  carAcId?: string;
  carName?: string;
  track?: string;
  trackName?: string;
  trackLayout?: string;
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
  /** Timestamp `acRunning` last flipped false→true, `null` while not running.
   * Backs the safety-net fallback in evaluate() — see
   * AC_LOADED_SAFETY_FALLBACK_MS. */
  private acRunningSince: number | null = null;
  private acLoaded = false;
  private podInGame = false;
  private missingDuringSessionStreak = 0;
  /** True once the game has actually been confirmed on screen during the
   * *current* session (revealThenStop() succeeded) — distinguishes "the
   * game was showing and a poll suddenly says it's gone" (debounce this,
   * likely a transient glitch) from "the session just started and blanking
   * legitimately hasn't been dropped yet" (no debounce needed or wanted —
   * there's nothing to protect there). Reset on every new session. */
  private gameRevealedThisSession = false;
  private stoppingIntentionally = false;
  private consecutiveEarlyExits = 0;
  private scriptPath: string | null = null;
  private playlistPath: string | null = null;
  private mediaPaths: string[] = [];
  private launchingMediaPaths: string[] = [];
  private resultsLogoPath: string | null = null;
  private slideIntervalMs = 10000;
  private resultsHtmlPath: string | null = null;
  private launchingHtmlPath: string | null = null;
  private pidFilePath: string | null = null;
  private hideDelaySeconds = 10;
  private pendingHideTimeout: NodeJS.Timeout | null = null;
  /** Admin (hosting-only) stations never run AC themselves and must never
   * show the blanking screen at all — gated centrally in startBlanking()
   * rather than special-cased in every caller. Defaults to enabled so
   * simulator stations (the common case) aren't held up waiting to learn
   * their role over the network at startup. */
  private enabled = true;
  /** Resolves once the *current* spawn's window has actually fired WPF's
   * `Loaded` event (see BLANKING_WINDOW_READY in blanking.ps1) — a process
   * existing is not proof it's rendered/topmost yet. Callers that need the
   * screen genuinely covered before doing something irreversible (closing
   * the game) await waitUntilShown() instead of guessing with a delay. */
  private readyPromise: Promise<void> | null = null;
  private resolveReady: (() => void) | null = null;

  /** Guards revealThenStop() against overlapping attempts while a reveal
   * is in flight (production only — the async path, see revealThenStop). */
  private revealing = false;

  constructor(
    private readonly logger: Logger,
    /** Called right when blanking is *about* to hide (grace period elapsed,
     * or a manual "hide" override) — not on internal restarts. Blanking is
     * only actually torn down once this reports success (revealThenStop()),
     * i.e. the game must be confirmed in the foreground *before* blanking
     * disappears, not after — otherwise whatever was behind it (desktop, a
     * stray dialog, Content Manager...) can flash on screen first. In
     * production this returns a real Promise<boolean> (see
     * KioskManager.revealGame); the test suite's synchronous mocks (or no
     * callback at all) resolve inline with no behavior change. */
    private readonly onGameRevealed?: () => Promise<boolean> | void,
    /** Called exactly once per session, right when the game is *confirmed*
     * in the foreground and blanking is actually torn down — i.e. the
     * moment the player can really start driving. See markRevealed(). */
    private readonly onSessionRevealed?: () => void,
  ) {}

  /** Configurable from the dashboard (Paramètres), pushed over the socket. */
  setHideDelaySeconds(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    this.hideDelaySeconds = seconds;
    this.logger.info({ hideDelaySeconds: seconds }, 'Blanking hide delay updated');
  }

  async init(): Promise<void> {
    try {
      const src = path.join(__dirname, '..', 'assets', 'blanking.ps1');
      const tmpDir = path.join(process.env.TEMP || '/tmp', 'simracing-manager');
      await fs.mkdir(tmpDir, { recursive: true });
      this.scriptPath = path.join(tmpDir, 'blanking.ps1');
      const content = await fs.readFile(src, 'utf-8');
      await fs.writeFile(this.scriptPath, content, 'utf-8');
      this.playlistPath = path.join(tmpDir, 'blanking-playlist.json');
      this.pidFilePath = path.join(tmpDir, 'blanking.pid');
      this.killOrphanedProcess();
      this.logger.debug(
        { scriptPath: this.scriptPath, playlistPath: this.playlistPath },
        'Blanking script extracted',
      );
    } catch (err) {
      this.logger.error({ err }, 'Failed to extract blanking script');
    }
  }

  /**
   * Kills a blanking window left running by a previous agent process (e.g.
   * a self-update or crash that never gave stopBlanking() a chance to run —
   * child processes on Windows don't die with their parent automatically).
   * Without this, every restart piles up another overlapping window.
   */
  private killOrphanedProcess(): void {
    if (!this.pidFilePath || !existsSync(this.pidFilePath)) return;
    try {
      const pid = parseInt(readFileSync(this.pidFilePath, 'utf-8').trim(), 10);
      if (Number.isFinite(pid) && pid > 0 && process.platform === 'win32') {
        execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' });
        this.logger.info({ pid }, 'Killed orphaned blanking screen from a previous run');
      }
    } catch {
      // Process was probably already gone; nothing to clean up.
    } finally {
      try {
        unlinkSync(this.pidFilePath);
      } catch {
        // ignore
      }
    }
  }

  /** Forcibly stops blanking during agent shutdown (update, quit). */
  shutdown(): void {
    this.clearPendingHide();
    if (this.process && !this.process.killed) {
      this.stoppingIntentionally = true;
      this.process.kill('SIGKILL');
    }
    if (this.pidFilePath) {
      try {
        unlinkSync(this.pidFilePath);
      } catch {
        // ignore
      }
    }
  }

  /** Called at startup (from the cached role, before the socket even
   * connects) and again whenever the backend pushes the station's real role.
   * Disabling immediately kills any window currently up; re-enabling just
   * re-runs the normal auto/override logic. */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.logger.info(
      { enabled },
      enabled ? 'Blanking screen enabled' : 'Blanking screen disabled (admin station)',
    );
    if (!enabled) {
      this.clearPendingHide();
      this.stopBlanking();
      return;
    }
    this.evaluate();
  }

  setAcRunning(running: boolean): void {
    if (running && !this.acRunning) {
      this.acRunningSince = Date.now();
    } else if (!running) {
      this.acRunningSince = null;
    }
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

  /**
   * Mirrors the status reported to the backend via `agent:status`. Kept so a
   * new session always starts from a clean auto override state.
   */
  setPodInGame(inGame: boolean): void {
    if (this.podInGame === inGame) return;
    this.podInGame = inGame;
    if (inGame) {
      // A new session must always start from a clean auto state: a manual
      // hide/show left over from maintenance (Escape, "Masquer écran") would
      // otherwise stick forever.
      this.override = 'auto';
      // A restart is only actually needed to drop a results screen that was
      // still up (its HTML/mode is fixed at spawn time, see showResults()).
      // If blanking is already showing the plain waiting screen — the
      // common case, since this fires right as a session launches while
      // blanking has been up since the agent started — killing and
      // respawning the window here achieves nothing but a visible flicker
      // at exactly the moment the session starts.
      const wasShowingResults = this.resultsHtmlPath !== null;
      this.clearResults();
      if (wasShowingResults) {
        this.crossfadeRestart();
      }
      this.clearPendingHide();
      this.missingDuringSessionStreak = 0;
      this.gameRevealedThisSession = false;
    }
    this.logger.info({ podInGame: inGame }, 'POD in-game status changed');
    this.evaluate();
  }

  hide(): void {
    this.logger.info('Blanking override: hide');
    this.override = 'hide';
    this.clearResults();
    this.clearLaunching();
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
    // Coming back from the results screen (or an abandoned launching screen,
    // e.g. the launch command failed) must force a fresh window:
    // startBlanking() no-ops if a process is already up, so without this it
    // could stay stuck on-screen forever. But if blanking is already showing
    // the plain waiting screen, there is nothing to drop — killing and
    // respawning the window here would just be a visible flicker for no
    // visual change.
    const wasShowingCustomContent =
      this.resultsHtmlPath !== null || this.launchingHtmlPath !== null;
    this.clearResults();
    this.clearLaunching();
    if (wasShowingCustomContent) {
      this.crossfadeRestart();
    }
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
      this.crossfadeRestart();
    }
  }

  /**
   * Background images available for the "session launching" screen. One is
   * picked at random each time generateLaunchingHtml() runs (a new session
   * starting), for visual variety across launches — not applied live to a
   * screen that's already showing (same lazy-apply approach as the results
   * logo, see setResultsLogoPath()).
   */
  setLaunchingMediaPaths(paths: string[]): void {
    this.launchingMediaPaths = paths;
    this.logger.info({ count: paths.length }, 'Launching screen media paths updated');
  }

  /**
   * Single logo image for the "session results" screen — unlike the
   * launching screen's rotating photos, this is one static brand mark, so
   * no randomness/playlist here. Applied the next time generateResultsHtml()
   * runs rather than forcing a live restart of an already-visible screen.
   */
  setResultsLogoPath(path: string | null): void {
    this.resultsLogoPath = path;
    this.logger.info({ hasLogo: path !== null }, 'Results screen logo path updated');
  }

  isBlankingActive(): boolean {
    return this.process !== null && !this.process.killed;
  }

  /**
   * Waits until blanking is genuinely visible on screen — not just "a
   * process exists" (which can be true for hundreds of ms before the WPF
   * window actually renders and goes topmost, cold PowerShell/.NET startup
   * being what it is). Resolves immediately if disabled (admin station,
   * nothing will ever show) or if there's no spawn to wait on (blanking was
   * already up, e.g. the readyPromise from that earlier spawn already
   * resolved). `timeoutMs` is a safety net only, in case the ready marker
   * is ever lost — it should not normally be hit.
   */
  async waitUntilShown(timeoutMs = 4000): Promise<void> {
    if (!this.enabled || !this.readyPromise) return;
    await Promise.race([
      this.readyPromise,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  showResults(summary: SessionResultsSummary): void {
    this.logger.info(summary, 'Showing session results');
    // If we're already showing the results screen (the "pending" display,
    // then the final one a few seconds later once the leaderboard is read),
    // blanking.ps1 picks up the rewritten HTML file in place via its own
    // poll timer — no process restart, no flicker. A restart is only needed
    // to *enter* results mode from whatever was showing before.
    const alreadyShowingResults = this.override === 'show' && this.resultsHtmlPath !== null;
    this.generateResultsHtml(summary);
    this.launchingHtmlPath = null;
    this.override = 'show';
    if (!alreadyShowingResults) {
      // The plain waiting screen may already be up at this point (e.g. it
      // came back briefly while we were reading race_out.json). A plain
      // startBlanking() no-ops if a process is already running, so without
      // a forced restart the results HTML would never actually be
      // displayed — crossfadeRestart() does that restart without a gap.
      this.crossfadeRestart();
    }
    this.evaluate();
  }

  /**
   * Shows a themed "session launching" screen (driver, car, circuit) instead
   * of the plain waiting screen, from the moment a launch/join command is
   * received until the game is confirmed running and blanking's normal
   * grace-period reveal kicks in — same timing as before, just with useful
   * content on screen while the game loads instead of the generic playlist.
   *
   * Callers must invoke this *before* actually spawning the game process:
   * the one restart it causes then happens in isolation, before Content
   * Manager's/AC's own window exists to race against, instead of during the
   * launch itself (the closest thing left to the flicker previously caused
   * by an unconditional restart on setPodInGame(true), now fixed).
   */
  showLaunching(info: SessionLaunchInfo): void {
    this.logger.info(info, 'Showing session launching screen');
    const alreadyShowingLaunching = this.launchingHtmlPath !== null;
    this.generateLaunchingHtml(info);
    this.resultsHtmlPath = null;
    if (!alreadyShowingLaunching) {
      this.crossfadeRestart();
    }
    this.evaluate();
  }

  clearResults(): void {
    this.resultsHtmlPath = null;
  }

  private clearLaunching(): void {
    this.launchingHtmlPath = null;
  }

  // Shared by generateResultsHtml() and generateLaunchingHtml() so both
  // screens are visually the same "game" (dark gradients, checkers stripe,
  // driver banner, tiles) rather than two independently-drifting stylesheets.
  // Rendered inside a WPF WebBrowser control (IE11 engine): no CSS grid, no
  // clamp()/conic-gradient. Layout uses flexbox/vw units and a
  // repeating-linear-gradient checkerboard, all supported in IE11 edge mode
  // (see the FEATURE_BROWSER_EMULATION fix in blanking.ps1).
  // Design source: Claude Design project "Assetto Corsa HUD Design"
  // (Race HUD.dc.html), built natively at 5120x1440. Every pixel value below
  // is that design's own px converted to vw (px / 5120 * 100) and used as
  // the SOLE unit — unlike the previous vw-base/vh-5120-override split, this
  // works at both 1920x1080 and 5120x1440 without a second tuned copy
  // because the design is a compact centered card (not edge-to-edge text),
  // so proportional width-scaling alone looks right at either aspect ratio.
  // Hairline thicknesses (borders, dividers, accent bars ≤5px) are kept as
  // fixed px instead of scaled, same convention as the previous version.
  // Rendered inside a WPF WebBrowser control (IE11 engine): no
  // backdrop-filter, no clip-path, no CSS grid — translucency comes from
  // background opacity alone, panel corners are square, and every row/column
  // layout below uses flexbox (with `gap`, already proven to work in this
  // exact engine by the pre-existing header/summary rules) instead of grid.
  private commonStyles(screen: 'launch' | 'results', photoPaths: string[] = []): string {
    const sceneBackground =
      photoPaths.length > 0
        ? '#08080c'
        : screen === 'launch'
          ? 'radial-gradient(120% 100% at 18% 40%, #1b2740 0%, #12141f 45%, #08080c 100%)'
          : 'radial-gradient(90% 120% at 50% 45%, #172033 0%, #0f1119 50%, #07070b 100%)';

    return `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
    body {
      background: #08080c;
      color: #f4f4f7;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes panelIn {
      from { opacity: 0; transform: translateY(14px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes loadPulse { 0% { width: 15%; } 50% { width: 70%; } 100% { width: 15%; } }
    .scene {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: ${sceneBackground};
      animation: fadeIn 0.4s ease-out;
    }
    .scene-texture {
      position: absolute;
      inset: 0;
      background: repeating-linear-gradient(108deg, rgba(255,255,255,0.035) 0 2px, rgba(255,255,255,0) 2px 160px);
    }
    .scene-bg-layer {
      position: absolute;
      left: 0; right: 0; top: 0; bottom: 0;
      background-position: center;
      background-size: cover;
      background-repeat: no-repeat;
      opacity: 0;
      transition: opacity 1.2s ease-in-out;
      /* Forces this layer onto its own DirectComposition-backed surface in
       * the IE11 engine (WPF WebBrowser control) instead of the software
       * rasterizer repainting the whole viewport on every opacity tick —
       * the classic "null 3D transform" GPU-promotion hack, supported since
       * IE10. Without it, crossfading two full-screen 5120x1440 photos is
       * CPU-bound and visibly stutters on modest POD hardware. */
      transform: translateZ(0);
      -ms-transform: translateZ(0);
      backface-visibility: hidden;
    }
    .scene-bg-layer.active { opacity: 1; }
    .scene-bg-overlay {
      position: absolute;
      left: 0; right: 0; top: 0; bottom: 0;
      background: rgba(5,5,8,0.5);
    }
    ${this.renderSlideshowStyles(photoPaths.length)}
    .scene-glow-launch {
      position: absolute; left: 0; right: 0; bottom: 0; height: 10.156vw;
      background: linear-gradient(to top, rgba(0,87,255,0.14), rgba(0,0,0,0));
    }
    .scene-glow-blob {
      position: absolute; left: 8%; top: 12%; width: 27.344vw; height: 19.531vw;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(168,85,247,0.14), rgba(0,0,0,0) 70%);
    }
    .scene-ring {
      position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
      width: 29.297vw; height: 29.297vw; border-radius: 50%;
      border: 3px solid rgba(0,194,255,0.12);
      box-shadow: inset 0 0 200px rgba(0,87,255,0.10);
    }
    .scene-watermark-text {
      position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
      font-size: 10.156vw; font-weight: 700; letter-spacing: 0.2em;
      color: rgba(255,255,255,0.035);
    }
    .panel {
      position: relative;
      box-sizing: border-box;
      width: 66.406vw;
      background: rgba(5,5,8,0.64);
      border: 1px solid rgba(255,255,255,0.10);
      box-shadow: 0 0 0 1px rgba(0,120,255,0.16), 0 40px 120px rgba(0,0,0,0.55), 0 0 170px rgba(0,87,255,0.10);
      animation: panelIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.05s both;
    }
    .accent-blue { position: absolute; top: 0; left: 0; width: 4.688vw; height: 5px; background: linear-gradient(90deg,#0057ff,#00c2ff); }
    .accent-purple { position: absolute; top: 0; right: 0; width: 1.758vw; height: 5px; background: rgba(168,85,247,0.75); }
    .corner {
      position: absolute; width: 2.148vw; height: 2.148vw;
      border-color: rgba(0,194,255,0.55); border-style: solid; border-width: 0;
    }
    .corner.tl { left: 0.898vw; top: 0.898vw; border-left-width: 3px; border-top-width: 3px; }
    .corner.br { right: 0.898vw; bottom: 0.898vw; border-right-width: 3px; border-bottom-width: 3px; }
    .hud-label-row { display: flex; align-items: center; gap: 0.625vw; }
    .hud-dot { width: 0.313vw; height: 0.313vw; min-width: 6px; min-height: 6px; background: #00c2ff; box-shadow: 0 0 26px rgba(0,194,255,0.85); transform: rotate(45deg); }
    .hud-label { font-size: 0.898vw; font-weight: 600; letter-spacing: 0.42em; text-transform: uppercase; color: #00c2ff; white-space: nowrap; }
    .driver-name {
      font-weight: 700; letter-spacing: -0.015em; text-transform: uppercase; color: #f4f4f7;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .driver-name.xl { font-size: 4.180vw; line-height: 0.92; }
    .driver-name.lg { font-size: 2.266vw; line-height: 0.95; }

    /* Launch screen */
    .launch-panel { padding: 1.875vw 2.539vw 2.031vw; }
    .launch-spacer-1 { height: 0.898vw; }
    .launch-spacer-2 { height: 0.859vw; }
    .subtitle-row { display: flex; align-items: center; gap: 0.781vw; font-size: 1.094vw; font-weight: 400; letter-spacing: 0.10em; text-transform: uppercase; color: rgba(244,244,247,0.60); overflow: hidden; }
    .subtitle-row span:not(.subtitle-dot) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .subtitle-dot { flex-shrink: 0; width: 0.234vw; height: 0.234vw; min-width: 5px; min-height: 5px; border-radius: 50%; background: #a855f7; box-shadow: 0 0 18px rgba(168,85,247,0.9); }
    .load-spacer { height: 1.797vw; }
    .load-row { display: flex; align-items: center; gap: 0.859vw; }
    .load-track { flex: 1; height: 4px; background: rgba(255,255,255,0.10); }
    .load-fill { height: 100%; background: linear-gradient(90deg,#0057ff,#00c2ff); box-shadow: 0 0 22px rgba(0,194,255,0.65); animation: loadPulse 1.8s ease-in-out infinite; }
    .load-label { font-size: 0.586vw; font-weight: 600; letter-spacing: 0.34em; text-transform: uppercase; color: rgba(244,244,247,0.45); white-space: nowrap; }

    /* Results screen */
    .results-panel { padding: 1.211vw 1.953vw 1.328vw; }
    .results-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 1vw; }
    .results-head-left .hud-dot { width: 0.273vw; height: 0.273vw; min-width: 6px; min-height: 6px; }
    .results-head-left .hud-label { font-size: 0.820vw; }
    .results-head-spacer { height: 0.586vw; }
    .results-head-right { text-align: right; flex-shrink: 0; }
    .pos-label { font-size: 0.508vw; font-weight: 600; letter-spacing: 0.34em; text-transform: uppercase; color: rgba(244,244,247,0.42); white-space: nowrap; }
    .pos-spacer { height: 0.234vw; }
    .pos-value { font-size: 2.031vw; line-height: 1; font-weight: 700; color: #f4f4f7; }
    .pos-value.p1 { color: #ffd700; }
    .pos-value.p2 { color: #c0c0c0; }
    .pos-value.p3 { color: #cd7f32; }
    .divider-spacer-1 { height: 0.781vw; }
    .divider { height: 1px; background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.16) 20%, rgba(255,255,255,0.16) 80%, rgba(255,255,255,0)); }
    .divider-spacer-2 { height: 0.703vw; }
    .tiles { display: flex; flex-wrap: wrap; gap: 0.547vw; }
    .tile { flex: 1; min-width: 12vw; padding: 0.508vw 0.625vw; background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.08); border-top: 2px solid rgba(0,194,255,0.40); text-align: left; }
    .tile.accent-orange { border-top-color: rgba(255,107,53,0.65); }
    .tile-label { font-size: 0.508vw; font-weight: 600; letter-spacing: 0.30em; text-transform: uppercase; color: rgba(244,244,247,0.45); white-space: nowrap; }
    .tile-spacer { height: 0.352vw; }
    .tile-value { font-size: 0.859vw; font-weight: 600; color: #f4f4f7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tile-value.accent-orange { font-weight: 700; letter-spacing: 0.02em; color: #ff6b35; }
    .tiles-spacer { height: 0.781vw; }
    .placeholder-box { padding: 1.5vw; text-align: center; color: rgba(244,244,247,0.5); font-size: 0.9vw; text-transform: uppercase; letter-spacing: 0.15em; }
    .placeholder-box .spinner { margin: 0 auto 0.8vw; }
    .spinner { width: 1.6vw; height: 1.6vw; min-width: 24px; min-height: 24px; border-radius: 50%; border: 3px solid rgba(255,255,255,0.12); border-top-color: #00c2ff; animation: spin 0.8s linear infinite; }

    .lb-row-flex { display: flex; align-items: center; gap: 0.781vw; }
    .lb-col-pos { flex: none; width: 2.148vw; }
    .lb-col-name, .lb-col-car { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lb-col-laps { flex: none; width: 2.539vw; text-align: right; }
    .lb-col-time { flex: none; width: 6.836vw; text-align: right; }
    .lb-head { padding: 0 0.586vw 0.352vw; font-size: 0.508vw; font-weight: 600; letter-spacing: 0.30em; text-transform: uppercase; color: rgba(244,244,247,0.40); }
    .lb-divider { height: 1px; background: rgba(255,255,255,0.10); }
    .lb-row { padding: 0.352vw 0.586vw; border-left: 4px solid rgba(255,255,255,0.10); }
    .lb-row.p1 { border-left-color: #ffd700; background: linear-gradient(90deg, rgba(255,215,0,0.10), rgba(255,215,0,0)); }
    .lb-row.p2 { border-left-color: #c0c0c0; background: linear-gradient(90deg, rgba(192,192,192,0.10), rgba(192,192,192,0)); }
    .lb-row.p3 { border-left-color: #cd7f32; background: linear-gradient(90deg, rgba(205,127,50,0.10), rgba(205,127,50,0)); }
    .lb-pos { font-weight: 700; }
    .lb-row.top3 .lb-pos { font-size: 0.898vw; }
    .lb-row.other .lb-pos { font-size: 0.859vw; font-weight: 600; color: rgba(244,244,247,0.55); }
    .lb-row.p1 .lb-pos { color: #ffd700; }
    .lb-row.p2 .lb-pos { color: #c0c0c0; }
    .lb-row.p3 .lb-pos { color: #cd7f32; }
    .lb-row.top3 .lb-col-name { font-size: 0.859vw; font-weight: 600; color: #f4f4f7; }
    .lb-row.other .lb-col-name { font-size: 0.859vw; font-weight: 500; color: rgba(244,244,247,0.85); }
    .lb-row.top3 .lb-col-car, .lb-row.top3 .lb-col-laps { font-size: 0.664vw; color: rgba(244,244,247,0.62); }
    .lb-row.other .lb-col-car, .lb-row.other .lb-col-laps { font-size: 0.664vw; color: rgba(244,244,247,0.50); }
    .lb-row.top3 .lb-col-time { font-size: 0.781vw; font-weight: 600; color: #f4f4f7; }
    .lb-row.other .lb-col-time { font-size: 0.781vw; font-weight: 500; color: rgba(244,244,247,0.75); }
    `;
  }

  private generateResultsHtml(summary: SessionResultsSummary): void {
    const tmpDir = path.join(process.env.TEMP || '/tmp', 'simracing-manager');
    const htmlPath = path.join(tmpDir, 'session-results.html');
    const bestLap = formatLapTime(summary.bestLapMs ?? 0);
    const bestInvalidLap =
      summary.bestInvalidLapMs && summary.bestInvalidLapMs > 0
        ? formatLapTime(summary.bestInvalidLapMs)
        : null;
    const trackLabel = summary.trackName ?? summary.track;
    const carLabel = summary.carName ?? summary.carAcId;
    const trackDisplay = trackLabel ?? '-';

    const entries = summary.result ? getLeaderboard(summary.result) : [];
    const ownEntry = entries.find(
      (e) => e.name.trim().toLowerCase() === (summary.clientName ?? '').trim().toLowerCase(),
    );
    const posClass = ownEntry
      ? ownEntry.position === 1
        ? 'p1'
        : ownEntry.position === 2
          ? 'p2'
          : ownEntry.position === 3
            ? 'p3'
            : ''
      : '';
    const posDisplay = ownEntry ? `P${ownEntry.position}` : '-';

    const leaderboard =
      entries.length > 0
        ? this.renderLeaderboard(entries)
        : summary.pending
          ? `<div class="placeholder-box"><div class="spinner"></div>Chargement du classement…</div>`
          : `<div class="placeholder-box">Classement indisponible</div>`;

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Session terminée</title>
  <style>${this.commonStyles('results', this.resultsLogoPath ? [this.resultsLogoPath] : [])}</style>
</head>
<body>
  <div class="scene">
    ${
      this.resultsLogoPath
        ? this.renderSceneBackgroundLayers([this.resultsLogoPath])
        : `<div class="scene-texture"></div><div class="scene-ring"></div><div class="scene-watermark-text">AC</div>`
    }
    <div class="panel results-panel">
      <div class="accent-blue"></div>
      <div class="accent-purple"></div>
      <div class="corner tl"></div>
      <div class="corner br"></div>

      <div class="results-head">
        <div class="results-head-left">
          <div class="hud-label-row">
            <div class="hud-dot"></div>
            <div class="hud-label">Session terminée</div>
          </div>
          <div class="results-head-spacer"></div>
          <div class="driver-name lg">${this.escapeHtml(summary.clientName ?? 'Pilote')}</div>
        </div>
        <div class="results-head-right">
          <div class="pos-label">Position finale</div>
          <div class="pos-spacer"></div>
          <div class="pos-value ${posClass}">${posDisplay}</div>
        </div>
      </div>

      <div class="divider-spacer-1"></div>
      <div class="divider"></div>
      <div class="divider-spacer-2"></div>

      <div class="tiles">
        <div class="tile">
          <div class="tile-label">Circuit</div>
          <div class="tile-spacer"></div>
          <div class="tile-value">${this.escapeHtml(trackDisplay)}</div>
        </div>
        <div class="tile">
          <div class="tile-label">Voiture</div>
          <div class="tile-spacer"></div>
          <div class="tile-value">${this.escapeHtml(carLabel ?? '-')}</div>
        </div>
        <div class="tile accent-orange">
          <div class="tile-label">Meilleur tour</div>
          <div class="tile-spacer"></div>
          <div class="tile-value accent-orange">${bestLap}</div>
        </div>
        ${
          bestInvalidLap
            ? `<div class="tile accent-orange">
          <div class="tile-label">Meilleur tour non valide (cut)</div>
          <div class="tile-spacer"></div>
          <div class="tile-value accent-orange">${bestInvalidLap}</div>
        </div>`
            : ''
        }
      </div>

      <div class="tiles-spacer"></div>
      ${leaderboard}
    </div>
  </div>
</body>
</html>`;

    writeFileSync(htmlPath, html, 'utf-8');
    this.resultsHtmlPath = htmlPath;
  }

  private generateLaunchingHtml(info: SessionLaunchInfo): void {
    const tmpDir = path.join(process.env.TEMP || '/tmp', 'simracing-manager');
    const htmlPath = path.join(tmpDir, 'session-launching.html');
    const trackLabel = info.trackName ?? info.track;
    const carLabel = info.carName ?? info.carAcId;
    const trackDisplay = trackLabel ?? '-';
    const backgroundImages = this.shuffleLaunchingImages();

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Lancement de la session</title>
  <style>${this.commonStyles('launch', backgroundImages)}</style>
</head>
<body>
  <div class="scene">
    ${
      backgroundImages.length > 0
        ? this.renderSceneBackgroundLayers(backgroundImages)
        : `<div class="scene-texture"></div><div class="scene-glow-launch"></div><div class="scene-glow-blob"></div>`
    }
    <div class="panel launch-panel">
      <div class="accent-blue"></div>
      <div class="accent-purple"></div>
      <div class="corner tl"></div>
      <div class="corner br"></div>

      <div class="hud-label-row">
        <div class="hud-dot"></div>
        <div class="hud-label">Lancement en cours</div>
      </div>

      <div class="launch-spacer-1"></div>
      <div class="driver-name xl">${this.escapeHtml(info.clientName ?? 'Pilote')}</div>
      <div class="launch-spacer-2"></div>

      <div class="subtitle-row">
        <span>${this.escapeHtml(carLabel ?? '-')}</span>
        <span class="subtitle-dot"></span>
        <span>${this.escapeHtml(trackDisplay)}</span>
      </div>

      <div class="load-spacer"></div>
      <div class="load-row">
        <div class="load-track"><div class="load-fill"></div></div>
        <div class="load-label">Chargement</div>
      </div>
    </div>
  </div>
</body>
</html>`;

    writeFileSync(htmlPath, html, 'utf-8');
    this.launchingHtmlPath = htmlPath;
  }

  private renderLeaderboard(
    entries: { position: number; name: string; car: string; laps: number; bestLapMs: number }[],
  ): string {
    const header = `<div class="lb-row-flex lb-head">
    <div class="lb-col-pos">Pos</div>
    <div class="lb-col-name">Pilote</div>
    <div class="lb-col-car">Voiture</div>
    <div class="lb-col-laps">Tours</div>
    <div class="lb-col-time">Temps</div>
  </div>
  <div class="lb-divider"></div>`;

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
        const tierClass = posClass ? 'top3' : 'other';
        return `<div class="lb-row-flex lb-row ${posClass} ${tierClass}">
    <div class="lb-col-pos lb-pos">${entry.position}</div>
    <div class="lb-col-name">${this.escapeHtml(entry.name)}</div>
    <div class="lb-col-car">${this.escapeHtml(entry.car)}</div>
    <div class="lb-col-laps">${entry.laps}</div>
    <div class="lb-col-time">${formatLapTime(entry.bestLapMs)}</div>
  </div>`;
      })
      .join('');

    return `${header}${rows}`;
  }

  /** Shuffled once per launch so the starting image and the rotation order
   * both vary session to session, instead of always cycling the same
   * playlist in upload order. */
  private shuffleLaunchingImages(): string[] {
    const shuffled = [...this.launchingMediaPaths];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /** Stacked, absolutely-positioned background images. A single path (the
   * results logo, or a launching screen with only one image configured)
   * just gets the initial fade-in (.active, see the .scene-bg-layer
   * transition rule) and stays there. Multiple paths instead get the
   * `slideshow` class plus a staggered `animation-delay` — see
   * renderSlideshowStyles() for the actual rotation, driven entirely by a
   * CSS @keyframes loop rather than a JS timer (see that method for why). */
  private renderSceneBackgroundLayers(photoPaths: string[]): string {
    if (photoPaths.length === 0) return '';
    const rotating = photoPaths.length > 1;
    const layers = photoPaths
      .map((p, i) => {
        const cls = rotating ? 'scene-bg-layer slideshow' : 'scene-bg-layer active';
        const style = rotating
          ? `background-image:url('${this.toFileUrl(p)}');animation-delay:${i * SLIDESHOW_INTERVAL_MS}ms`
          : `background-image:url('${this.toFileUrl(p)}')`;
        return `<div class="${cls}" style="${style}"></div>`;
      })
      .join('');
    return `${layers}<div class="scene-bg-overlay"></div>`;
  }

  /** Rotates the launching screen's background photos every ~2.5s with a
   * true crossfade, purely via a CSS @keyframes loop (no JS): every
   * `.scene-bg-layer.slideshow` plays the *same* keyframes/duration, each
   * with its own `animation-delay` (0, interval, 2*interval, ...) so they
   * take turns being the one at opacity 1 — the standard delay-staggered
   * pure-CSS crossfade technique. Deliberately not implemented as a JS
   * setInterval (an earlier version was): this HTML is rendered inside a
   * WPF WebBrowser control locked to IE11 (see blanking.ps1's
   * FEATURE_BROWSER_EMULATION) where script execution has never actually
   * been exercised by anything in this codebase, unlike CSS @keyframes
   * (already used and confirmed working for the spinner/loading-bar
   * animations elsewhere in this same stylesheet) — so this avoids
   * depending on a code path with no track record in this rendering engine.
   * Omitted entirely when there's nothing to rotate between (0 or 1
   * images).
   *
   * The keyframes are symmetric (fade in AND fade out, not just fade out —
   * an earlier version only defined `1 → 1 → 0 → 0`, so an outgoing photo
   * dissolved to black on its own and the next one then popped straight to
   * full opacity with no overlap, i.e. a hard cut dressed up as a fade).
   * Each layer now fades in during the tail of the *previous* cycle
   * (`100% - fadePct` → `100%`, both ends pinned to opacity 1 so the loop
   * wraps with no jump) and fades out during the tail of its *own* slot
   * (`fadeStartPct` → `slotPct`) — exactly the same absolute window the
   * next layer in line uses for its fade-in, so the two genuinely
   * cross-dissolve into each other instead of both going through black. */
  private renderSlideshowStyles(count: number): string {
    if (count <= 1) return '';
    const totalMs = SLIDESHOW_INTERVAL_MS * count;
    const slotPct = 100 / count;
    const fadePct = (SLIDESHOW_CROSSFADE_MS / totalMs) * 100;
    const fadeOutStartPct = Math.max(0, slotPct - fadePct).toFixed(3);
    const fadeInStartPct = Math.max(slotPct, 100 - fadePct).toFixed(3);
    return `
    @keyframes scene-bg-slideshow {
      0% { opacity: 1; }
      ${fadeOutStartPct}% { opacity: 1; }
      ${slotPct.toFixed(3)}% { opacity: 0; }
      ${fadeInStartPct}% { opacity: 0; }
      100% { opacity: 1; }
    }
    .scene-bg-layer.slideshow {
      /* The base .scene-bg-layer rule above sets a "transition: opacity"
       * for the single-image (.active) case — left running here too, it
       * fights the keyframe animation for the same property in IE11
       * (the two engines disagree on which one "wins" a given frame,
       * producing exactly the kind of micro-stutter this rewrite is
       * fixing), so the slideshow variant explicitly turns it off. */
      transition: none;
      animation: scene-bg-slideshow ${totalMs}ms cubic-bezier(0.45, 0, 0.55, 1) infinite;
    }`;
  }

  private toFileUrl(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/');
    const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
    return `file://${encodeURI(withLeadingSlash)}`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private evaluate(): void {
    if (this.override === 'hide') {
      this.clearPendingHide();
      this.revealThenStop();
      return;
    }
    if (this.override === 'show') {
      this.clearPendingHide();
      this.startBlanking();
      return;
    }

    // `acRunning` (process detected) fires the instant acs.exe appears in
    // the OS process list — well before AC has actually loaded the track,
    // shown its menu, or spawned the car, which left the hide-delay
    // countdown starting (and therefore blanking dropping) long before the
    // driver was actually in Drive, exposing AC's own loading screens
    // underneath (found in production, v2.2.104). `acLoaded` (shared memory
    // mapped **and** fresh — packetId actually moving) only becomes true
    // once a session is genuinely live with the car spawned, which is the
    // real "mise en drive" moment — that's the primary signal now. `acRunning`
    // is kept only as a safety-net fallback (AC_LOADED_SAFETY_FALLBACK_MS)
    // so a genuine failure to ever see shared memory doesn't leave blanking
    // stuck on screen forever.
    const acLoadedSafetyFallback =
      this.acRunning &&
      this.acRunningSince !== null &&
      Date.now() - this.acRunningSince > AC_LOADED_SAFETY_FALLBACK_MS;
    const shouldHide = this.acLoaded || acLoadedSafetyFallback;

    if (shouldHide) {
      this.missingDuringSessionStreak = 0;
      // Give the game a configurable grace period (default 10s, set from
      // the dashboard) before actually removing blanking, so it doesn't
      // vanish the instant acs.exe appears while AC is still loading.
      if (this.isBlankingActive() && !this.pendingHideTimeout) {
        this.pendingHideTimeout = setTimeout(() => {
          this.pendingHideTimeout = null;
          this.revealThenStop();
        }, this.hideDelaySeconds * 1000);
      }
      return;
    }

    this.clearPendingHide();

    // acRunning/acLoaded are each re-polled from scratch every ~2s
    // (tasklist.exe / AC's shared memory) and can transiently glitch false
    // for a single tick with no real change in the game — a false reading
    // here must never be allowed to slam blanking back up over an actual
    // live race. Once the game has been confirmed up during this session
    // (blanking is currently down), require several consecutive misses in
    // a row before treating it as real; a genuinely closed/crashed game
    // still gets blanking back, just a few seconds later rather than on
    // the very first noisy poll. No debounce needed outside a session
    // (idle attract-mode blanking reacting instantly is exactly its job),
    // or while blanking is already up (nothing to protect there either).
    if (this.podInGame && this.gameRevealedThisSession && !this.isBlankingActive()) {
      this.missingDuringSessionStreak += 1;
      if (this.missingDuringSessionStreak < MISSING_STREAK_THRESHOLD_DURING_SESSION) {
        this.logger.warn(
          {
            streak: this.missingDuringSessionStreak,
            acRunning: this.acRunning,
            acLoaded: this.acLoaded,
          },
          'AC not detected during an active session — waiting for confirmation before re-showing blanking',
        );
        return;
      }
      this.logger.error(
        { streak: this.missingDuringSessionStreak },
        'AC still not detected after repeated checks during an active session — re-showing blanking',
      );
    }

    this.startBlanking();
  }

  private clearPendingHide(): void {
    if (this.pendingHideTimeout) {
      clearTimeout(this.pendingHideTimeout);
      this.pendingHideTimeout = null;
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
    if (!this.enabled) return;
    if (this.process && !this.process.killed) return;
    this.spawnBlankingProcess();
  }

  /**
   * Spawns a replacement blanking window *before* tearing down the one
   * currently up, instead of killing first and spawning after — so there is
   * no gap where neither window is on screen and whatever's behind it
   * (desktop, a stray dialog) can flash through for the second or so a cold
   * PowerShell/WPF startup takes. Waits for the new window's own `Loaded`
   * signal (or a timeout safety net) before killing the old one. No-ops to
   * a plain startBlanking() when nothing is currently up — there's nothing
   * to overlap with, so a gap can't happen either way.
   */
  private crossfadeRestart(): void {
    if (!this.enabled) return;
    const oldProc = this.process;
    if (!oldProc || oldProc.killed) {
      this.startBlanking();
      return;
    }
    this.spawnBlankingProcess();
    const newReady = this.readyPromise;
    void Promise.race([
      newReady ?? Promise.resolve(),
      new Promise<void>((resolve) => setTimeout(resolve, 4000).unref()),
    ]).then(() => {
      if (oldProc && !oldProc.killed) {
        oldProc.kill('SIGTERM');
        setTimeout(() => {
          if (oldProc && !oldProc.killed) oldProc.kill('SIGKILL');
        }, 2000).unref();
      }
    });
  }

  /** Unconditional spawn — the actual PowerShell/WPF process launch, shared
   * by startBlanking() (guarded, no-op if one is already up) and
   * crossfadeRestart() (deliberately spawns a second, overlapping one). */
  private spawnBlankingProcess(): void {
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
    } else if (this.launchingHtmlPath) {
      args.push('-ResultsHtmlPath', this.launchingHtmlPath);
    }

    args.push('-MonitorIndex', String(config.BLANKING_MONITOR));

    const proc = spawn('powershell.exe', args, {
      detached: false,
      windowsHide: true,
    });
    this.process = proc;
    const spawnedAt = Date.now();
    this.readyPromise = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });

    // Otherwise a PowerShell/WPF exception right after spawn (the scenario
    // the crash-restart logic below reacts to) would leave no trace at all
    // — these now also land in the persisted log file / local console.
    proc.stdout?.on('data', (chunk: Buffer) => {
      const output = chunk.toString('utf-8').trim();
      this.logger.debug({ output }, 'Blanking screen stdout');
      if (this.process === proc && output.includes('BLANKING_WINDOW_READY')) {
        this.resolveReady?.();
      }
    });
    proc.stderr?.on('data', (chunk: Buffer) => {
      this.logger.warn({ output: chunk.toString('utf-8').trim() }, 'Blanking screen stderr');
    });

    if (this.pidFilePath && proc.pid) {
      try {
        writeFileSync(this.pidFilePath, String(proc.pid), 'utf-8');
      } catch (err) {
        this.logger.warn({ err }, 'Failed to write blanking pid file');
      }
    }

    proc.on('exit', (code) => {
      // restartIfActive()/setAuto() kill the old window and spawn a
      // replacement in the same synchronous pass, but the OS only delivers
      // this 'exit' event for the *old* process later, asynchronously —
      // by then `this.process` already points at the new (legitimately
      // running) one. Without this guard, this stale event would null out
      // the reference to the still-live window: isBlankingActive() starts
      // reporting false (dashboard shows blanking "off" while it's actually
      // showing) and hide()/stopBlanking() silently no-op since they think
      // there's nothing to stop — the only way left to close it becomes
      // pressing Escape directly on the POD.
      if (this.process !== proc) {
        this.logger.debug({ code }, 'Stale blanking process exit ignored (already superseded)');
        return;
      }
      // This spawn is done for — its ready marker (if any) is never coming.
      // Unblocks any waitUntilShown() call still racing its timeout instead
      // of making it wait the full timeout for nothing.
      this.resolveReady?.();

      const upDurationMs = Date.now() - spawnedAt;
      this.process = null;
      if (this.pidFilePath) {
        try {
          unlinkSync(this.pidFilePath);
        } catch {
          // ignore
        }
      }

      if (this.stoppingIntentionally) {
        this.stoppingIntentionally = false;
        this.consecutiveEarlyExits = 0;
        this.logger.debug({ code, upDurationMs }, 'Blanking screen process exited (intentional)');
        return;
      }

      // The window has no title bar/close button (kiosk overlay) — the only
      // deliberate way to close it is the Escape key. An exit within
      // EARLY_EXIT_THRESHOLD_MS of spawning can't plausibly be that, so
      // treat it as a crash and restart instead of revealing the game:
      // otherwise a single WPF/PowerShell hiccup would permanently defeat
      // the configured grace period for the rest of the session.
      const crashedEarly = upDurationMs < EARLY_EXIT_THRESHOLD_MS;
      if (crashedEarly && this.consecutiveEarlyExits < MAX_EARLY_EXIT_RETRIES) {
        this.consecutiveEarlyExits += 1;
        this.logger.warn(
          { code, upDurationMs, attempt: this.consecutiveEarlyExits },
          'Blanking screen exited unexpectedly right after starting; restarting it instead of revealing the game',
        );
        this.startBlanking();
        return;
      }

      this.consecutiveEarlyExits = 0;
      this.logger.info(
        { code, upDurationMs },
        'Blanking screen was closed, switching to hide override',
      );
      this.override = 'hide';
    });
    proc.on('error', (err) => {
      this.logger.error({ err }, 'Blanking screen process error');
      if (this.process === proc) {
        this.process = null;
      }
    });
  }

  /** Reverses the old "hide first, reveal after" order: brings the game
   * forward (re-sweeping any window that might have appeared on top since
   * kiosk mode was entered) and only tears down blanking once that's
   * actually confirmed, retrying a few times first. Synchronous callbacks
   * (the test suite's mocks, or no callback at all) are treated as
   * confirmed immediately — identical to the pre-fix behavior — since only
   * the real, Promise-returning implementation needs the async retry path.
   * Never blocks forever: after `maxAttempts` a failed confirmation still
   * hides blanking (late beats stuck-forever). */
  private revealThenStop(attempt = 1): void {
    if (this.revealing) return;
    // Bringing the game forward — and sweeping whatever else is open out of
    // its way — only makes sense while a session is actually running or
    // loading, and only ever on a simulator station. A manual "hide"
    // override while idle (maintenance, no session) must leave whatever the
    // operator has open alone: there is no game to reveal in the first
    // place, so minimizing their windows would be pure disruption for no
    // benefit. And `!this.enabled` means an admin (hosting-only) station —
    // it never runs the AC client itself, so acRunning/acLoaded should
    // already never be true there, but this makes the exclusion explicit
    // rather than relying on that indirectly.
    if (!this.enabled || (!this.acRunning && !this.acLoaded)) {
      this.stopBlanking();
      return;
    }
    const result = this.onGameRevealed?.();
    if (!result || typeof (result as Promise<boolean>).then !== 'function') {
      this.markRevealed();
      this.stopBlanking();
      return;
    }
    this.revealing = true;
    const maxAttempts = 3;
    // onGameRevealed() (KioskManager.revealGame(), a PowerShell spawn) is
    // expected to always settle on its own — but if it ever doesn't (a
    // wedged child process that never fires 'exit'/'error', e.g. stuck
    // behind a dialog), `this.revealing` would stay true forever and this
    // whole guard-checked method — the ONLY path that ever removes blanking
    // — would permanently no-op from then on, even for future sessions.
    // REVEAL_WATCHDOG_MS caps that: whichever settles first wins, so a wedged
    // confirmation still counts as "not confirmed" instead of hanging the
    // agent's blanking logic forever.
    void Promise.race([
      result as Promise<boolean>,
      new Promise<boolean>((resolve) =>
        setTimeout(() => resolve(false), REVEAL_WATCHDOG_MS).unref(),
      ),
    ]).then((confirmed) => {
      this.revealing = false;
      if (confirmed || attempt >= maxAttempts) {
        if (confirmed) {
          this.markRevealed();
        } else {
          this.logger.error(
            { attempt },
            'Giving up trying to confirm the game is in the foreground; hiding blanking anyway',
          );
        }
        this.stopBlanking();
        return;
      }
      this.logger.warn({ attempt }, 'Game window not confirmed in foreground yet, retrying');
      this.revealThenStop(attempt + 1);
    });
  }

  /** Marks the game as confirmed revealed for this session (idempotent —
   * only fires onSessionRevealed the first time per session, since it
   * resets to false in setPodInGame(true) at the start of the next one). */
  private markRevealed(): void {
    if (this.gameRevealedThisSession) return;
    this.gameRevealedThisSession = true;
    this.onSessionRevealed?.();
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
