import { spawn } from 'child_process';
import { Logger } from 'pino';
import { config } from './config';

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const VALUE_NAME = 'SimRacingManagerAgent';

export async function ensureAutoStart(logger: Logger): Promise<void> {
  if (process.platform !== 'win32') {
    logger.debug('Auto-start is Windows-only');
    return;
  }
  if (!config.AUTO_START) {
    logger.debug('Auto-start disabled');
    return;
  }

  const exePath = process.execPath;
  logger.info({ exePath }, 'Registering agent for Windows auto-start');

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        'reg',
        ['add', RUN_KEY, '/v', VALUE_NAME, '/t', 'REG_SZ', '/d', exePath, '/f'],
        { windowsHide: true },
      );
      proc.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`reg add exited with code ${code}`));
      });
      proc.on('error', reject);
    });
    logger.info('Windows auto-start registry entry added');
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Failed to register agent for Windows auto-start',
    );
  }
}
