import { execFile } from 'child_process';
import { promisify } from 'util';
import { Logger } from 'pino';

const execFileAsync = promisify(execFile);

export class ProcessMonitor {
  constructor(private readonly logger: Logger) {}

  async isAcRunning(): Promise<boolean> {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execFileAsync('tasklist', [
          '/FI',
          'IMAGENAME eq acs.exe',
          '/FO',
          'CSV',
        ]);
        return stdout.toLowerCase().includes('acs.exe');
      }
      // Linux/macOS fallback for dev environments.
      const { stdout } = await execFileAsync('pgrep', ['-x', 'acs.exe']);
      return stdout.trim().length > 0;
    } catch (err) {
      // pgrep returns exit code 1 when no process is found.
      return false;
    }
  }
}
