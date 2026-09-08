import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import { Logger } from 'pino';

/** Opens the read-only spectator wall on a Windows spectator station. */
export class SpectatorManager {
  private process: ChildProcess | null = null;
  private opened = false;

  constructor(
    private readonly logger: Logger,
    private readonly serverUrl: string,
    private readonly stationId: string,
  ) {}

  open(): void {
    if (process.platform !== 'win32' || this.opened) return;
    const browser = this.findBrowser();
    if (!browser) {
      this.logger.warn('No Chrome/Edge browser found; spectator screen was not opened');
      return;
    }
    const url = `${this.serverUrl.replace(/\/$/, '')}/spectator/screen?station=${encodeURIComponent(this.stationId)}`;
    try {
      this.opened = true;
      this.process = spawn(browser, [
        '--kiosk',
        url,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-session-crashed-bubble',
      ], {
        detached: true,
        windowsHide: true,
        stdio: 'ignore',
      });
      this.process.once('error', (err) => {
        this.logger.error({ err }, 'Failed to open spectator screen');
        this.opened = false;
        this.process = null;
      });
      this.process.unref();
      this.logger.info({ browser, url }, 'Spectator screen opened automatically');
    } catch (err) {
      this.opened = false;
      this.logger.error({ err }, 'Failed to start spectator screen');
    }
  }

  close(): void {
    if (!this.process) return;
    try {
      this.process.kill();
    } catch {
      // The browser can already have exited; there is nothing else to do.
    }
    this.process = null;
    this.opened = false;
  }

  private findBrowser(): string | null {
    const candidates = [
      'msedge.exe',
      'chrome.exe',
      process.env['PROGRAMFILES'] ? `${process.env['PROGRAMFILES']}\\Microsoft\\Edge\\Application\\msedge.exe` : '',
      process.env['PROGRAMFILES'] ? `${process.env['PROGRAMFILES']}\\Google\\Chrome\\Application\\chrome.exe` : '',
      process.env['PROGRAMFILES(X86)'] ? `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe` : '',
      process.env['LOCALAPPDATA'] ? `${process.env['LOCALAPPDATA']}\\Google\\Chrome\\Application\\chrome.exe` : '',
    ].filter(Boolean);
    return candidates.find((candidate) => candidate.endsWith('.exe') && (candidate.includes('\\') ? fs.existsSync(candidate) : true)) ?? null;
  }
}
