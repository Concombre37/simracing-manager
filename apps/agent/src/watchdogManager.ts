import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { Logger } from 'pino';

const execFileAsync = promisify(execFile);
const PID_FILE = path.join(os.tmpdir(), 'simracing-manager', 'watchdog.pid');

/**
 * Starts and stops a small, independent PowerShell watchdog process
 * (assets/watchdog.ps1) that relaunches the agent if it disappears
 * unexpectedly — a crash, or a failed update that even Updater's own
 * relaunch-on-failure logic couldn't recover from. It has to be a
 * genuinely separate process: if the agent itself died, it can't be the
 * one noticing.
 *
 * Deliberately stopped (via its tracked PID) before any intentional exit
 * (quit, update, local restart) so it never races a legitimate shutdown —
 * the next agent startup calls ensureRunning() again, which re-spawns it
 * once the new/relaunched process is up.
 */
export class WatchdogManager {
  constructor(private readonly logger: Logger) {}

  async ensureRunning(): Promise<void> {
    if (process.platform !== 'win32') return;

    const existingPid = await this.readAlivePid();
    if (existingPid) {
      this.logger.info({ pid: existingPid }, 'Watchdog already running, not starting another');
      return;
    }

    const exePath = process.execPath;
    const baseDir = path.dirname(exePath);
    const launcherPath = path.join(baseDir, 'start-agent.vbs');
    const scriptPath = path.join(baseDir, 'watchdog.ps1');

    try {
      const assetScript = path.join(__dirname, '..', 'assets', 'watchdog.ps1');
      const scriptContent = await fs.readFile(assetScript, 'utf-8');
      await fs.writeFile(scriptPath, scriptContent, 'utf-8');

      const child = spawn(
        'powershell.exe',
        [
          '-WindowStyle',
          'Hidden',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          scriptPath,
          '-ExePath',
          exePath,
          '-LauncherPath',
          launcherPath,
        ],
        { cwd: baseDir, detached: true, stdio: 'ignore', windowsHide: true },
      );
      child.unref();

      if (child.pid) {
        await fs.mkdir(path.dirname(PID_FILE), { recursive: true });
        await fs.writeFile(PID_FILE, String(child.pid), 'utf-8');
        this.logger.info({ pid: child.pid }, 'Watchdog started');
      }
    } catch (err) {
      this.logger.warn({ err }, 'Failed to start watchdog');
    }
  }

  async stop(): Promise<void> {
    if (process.platform !== 'win32') return;
    const pid = await this.readAlivePid();
    if (!pid) return;
    try {
      await execFileAsync('taskkill', ['/F', '/PID', String(pid)]);
      this.logger.info({ pid }, 'Watchdog stopped');
    } catch (err) {
      this.logger.warn({ err, pid }, 'Failed to stop watchdog');
    } finally {
      await fs.unlink(PID_FILE).catch(() => undefined);
    }
  }

  private async readAlivePid(): Promise<number | null> {
    let pid: number;
    try {
      const content = await fs.readFile(PID_FILE, 'utf-8');
      pid = parseInt(content.trim(), 10);
      if (!pid) return null;
    } catch {
      return null;
    }
    try {
      const { stdout } = await execFileAsync('tasklist', [
        '/FI',
        `PID eq ${pid}`,
        '/FO',
        'CSV',
        '/NH',
      ]);
      if (stdout.toLowerCase().includes('powershell.exe')) {
        return pid;
      }
    } catch {
      // tasklist failing just means "can't confirm it's alive" — treat as gone.
    }
    return null;
  }
}
