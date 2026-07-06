import { execFile } from 'child_process';
import { promisify } from 'util';
import { Logger } from 'pino';

const execFileAsync = promisify(execFile);

/** How long acs.exe must stay unresponsive before we force-kill it as
 * cleanup. Deliberately long: AC's own loading screens can legitimately make
 * the process "Not Responding" in Windows' eyes for a good while, and killing
 * a game that's genuinely still loading would be far worse than leaving a
 * real zombie process around a bit longer. */
const NOT_RESPONDING_KILL_THRESHOLD_MS = 5 * 60 * 1000;

type AcProcessState = 'running' | 'not-responding' | 'absent';

export class ProcessMonitor {
  private notRespondingSince: number | null = null;

  constructor(private readonly logger: Logger) {}

  /**
   * Verification, not just detection: a process literally named `acs.exe`
   * existing isn't enough to call AC "running" — a crashed/hung instance
   * left behind by a previous session (taskkill failing to land, a manual
   * kill that missed, etc.) still shows up in `tasklist` and would otherwise
   * fool the blanking screen into hiding itself with nothing actually on
   * screen. Windows' own "Not Responding" flag (from the process' message
   * pump) is used to tell a genuinely running game apart from a stale one.
   */
  async isAcRunning(): Promise<boolean> {
    const state = await this.checkAcProcessState();

    if (state === 'not-responding') {
      await this.handleNotResponding();
      return false;
    }

    this.notRespondingSince = null;
    return state === 'running';
  }

  private async checkAcProcessState(): Promise<AcProcessState> {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execFileAsync('tasklist', [
          '/V',
          '/FI',
          'IMAGENAME eq acs.exe',
          '/FO',
          'CSV',
          '/NH',
        ]);
        const line = stdout.trim();
        if (!line.toLowerCase().includes('acs.exe')) return 'absent';

        const fields = parseCsvLine(line);
        // "Image Name","PID","Session Name","Session#","Mem Usage","Status","User Name","CPU Time","Window Title"
        const status = (fields[5] ?? '').toLowerCase();
        return status.includes('not responding') ? 'not-responding' : 'running';
      }
      // Linux/macOS fallback for dev environments — no responsiveness concept.
      const { stdout } = await execFileAsync('pgrep', ['-x', 'acs.exe']);
      return stdout.trim().length > 0 ? 'running' : 'absent';
    } catch {
      // tasklist/pgrep return a non-zero exit code when nothing matches.
      return 'absent';
    }
  }

  private async handleNotResponding(): Promise<void> {
    const now = Date.now();
    if (this.notRespondingSince === null) {
      this.notRespondingSince = now;
      this.logger.warn('acs.exe detected but not responding — watching before cleanup');
      return;
    }

    if (now - this.notRespondingSince < NOT_RESPONDING_KILL_THRESHOLD_MS) {
      return;
    }

    this.logger.warn(
      { unresponsiveForMs: now - this.notRespondingSince },
      'acs.exe unresponsive for too long, force-killing as cleanup',
    );
    try {
      await execFileAsync('taskkill', ['/F', '/T', '/IM', 'acs.exe']);
    } catch (err) {
      this.logger.debug({ err }, 'Failed to force-kill unresponsive acs.exe');
    }
    this.notRespondingSince = null;
  }
}

/** Parses one tasklist `/FO CSV` line (comma-separated, double-quoted
 * fields, no escaping of embedded quotes in practice for this output). */
function parseCsvLine(line: string): string[] {
  const matches = line.match(/"([^"]*)"/g) ?? [];
  return matches.map((field) => field.slice(1, -1));
}
