import fs from 'fs/promises';
import path from 'path';
import { Logger } from 'pino';
import { Socket } from 'socket.io-client';
import { AgentToServerEvents, ServerToAgentEvents, TelemetrySnapshot } from '@simracing/shared';
import { config } from './config';

export class TelemetryFileReader {
  private interval: NodeJS.Timeout | null = null;
  private lastMtimeMs = 0;

  constructor(
    private readonly logger: Logger,
    private readonly socket: Socket<ServerToAgentEvents, AgentToServerEvents> | null,
    private readonly onSnapshot?: (snapshot: TelemetrySnapshot) => void,
    private readonly intervalMs = 100,
  ) {}

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => void this.check(), this.intervalMs);
    this.logger.debug('Telemetry file reader started');
  }

  stop(): void {
    if (!this.interval) return;
    clearInterval(this.interval);
    this.interval = null;
    this.lastMtimeMs = 0;
    this.logger.debug('Telemetry file reader stopped');
  }

  private getFilePath(): string {
    const documentsPath =
      config.DOCUMENTS_PATH ??
      path.join(process.env.USERPROFILE ?? '', 'Documents', 'Assetto Corsa');
    return path.join(documentsPath, 'cfg', 'SimCenterManager', 'telemetry.json');
  }

  private fileFoundLogged = false;

  private async check(): Promise<void> {
    const filePath = this.getFilePath();
    try {
      const stats = await fs.stat(filePath);
      if (stats.mtimeMs <= this.lastMtimeMs) return;
      this.lastMtimeMs = stats.mtimeMs;

      const raw = await fs.readFile(filePath, 'utf-8');
      if (!raw || raw.trim().length === 0) return;

      const payload: TelemetrySnapshot = JSON.parse(raw);
      if (!payload.stationId) return;
      this.onSnapshot?.(payload);
      if (!this.socket?.connected) return;
      if (!this.fileFoundLogged) {
        this.logger.info(
          { filePath, stationId: payload.stationId },
          'Telemetry file found and forwarding',
        );
        this.fileFoundLogged = true;
      }
      this.socket.emit('agent:telemetry', payload);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        this.logger.debug({ err }, 'Telemetry file read failed');
      }
    }
  }
}
