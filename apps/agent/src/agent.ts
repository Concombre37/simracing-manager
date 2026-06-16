import { io, Socket } from 'socket.io-client';
import { Logger } from 'pino';
import {
  AgentToServerEvents,
  ServerToAgentEvents,
  HeartbeatPayload,
  LaunchSessionPayload,
  StationStatus,
} from '@simracing/shared';
import { config } from './config';
import { AcLauncher } from './acLauncher';
import { LuaBridge } from './luaBridge';
import { ContentSync } from './contentSync';

export class SimRacingAgent {
  private socket: Socket<ServerToAgentEvents, AgentToServerEvents> | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private acRunning = false;
  private cmRunning = false;
  private vrConnected = false;
  private acLauncher: AcLauncher;
  private luaBridge: LuaBridge;
  private contentSync: ContentSync;

  constructor(private readonly logger: Logger) {
    this.acLauncher = new AcLauncher(logger);
    this.luaBridge = new LuaBridge(logger);
    this.contentSync = new ContentSync(logger);
  }

  async start(): Promise<void> {
    this.logger.info({ stationId: config.STATION_ID }, 'Connecting to backend');

    this.socket = io(`${config.SERVER_URL}/agent`, {
      auth: { token: config.API_KEY },
      transports: ['websocket'],
      reconnection: true,
    });

    this.socket.on('connect', () => {
      this.logger.info('Connected to backend');
      this.startHeartbeat();
    });

    this.socket.on('disconnect', (reason) => {
      this.logger.warn({ reason }, 'Disconnected from backend');
      this.stopHeartbeat();
    });

    this.socket.on('session:launch', (payload) => this.handleLaunch(payload));
    this.socket.on('session:stop', () => this.handleStop());
    this.socket.on('system:update', () => this.handleUpdate());
    this.socket.on('vr:recenter', () => this.handleRecenter());
    this.socket.on('content:sync', () => this.handleContentSync());
  }

  async stop(): Promise<void> {
    this.stopHeartbeat();
    await this.acLauncher.stop();
    this.socket?.disconnect();
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const payload: HeartbeatPayload = {
        stationId: config.STATION_ID,
        stationName: config.STATION_NAME,
        version: '2.0.0',
        localIp: null,
        acRunning: this.acRunning,
        cmRunning: this.cmRunning,
        vrConnected: this.vrConnected,
        timestamp: Date.now(),
      };
      this.socket?.emit('agent:heartbeat', payload);
    }, 2000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private async handleLaunch(payload: LaunchSessionPayload): Promise<void> {
    this.logger.info({ sessionId: payload.sessionId }, 'Received launch command');
    try {
      await this.acLauncher.launch(payload);
      this.acRunning = true;
      await this.luaBridge.autoStart();
      this.socket?.emit('agent:status', {
        stationId: config.STATION_ID,
        status: StationStatus.IN_GAME,
      });
    } catch (err) {
      this.logger.error({ err }, 'Failed to launch Assetto Corsa');
    }
  }

  private async handleStop(): Promise<void> {
    this.logger.info('Received stop command');
    await this.luaBridge.quit();
    await this.acLauncher.stop();
    this.acRunning = false;
    this.socket?.emit('agent:status', {
      stationId: config.STATION_ID,
      status: StationStatus.ONLINE,
    });
  }

  private handleUpdate(): void {
    this.logger.info('Received update command');
  }

  private handleRecenter(): void {
    this.logger.info('Received VR recenter command');
  }

  private async handleContentSync(): Promise<void> {
    this.logger.info('Received content sync command');
    try {
      await this.contentSync.sync();
    } catch (err) {
      this.logger.error({ err }, 'Content sync failed');
    }
  }
}
