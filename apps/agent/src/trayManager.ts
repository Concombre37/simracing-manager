import { spawn, ChildProcess } from 'child_process';
import { Logger } from 'pino';
import path from 'path';
import fs from 'fs/promises';
import { config } from './config';

export interface TrayCallbacks {
  onToggleBlanking: () => void;
  onQuit: () => void;
}

export class TrayManager {
  private process: ChildProcess | null = null;
  private scriptPath: string | null = null;
  private flagDir: string;
  private watcherInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly callbacks: TrayCallbacks,
  ) {
    this.flagDir = path.join(process.env.TEMP || '/tmp', 'simracing-manager', 'tray');
  }

  async init(): Promise<void> {
    if (process.platform !== 'win32' || !config.TRAY_ICON) {
      this.logger.debug('Tray icon disabled');
      return;
    }

    try {
      await fs.mkdir(this.flagDir, { recursive: true });
      const src = path.join(__dirname, '..', 'assets', 'tray.ps1');
      const tmpDir = path.join(process.env.TEMP || '/tmp', 'simracing-manager');
      this.scriptPath = path.join(tmpDir, 'tray.ps1');
      const content = await fs.readFile(src, 'utf-8');
      await fs.writeFile(this.scriptPath, content, 'utf-8');
      this.startWatcher();
      this.startTray();
      this.logger.info('Tray icon started');
    } catch (err) {
      this.logger.error({ err }, 'Failed to initialize tray icon');
    }
  }

  stop(): void {
    if (this.watcherInterval) {
      clearInterval(this.watcherInterval);
      this.watcherInterval = null;
    }
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 2000);
    }
  }

  private startWatcher(): void {
    this.watcherInterval = setInterval(() => {
      void this.checkFlags();
    }, 500);
  }

  private async checkFlags(): Promise<void> {
    const quitFlag = path.join(this.flagDir, 'quit.flag');
    const toggleFlag = path.join(this.flagDir, 'toggle-blanking.flag');
    try {
      if (await fileExists(quitFlag)) {
        await fs.unlink(quitFlag).catch(() => undefined);
        this.callbacks.onQuit();
      }
      if (await fileExists(toggleFlag)) {
        await fs.unlink(toggleFlag).catch(() => undefined);
        this.callbacks.onToggleBlanking();
      }
    } catch (err) {
      this.logger.debug({ err }, 'Tray flag check failed');
    }
  }

  private startTray(): void {
    if (!this.scriptPath) return;
    this.process = spawn(
      'powershell.exe',
      [
        '-WindowStyle',
        'Hidden',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        this.scriptPath,
        '-Version',
        config.VERSION,
        '-FlagDir',
        this.flagDir,
      ],
      { windowsHide: true, detached: true },
    );
    this.process.on('exit', (code) => {
      this.logger.debug({ code }, 'Tray PowerShell process exited');
      this.process = null;
    });
    this.process.on('error', (err) => {
      this.logger.error({ err }, 'Tray PowerShell process error');
    });
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
