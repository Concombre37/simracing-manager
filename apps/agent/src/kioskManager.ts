import { ChildProcess, spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { Logger } from 'pino';

/**
 * Enforces a kiosk-like experience while a session is running: the Windows
 * taskbar is hidden, any already-open windows (Explorer, etc.) are minimized,
 * and the game window is brought to the foreground (on request, once
 * blanking is done covering it). Everything is restored once the session
 * ends. Windows-only; no-ops elsewhere (e.g. local dev on Linux) since the
 * underlying PowerShell/Win32 calls don't apply.
 */
export class KioskManager {
  private scriptPath: string | null = null;
  private explorerGuard: ChildProcess | null = null;
  private guardRestartTimer: NodeJS.Timeout | null = null;
  private guardWanted = false;
  private refreshTimer: NodeJS.Timeout | null = null;
  private sessionActive = false;
  private spectatorActive = false;

  constructor(private readonly logger: Logger) {}

  async init(): Promise<void> {
    if (process.platform !== 'win32') return;
    try {
      const src = path.join(__dirname, '..', 'assets', 'kiosk.ps1');
      const tmpDir = path.join(process.env.TEMP || '/tmp', 'simracing-manager');
      await fs.mkdir(tmpDir, { recursive: true });
      this.scriptPath = path.join(tmpDir, 'kiosk.ps1');
      const content = await fs.readFile(src, 'utf-8');
      await fs.writeFile(this.scriptPath, content, 'utf-8');
    } catch (err) {
      this.logger.error({ err }, 'Failed to extract kiosk script');
    }
  }

  /** Hides the taskbar and minimizes other windows. Does not touch the
   * game's foreground state — call revealGame() for that once blanking
   * actually hides, otherwise the game would visually cover the blanking
   * screen well before its grace period elapses. Fire-and-forget. */
  enter(gameProcessName = 'acs'): void {
    this.sessionActive = true;
    this.logger.info({ gameProcessName }, 'Entering kiosk mode');
    this.run([
      '-Action',
      'EnterWithoutExplorer',
      '-GameProcessName',
      gameProcessName,
    ]);
    this.startExplorerGuard();

    // Windows occasionally restores the shell taskbar when Content Manager,
    // AC or a driver dialog changes the foreground window.  Keep the kiosk
    // state alive for the whole session instead of relying on a one-shot hide.
    this.startRefresh();
  }

  /** Keep the Windows taskbar hidden while the spectator wall is displayed. */
  setSpectatorMode(enabled: boolean): void {
    if (this.spectatorActive === enabled) return;
    this.spectatorActive = enabled;
    if (enabled) {
      this.startExplorerGuard();
      this.startRefresh();
    } else if (!this.sessionActive) {
      this.stopExplorerGuard();
      this.restoreTaskbar();
    }
  }

  /** Re-sweeps stray windows and brings the game window to the foreground,
   * resolving only once that's actually confirmed (not just "asked for") —
   * see BlankingManager.revealThenStop(), which must not remove blanking
   * until this resolves true. Awaited, unlike enter()/exit(): the caller
   * needs to know whether it actually worked before treating the game as
   * genuinely on top. */
  revealGame(gameProcessName = 'acs'): Promise<boolean> {
    this.logger.info({ gameProcessName }, 'Bringing game window to foreground');
    return this.runAwaited(['-Action', 'Foreground', '-GameProcessName', gameProcessName]);
  }

  /** Restores the taskbar when a session ends. */
  exit(): void {
    this.logger.info('Exiting kiosk mode');
    this.sessionActive = false;
    if (this.spectatorActive) {
      this.run(['-Action', 'Refresh']);
      return;
    }
    this.stopExplorerGuard();
    this.restoreTaskbar();
  }

  private startExplorerGuard(): void {
    if (process.platform !== 'win32' || !this.scriptPath) return;
    this.guardWanted = true;
    if (this.explorerGuard || this.guardRestartTimer) return;

    const guard = spawn('powershell.exe', this.buildArgs([
      '-Action', 'ExplorerGuard', '-OwnerPid', String(process.pid),
    ]), { windowsHide: true, stdio: 'ignore' });
    this.explorerGuard = guard;
    guard.on('error', (err) => this.logger.error({ err }, 'Explorer guard failed to start'));
    guard.on('close', (code) => {
      if (this.explorerGuard !== guard) return;
      this.explorerGuard = null;
      if (!this.guardWanted) return;
      this.logger.warn({ code }, 'Explorer guard exited; restarting');
      this.guardRestartTimer = setTimeout(() => {
        this.guardRestartTimer = null;
        this.startExplorerGuard();
      }, 1000);
      this.guardRestartTimer.unref();
    });
  }

  private stopExplorerGuard(): void {
    this.guardWanted = false;
    if (this.guardRestartTimer) clearTimeout(this.guardRestartTimer);
    this.guardRestartTimer = null;
    this.explorerGuard?.kill();
    this.explorerGuard = null;
  }

  private startRefresh(): void {
    if (this.refreshTimer) return;
    this.refreshTimer = setInterval(() => this.run(['-Action', 'Refresh']), 1500);
    this.refreshTimer.unref();
  }

  private restoreTaskbar(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.run(['-Action', 'Exit']);
  }

  private buildArgs(extraArgs: string[]): string[] {
    return [
      '-NoProfile',
      '-WindowStyle',
      'Hidden',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      this.scriptPath as string,
      ...extraArgs,
    ];
  }

  /** Fire-and-forget spawn, for actions nothing downstream needs to block on. */
  private run(extraArgs: string[]): void {
    if (process.platform !== 'win32') return;
    if (!this.scriptPath) {
      this.logger.warn('Kiosk script not extracted, skipping');
      return;
    }
    try {
      const proc = spawn('powershell.exe', this.buildArgs(extraArgs), {
        detached: true,
        windowsHide: true,
        stdio: 'ignore',
      });
      proc.on('error', (err) => this.logger.error({ err }, 'Kiosk script failed to start'));
      proc.unref();
    } catch (err) {
      this.logger.error({ err }, 'Failed to spawn kiosk script');
    }
  }

  /** Same spawn, but the caller waits for the exit code (0 = success) instead
   * of firing and forgetting — used where the result decides whether it's
   * actually safe to do something irreversible (removing blanking). */
  private runAwaited(extraArgs: string[]): Promise<boolean> {
    if (process.platform !== 'win32') return Promise.resolve(true);
    if (!this.scriptPath) {
      this.logger.warn('Kiosk script not extracted, skipping');
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      let settled = false;
      const settle = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      try {
        const proc = spawn('powershell.exe', this.buildArgs(extraArgs), {
          windowsHide: true,
          stdio: 'ignore',
        });
        proc.on('error', (err) => {
          this.logger.error({ err }, 'Kiosk script failed to start');
          settle(false);
        });
        proc.on('exit', (code) => settle(code === 0));
        // Belt-and-suspenders: kiosk.ps1 has its own internal timeout
        // (ForegroundTimeoutMs) that should always make it exit on its own,
        // but a wedged PowerShell process (stuck behind a dialog, a hung
        // Win32 call) would otherwise leave this promise — and everything
        // waiting on it, i.e. BlankingManager.revealThenStop() — unresolved
        // indefinitely. If the script hasn't exited by itself well past its
        // own timeout, force-kill it and treat it as a failed confirmation
        // rather than hanging forever.
        setTimeout(() => {
          if (settled) return;
          this.logger.warn('Kiosk script did not exit in time, killing it');
          proc.kill('SIGKILL');
          settle(false);
        }, 9000).unref();
      } catch (err) {
        this.logger.error({ err }, 'Failed to spawn kiosk script');
        settle(false);
      }
    });
  }
}
