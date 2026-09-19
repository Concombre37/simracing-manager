import { spawn, ChildProcess } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { Logger } from 'pino';

/** Small always-on-top timer shown only while a timed session is driveable. */
export class SessionTimerManager {
  private scriptPath: string | null = null;
  private process: ChildProcess | null = null;
  constructor(private readonly logger: Logger) {}
  async init(): Promise<void> {
    if (process.platform !== 'win32') return;
    const dir = path.join(process.env.TEMP || '/tmp', 'simracing-manager');
    await fs.mkdir(dir, { recursive: true });
    this.scriptPath = path.join(dir, 'session-timer.ps1');
    await fs.copyFile(path.join(__dirname, '..', 'assets', 'session-timer.ps1'), this.scriptPath);
  }
  start(durationMinutes: number | null): void {
    this.stop();
    if (process.platform !== 'win32' || !this.scriptPath || durationMinutes === null) return;
    this.process = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', this.scriptPath, '-DurationSeconds', String(Math.max(0, durationMinutes * 60))], { windowsHide: true, stdio: 'ignore' });
    this.process.unref();
    this.logger.info({ durationMinutes }, 'Session timer overlay started');
  }
  stop(): void {
    if (this.process) { this.process.kill(); this.process = null; this.logger.info('Session timer overlay stopped'); }
  }
}
