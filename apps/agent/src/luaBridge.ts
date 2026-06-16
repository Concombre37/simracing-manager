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
}
