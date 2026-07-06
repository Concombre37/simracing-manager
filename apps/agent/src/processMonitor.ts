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
   * Existence-based on purpose, matching RS Launcher and what blanking's
   * hide timer expects: AC's own loading screens routinely leave the
   * process flagged "Not Responding" by Windows for a while (its message
   * pump can stall during a heavy load/transition even though its physics
   * thread is very much alive and already producing telemetry) — excluding
   * "not responding" from "running" here previously delayed or blocked
   * blanking's reveal during completely normal launches. Responsiveness is
   * still tracked, just for the independent cleanup below, not for this
   * return value.
   */
  async isAcRunning(): Promise<boolean> {
    const state = await this.checkAcProcessState();
    void this.trackForCleanup(state);
    return state !== 'absent';
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

  /**
   * Pure background hygiene — does not affect isAcRunning()'s return value.
   * Only a process unresponsive for NOT_RESPONDING_KILL_THRESHOLD_MS
   * straight (5 minutes — well beyond any legitimate loading screen) is
   * assumed to be a genuine zombie and force-killed, so a crashed/hung
   * leftover from an earlier session doesn't sit there forever fooling the
   * next agent startup into thinking AC is already running.
   */
  private async trackForCleanup(state: AcProcessState): Promise<void> {
    if (state !== 'not-responding') {
      this.notRespondingSince = null;
      return;
    }

    const now = Date.now();
    if (this.notRespondingSince === null) {
      this.notRespondingSince = now;
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
