import { spawn, ChildProcess } from 'child_process';
import { Logger } from 'pino';
import path from 'path';
import fs from 'fs/promises';
import { writeFileSync } from 'fs';
import { config } from './config';
import { agentLogRingBuffer } from './logRingBuffer';

export interface TrayCallbacks {
  onToggleBlanking: () => void;
  onSyncContent: () => void;
  onCheckUpdate: () => void;
  onRestartAgent: () => void;
  onQuit: () => void;
}

export interface AgentStatusSnapshot {
  stationId: string;
  stationName: string;
  version: string;
  connected: boolean;
  acRunning: boolean;
  blankingActive: boolean;
}

const STATUS_FILE_NAME = 'console-status.json';

export class TrayManager {
  private process: ChildProcess | null = null;
  private scriptPath: string | null = null;
  private consoleScriptPath: string | null = null;
  private flagDir: string;
  private tmpDir: string;
  private watcherInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly callbacks: TrayCallbacks,
  ) {
    this.tmpDir = path.join(process.env.TEMP || '/tmp', 'simracing-manager');
    this.flagDir = path.join(this.tmpDir, 'tray');
  }

  async init(): Promise<void> {
    if (process.platform !== 'win32' || !config.TRAY_ICON) {
      this.logger.debug('Tray icon disabled');
      return;
    }

    try {
      await fs.mkdir(this.flagDir, { recursive: true });
      this.scriptPath = await this.extractAsset('tray.ps1');
      this.consoleScriptPath = await this.extractAsset('console.ps1');
      this.startWatcher();
      this.startTray();
      this.logger.info('Tray icon started');
    } catch (err) {
      this.logger.error({ err }, 'Failed to initialize tray icon');
    }
  }

  /** Called every heartbeat tick so the console window (if open) always
   * reflects current reality — same pattern blanking.ps1 uses to pick up
   * the results HTML without a process restart. No-op if the tray/console
   * feature is disabled: nothing would ever read this file. */
  updateStatus(status: AgentStatusSnapshot): void {
    if (process.platform !== 'win32' || !config.TRAY_ICON) return;
    try {
      const payload = {
        ...status,
        logs: agentLogRingBuffer.getLines(),
        updatedAt: Date.now(),
      };
      writeFileSync(path.join(this.tmpDir, STATUS_FILE_NAME), JSON.stringify(payload), 'utf-8');
    } catch (err) {
      this.logger.debug({ err }, 'Failed to write console status snapshot');
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

  private async extractAsset(fileName: string): Promise<string> {
    const src = path.join(__dirname, '..', 'assets', fileName);
    const dest = path.join(this.tmpDir, fileName);
    const content = await fs.readFile(src, 'utf-8');
    await fs.writeFile(dest, content, 'utf-8');
    return dest;
  }

  private startWatcher(): void {
    this.watcherInterval = setInterval(() => {
      void this.checkFlags();
    }, 500);
  }

  private async checkFlags(): Promise<void> {
    const flags: [string, () => void][] = [
      ['quit.flag', this.callbacks.onQuit],
      ['toggle-blanking.flag', this.callbacks.onToggleBlanking],
      ['sync-content.flag', this.callbacks.onSyncContent],
      ['check-update.flag', this.callbacks.onCheckUpdate],
      ['restart-agent.flag', this.callbacks.onRestartAgent],
    ];
    try {
      for (const [fileName, callback] of flags) {
        const flagPath = path.join(this.flagDir, fileName);
        if (await fileExists(flagPath)) {
          await fs.unlink(flagPath).catch(() => undefined);
          callback();
        }
      }
    } catch (err) {
      this.logger.debug({ err }, 'Tray flag check failed');
    }
  }

  private startTray(): void {
    if (!this.scriptPath) return;
    const args = [
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
    ];
    if (this.consoleScriptPath) {
      args.push('-ConsoleScriptPath', this.consoleScriptPath);
      args.push('-StatusJsonPath', path.join(this.tmpDir, STATUS_FILE_NAME));
    }
    this.process = spawn('powershell.exe', args, { windowsHide: true, detached: true });
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
