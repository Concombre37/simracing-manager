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
    const scriptPath = path.join(baseDir, 'update-agent.ps1');
    const finalExePath = path.join(baseDir, 'sim-center-agent-win.exe');
    const launcherPath = path.join(baseDir, 'start-agent.vbs');

    await this.downloadFile(asset.browser_download_url, zipPath);
    this.logger.info({ path: zipPath }, 'New agent archive downloaded');

    // PowerShell (Wait-Process) instead of a hand-rolled cmd.exe polling
    // loop: cmd's `if (...)` blocks parse %var% once up front, so a `set`
    // inside the same block doesn't reflect until the *next* iteration — a
    // well-known footgun that left the old wait loop effectively stuck, on
    // top of cmd.exe's console window not reliably staying hidden. Params
    // are passed as real PowerShell arguments (not interpolated into the
    // script text) to avoid any quoting/injection concerns from the paths.
    const assetScript = path.join(__dirname, '..', 'assets', 'update-agent.ps1');
    const scriptContent = await fs.readFile(assetScript, 'utf-8');
    await fs.writeFile(scriptPath, scriptContent, 'utf-8');
    this.logger.info({ path: scriptPath }, 'Update script extracted');

    spawn(
      'powershell.exe',
      [
        '-WindowStyle',
        'Hidden',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        '-AgentPid',
        String(process.pid),
        '-ZipPath',
        zipPath,
        '-BaseDir',
        baseDir,
        '-FinalExePath',
        finalExePath,
        '-LauncherPath',
        launcherPath,
      ],
      {
        cwd: baseDir,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      },
    );

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
