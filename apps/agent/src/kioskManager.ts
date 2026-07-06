import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { Logger } from 'pino';

/**
 * Enforces a kiosk-like experience while a session is running: the Windows
 * taskbar is hidden, any already-open windows (Explorer, etc.) are minimized,
 * and the game window is brought to the foreground. Everything is restored
 * once the session ends. Windows-only; no-ops elsewhere (e.g. local dev on
 * Linux) since the underlying PowerShell/Win32 calls don't apply.
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

  /** Hides the taskbar, minimizes other windows, and brings the game to the
   * foreground once its window appears. Fire-and-forget: the script polls
   * for the game window itself with its own timeout. */
  enter(gameProcessName = 'acs'): void {
    this.logger.info({ gameProcessName }, 'Entering kiosk mode');
    this.run(['-Action', 'Enter', '-GameProcessName', gameProcessName]);
  }

  /** Restores the taskbar when a session ends. */
  exit(): void {
    this.logger.info('Exiting kiosk mode');
    this.run(['-Action', 'Exit']);
  }

  private run(extraArgs: string[]): void {
    if (process.platform !== 'win32') return;
    if (!this.scriptPath) {
      this.logger.warn('Kiosk script not extracted, skipping');
      return;
    }
    const args = [
      '-NoProfile',
      '-WindowStyle',
      'Hidden',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      this.scriptPath,
      ...extraArgs,
    ];
    try {
      const proc = spawn('powershell.exe', args, {
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
}
