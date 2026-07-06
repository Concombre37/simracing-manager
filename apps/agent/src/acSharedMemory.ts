import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { Logger } from 'pino';

interface SharedMemoryCheckResult {
  acpmf_physics: boolean;
  acpmf_graphics: boolean;
  acpmf_static: boolean;
  /** False if acpmf_graphics' packetId hasn't moved between two quick reads
   * — a mapping can outlive the AC process that created it (crash, a stale
   * handle held open elsewhere), so existing alone isn't proof it's alive. */
  fresh: boolean;
}

export class AcSharedMemoryChecker {
  private scriptPath: string | null = null;
  private lastResult = false;
  private checkPromise: Promise<boolean> | null = null;

  constructor(private readonly logger: Logger) {}

  async init(): Promise<void> {
    if (process.platform !== 'win32') {
      this.logger.debug('Shared memory check is Windows-only');
      return;
    }
    try {
      const src = path.join(__dirname, '..', 'assets', 'check-ac-shared-memory.ps1');
      const tmpDir = path.join(process.env.TEMP || '/tmp', 'simracing-manager');
      await fs.mkdir(tmpDir, { recursive: true });
      this.scriptPath = path.join(tmpDir, 'check-ac-shared-memory.ps1');
      const content = await fs.readFile(src, 'utf-8');
      await fs.writeFile(this.scriptPath, content, 'utf-8');
      this.logger.debug({ scriptPath: this.scriptPath }, 'Shared memory check script extracted');
    } catch (err) {
      this.logger.error({ err }, 'Failed to extract shared memory check script');
    }
  }

  async isAcLoaded(): Promise<boolean> {
    if (process.platform !== 'win32') {
      return this.lastResult;
    }

    if (this.checkPromise) {
      return this.checkPromise;
    }

    this.checkPromise = this.runCheck().finally(() => {
      this.checkPromise = null;
    });

    return this.checkPromise;
  }

  private async runCheck(): Promise<boolean> {
    if (!this.scriptPath) {
      return false;
    }

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';

      const proc = spawn(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', this.scriptPath!],
        {
          windowsHide: true,
          detached: false,
        },
      );

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('error', (err) => {
        this.logger.debug({ err }, 'Shared memory check process error');
        resolve(false);
      });

      proc.on('close', (code) => {
        if (code !== 0 || stderr) {
          this.logger.debug({ code, stderr }, 'Shared memory check failed');
          resolve(false);
          return;
        }
        try {
          const result = JSON.parse(stdout.trim()) as SharedMemoryCheckResult;
          const loaded =
            result.acpmf_physics && result.acpmf_graphics && result.acpmf_static && result.fresh;
          if (
            result.acpmf_physics &&
            result.acpmf_graphics &&
            result.acpmf_static &&
            !result.fresh
          ) {
            this.logger.warn(
              'AC shared memory is mapped but frozen (stale from a previous session) — ignoring it',
            );
          }
          this.lastResult = loaded;
          resolve(loaded);
        } catch (err) {
          this.logger.debug({ stdout, err }, 'Failed to parse shared memory check result');
          resolve(false);
        }
      });

      // Safety timeout
      setTimeout(() => {
        proc.kill('SIGKILL');
        resolve(false);
      }, 5000);
    });
  }
}
