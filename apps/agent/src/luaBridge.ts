import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from 'pino';
import { config } from './config';

export class LuaBridge {
  private commandFile: string;
  private commandId = 0;

  constructor(private readonly logger: Logger) {
    const documentsPath =
      config.DOCUMENTS_PATH ??
      path.join(process.env.USERPROFILE ?? '', 'Documents', 'Assetto Corsa');
    const commandsDir = path.join(documentsPath, 'cfg', 'SimCenterManager');
    this.commandFile = path.join(commandsDir, 'command.txt');
    void fs.mkdir(commandsDir, { recursive: true });
  }

  async sendCommand(type: string, params: Record<string, string> = {}): Promise<void> {
    this.commandId += 1;
    const lines = [`id=${this.commandId}`, `type=${type}`];
    for (const [key, value] of Object.entries(params)) {
      lines.push(`${key}=${value}`);
    }
    await fs.writeFile(this.commandFile, lines.join('\n'), 'utf-8');
    this.logger.info({ type, commandId: this.commandId }, 'Sent Lua command');
  }

  async autoStart(): Promise<void> {
    await this.sendCommand('autoStart');
  }

  async teleportToPits(): Promise<void> {
    await this.sendCommand('teleportToPits');
  }

  async toggleIdealLine(): Promise<void> {
    await this.sendCommand('idealLine');
  }

  async toggleAutoShifter(): Promise<void> {
    await this.sendCommand('autoShifter');
  }

  async quit(): Promise<void> {
    await this.sendCommand('quit');
  }

  /** Deletes command.txt once AC has actually stopped (see AcLauncher.stop()).
   * Without this, whatever command was last written (almost always "quit",
   * written at the end of every session) stays on disk indefinitely — the
   * Lua app's own `lastCommandId` resets to nil on every fresh AC load, so
   * on the very next launch it treats that stale leftover as brand new and
   * executes it immediately, before any real command overwrites it. Agent-
   * driven launches happen to dodge this in practice (autoStart() is sent
   * right after spawning AC, long before AC's Lua environment can possibly
   * have loaded), but a session launched by any other means (Steam,
   * Content Manager, double-clicking acs.exe...) has nothing to overwrite
   * it — the stale "quit" fires the instant the Lua app initializes,
   * closing the game right as the session starts. Best-effort: a missing
   * file is already the desired end state. */
  async clearCommand(): Promise<void> {
    try {
      await fs.unlink(this.commandFile);
    } catch {
      // Already absent — nothing to do.
    }
  }

  async recenterVR(): Promise<void> {
    await this.sendCommand('recenterVR');
  }

  async joinServer(host: string, port: number, password?: string): Promise<void> {
    await this.sendCommand('joinServer', {
      host,
      port: String(port),
      ...(password && { password }),
    });
  }

  async setJoinFlag(): Promise<void> {
    const flagPath = path.join(path.dirname(this.commandFile), 'join.flag');
    await fs.writeFile(flagPath, '1', 'utf-8');
    this.logger.info('Join flag written for Lua app');
  }

  async clearJoinFlag(): Promise<void> {
    const flagPath = path.join(path.dirname(this.commandFile), 'join.flag');
    try {
      await fs.unlink(flagPath);
    } catch {
      // ignore
    }
  }

  async setClientName(name: string): Promise<void> {
    const clientFile = path.join(path.dirname(this.commandFile), 'client.txt');
    await fs.writeFile(clientFile, name, 'utf-8');
    this.logger.info({ clientName: name }, 'Client name written for Lua app');
  }

  async setSessionId(sessionId: string): Promise<void> {
    const sessionFile = path.join(path.dirname(this.commandFile), 'session.txt');
    await fs.writeFile(sessionFile, sessionId, 'utf-8');
    this.logger.info({ sessionId }, 'Session ID written for Lua app');
  }
}
