import { promises as fs, createWriteStream } from 'fs';
import path from 'path';
import https from 'https';
import { spawn } from 'child_process';
import { Logger } from 'pino';
import axios from 'axios';
import { VERSION } from './version';

const REPO = 'Concombre37/simracing-manager';
const ASSET_NAME = 'sim-center-agent-win.zip';

interface GitHubRelease {
  tag_name: string;
  assets: { name: string; browser_download_url: string }[];
}

export class Updater {
  constructor(private readonly logger: Logger) {}

  async update(onBeforeExit?: () => void): Promise<void> {
    if (process.platform !== 'win32') {
      this.logger.warn('Auto-update is only supported on Windows');
      return;
    }

    this.logger.info({ currentVersion: VERSION }, 'Checking for agent update');

    const release = await this.fetchLatestRelease();
    const latestVersion = release.tag_name.replace(/^v/, '');

    if (latestVersion === VERSION) {
      this.logger.info('Agent is already up to date');
      return;
    }

    this.logger.info({ latestVersion }, 'New agent version available');

    const asset = release.assets.find((a) => a.name === ASSET_NAME);
    if (!asset) {
      throw new Error(`Asset ${ASSET_NAME} not found in release ${release.tag_name}`);
    }

    const currentExe = process.execPath;
    const baseDir = path.dirname(currentExe);
    const zipPath = path.join(baseDir, 'update.zip');
    const batPath = path.join(baseDir, 'update-agent.bat');
    const finalExePath = path.join(baseDir, 'sim-center-agent-win.exe');

    await this.downloadFile(asset.browser_download_url, zipPath);
    this.logger.info({ path: zipPath }, 'New agent archive downloaded');

    const batContent = [
      '@echo off',
      'echo Mise a jour de SimRacing Manager Agent...',
      'set /a waitTime=0',
      ':wait',
      `tasklist /FI "PID eq ${process.pid}" /FO CSV | find "${process.pid}" >nul`,
      'if %errorlevel% == 0 (',
      '  timeout /t 1 /nobreak >nul',
      '  set /a waitTime+=1',
      '  if %waitTime% GTR 30 goto force',
      '  goto wait',
      ')',
      ':force',
      `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${baseDir}' -Force"`,
      `if exist "${zipPath}" del /f "${zipPath}"`,
      `if exist "${batPath}" del /f "${batPath}"`,
      `start "" "${finalExePath}"`,
      'exit',
    ].join('\r\n');

    await fs.writeFile(batPath, batContent, 'utf-8');
    this.logger.info({ path: batPath }, 'Update batch script created');

    spawn('cmd.exe', ['/c', batPath], {
      cwd: baseDir,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });

    this.logger.info('Agent update started, exiting current process');
    // Child processes (blanking window) don't die with the agent on
    // Windows: without this, the new version's agent spawns its own
    // blanking window on top of the orphaned one from this process.
    onBeforeExit?.();
    process.exit(0);
  }

  private async fetchLatestRelease(): Promise<GitHubRelease> {
    const url = `https://api.github.com/repos/${REPO}/releases/latest`;
    const { data } = await axios.get<GitHubRelease>(url, {
      headers: { Accept: 'application/vnd.github+json' },
      timeout: 30000,
    });
    return data;
  }

  private async downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = createWriteStream(dest);
      https
        .get(url, { headers: { 'User-Agent': 'simracing-agent' } }, (response) => {
          if (response.statusCode === 302 || response.statusCode === 301) {
            const redirect = response.headers.location;
            if (!redirect) {
              reject(new Error('Redirect without location header'));
              return;
            }
            file.close();
            void fs.unlink(dest).catch(() => null);
            this.downloadFile(redirect, dest).then(resolve).catch(reject);
            return;
          }
          if (response.statusCode !== 200) {
            reject(new Error(`Download failed with status ${response.statusCode}`));
            return;
          }
          response.pipe(file);
          file.on('finish', () => {
            file.close(() => resolve());
          });
        })
        .on('error', (err) => {
          file.close();
          void fs.unlink(dest).catch(() => null);
          reject(err);
        });
      file.on('error', (err) => {
        void fs.unlink(dest).catch(() => null);
        reject(err);
      });
    });
  }
}
