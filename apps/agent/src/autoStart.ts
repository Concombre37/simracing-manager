import { spawn } from 'child_process';
import { Logger } from 'pino';
import path from 'path';
import fs from 'fs/promises';
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

  const exeDir = path.dirname(process.execPath);
  const launcherPath = path.join(exeDir, 'start-agent.vbs');
  await ensureLauncherExists(exeDir, launcherPath, logger);

  logger.info({ launcherPath }, 'Registering agent for Windows auto-start');

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        'reg',
        ['add', RUN_KEY, '/v', VALUE_NAME, '/t', 'REG_SZ', '/d', launcherPath, '/f'],
        { windowsHide: true },
      );
      proc.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`reg add exited with code ${code}`));
      });
      proc.on('error', reject);
    });
    logger.info('Windows auto-start registry entry added/verified');
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Failed to register agent for Windows auto-start',
    );
  }
}

async function ensureLauncherExists(
  exeDir: string,
  launcherPath: string,
  logger: Logger,
): Promise<void> {
  try {
    await fs.access(launcherPath);
    logger.debug({ launcherPath }, 'Auto-start launcher already exists');
    return;
  } catch {
    // Launcher missing, recreate it from the embedded asset.
  }

  const assetPath = path.join(__dirname, '..', 'assets', 'start-agent.vbs');
  try {
    const content = await fs.readFile(assetPath, 'utf-8');
    await fs.writeFile(launcherPath, content, 'utf-8');
    logger.info({ launcherPath }, 'Auto-start launcher extracted');
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Failed to extract auto-start launcher; falling back to executable path',
    );
  }
}
