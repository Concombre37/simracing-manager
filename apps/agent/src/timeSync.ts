import { execFile } from 'child_process';
import { promisify } from 'util';
import { Logger } from 'pino';

const execFileAsync = promisify(execFile);

/** Keep Windows pods on the same wall clock and Paris timezone. */
export async function synchronizeSystemClock(logger: Logger): Promise<void> {
  if (process.platform !== 'win32') return;

  try {
    // tzutil is safe to run repeatedly and does not require the agent to
    // know anything about the machine's current locale.
    await execFileAsync('tzutil.exe', ['/s', 'Romance Standard Time'], {
      windowsHide: true,
      timeout: 10_000,
    });
    // The Windows Time service uses the configured domain/NTP source. The
    // force flag makes a manual resync work even when the last sync was recent.
    await execFileAsync('w32tm.exe', ['/resync', '/force'], {
      windowsHide: true,
      timeout: 20_000,
    });
    logger.info('System clock synchronized with Windows Time service');
  } catch (error) {
    // A non-elevated agent may not be allowed to resync the service. Keep the
    // agent running and make the reason visible in its station log instead of
    // silently leaving pods with different clocks.
    logger.warn({ error }, 'Unable to synchronize system clock automatically');
  }
}
