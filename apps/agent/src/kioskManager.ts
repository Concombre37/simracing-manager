import { spawn } from 'child_process';
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
    this.logger.info({ gameProcessName }, 'Entering kiosk mode');
    this.run(['-Action', 'Enter', '-GameProcessName', gameProcessName]);
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
      try {
        const proc = spawn('powershell.exe', this.buildArgs(extraArgs), {
          windowsHide: true,
          stdio: 'ignore',
        });
        proc.on('error', (err) => {
          this.logger.error({ err }, 'Kiosk script failed to start');
          resolve(false);
        });
        proc.on('exit', (code) => resolve(code === 0));
      } catch (err) {
        this.logger.error({ err }, 'Failed to spawn kiosk script');
        resolve(false);
      }
    });
  }
}
