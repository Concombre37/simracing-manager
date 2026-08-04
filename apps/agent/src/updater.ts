import { promises as fs, createWriteStream } from 'fs';
import path from 'path';
import https from 'https';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Logger } from 'pino';
import axios from 'axios';
import { VERSION } from './version';

const execFileAsync = promisify(execFile);

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
    const finalExePath = path.join(baseDir, 'sim-center-agent-win.exe');
    const launcherPath = path.join(baseDir, 'start-agent.vbs');

    // Staged in TEMP, not next to the live .exe: writing update.zip into
    // baseDir hit a recurring EPERM on a real machine — a fixed filename
    // right beside the currently-running executable is exactly the kind of
    // path Windows Defender's real-time scanner holds a transient lock on,
    // and any such lock (or a leftover handle from a prior failed attempt)
    // then permanently blocks every future update, silently, since nothing
    // ever surfaced past the local log. A fresh, uniquely-named file in the
    // OS temp dir (same staging convention already used for blanking/kiosk
    // scripts) sidesteps both: nothing to collide with, ever.
    const tmpDir = path.join(process.env.TEMP || '/tmp', 'simracing-manager');
    await fs.mkdir(tmpDir, { recursive: true });
    await this.cleanupStaleUpdateFiles(tmpDir);
    const attemptId = Date.now();
    const zipPath = path.join(tmpDir, `update-${attemptId}.zip`);
    const scriptPath = path.join(tmpDir, `update-agent-${attemptId}.ps1`);

    await this.downloadFile(asset.browser_download_url, zipPath);
    this.logger.info({ path: zipPath }, 'New agent archive downloaded');

    // PowerShell (Wait-Process) instead of a hand-rolled cmd.exe polling
    // loop: cmd's `if (...)` blocks parse %var% once up front, so a `set`
    // inside the same block doesn't reflect until the *next* iteration — a
    // well-known footgun that left the old wait loop effectively stuck, on
    // top of cmd.exe's console window not reliably staying hidden.
    const assetScript = path.join(__dirname, '..', 'assets', 'update-agent.ps1');
    const scriptContent = await fs.readFile(assetScript, 'utf-8');
    await fs.writeFile(scriptPath, scriptContent, 'utf-8');
    this.logger.info({ path: scriptPath }, 'Update script extracted');

    const taskName = `SimRacingManagerUpdate-${attemptId}`;
    const paramsPath = path.join(tmpDir, `update-params-${attemptId}.json`);
    await fs.writeFile(
      paramsPath,
      JSON.stringify({
        agentPid: process.pid,
        zipPath,
        baseDir,
        finalExePath,
        launcherPath,
        taskName,
      }),
      'utf-8',
    );

    // A plain detached spawn() isn't reliable enough here — confirmed live:
    // the download succeeded, but the extraction/relaunch step it should
    // have led to never ran, with nothing to show for it. The most likely
    // explanation is a Windows Job Object associated with this (pkg-built)
    // process tree killing every child the instant this process exits,
    // regardless of `detached: true` (which only creates a new process
    // group — it doesn't exempt a process from a job it already belongs
    // to). A one-shot Scheduled Task sidesteps that entirely: the Task
    // Scheduler *service* launches the process, completely outside this
    // process's tree/job, so it survives no matter what happens here.
    const command = `powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File "${scriptPath}" -ParamsPath "${paramsPath}"`;
    await execFileAsync('schtasks', [
      '/create',
      '/tn',
      taskName,
      '/tr',
      command,
      '/sc',
      'once',
      '/st',
      '00:00',
      '/f',
    ]);
    await execFileAsync('schtasks', ['/run', '/tn', taskName]);

    this.logger.info({ taskName }, 'Agent update scheduled task started, exiting current process');
    // Child processes (blanking window) don't die with the agent on
    // Windows: without this, the new version's agent spawns its own
    // blanking window on top of the orphaned one from this process.
    onBeforeExit?.();
    process.exit(0);
  }

  /** Best-effort cleanup of leftover update-*.zip/.ps1 files from earlier
   * attempts before starting a new one — a per-attempt unique filename
   * already guarantees the new download never collides with an old one,
   * this just keeps the staging directory from accumulating stale files
   * across every retry indefinitely. Failures here (e.g. one of them still
   * genuinely locked) are not fatal — they simply won't be removed yet. */
  private async cleanupStaleUpdateFiles(tmpDir: string): Promise<void> {
    try {
      const entries = await fs.readdir(tmpDir);
      await Promise.all(
        entries
          .filter((name) => /^update-(agent-|params-)?\d+\.(zip|ps1|json)$/.test(name))
          .map((name) =>
            fs.unlink(path.join(tmpDir, name)).catch((err) => {
              this.logger.debug({ file: name, err }, 'Could not remove stale update file');
            }),
          ),
      );
    } catch (err) {
      this.logger.debug({ err }, 'Failed to list temp dir for stale update file cleanup');
    }
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
