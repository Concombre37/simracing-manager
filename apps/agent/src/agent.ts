import { io, Socket } from 'socket.io-client';
import { Logger } from 'pino';
import {
  AgentToServerEvents,
  ServerToAgentEvents,
  HeartbeatPayload,
  LaunchSessionPayload,
  LaunchDedicatedServerPayload,
  StationStatus,
} from '@simracing/shared';
import { config } from './config';
import { VERSION } from './version';
import { AcLauncher } from './acLauncher';
import { LuaBridge } from './luaBridge';
import { ContentSync } from './contentSync';
import { ContentScanner } from './contentScanner';
import { ServerLauncher } from './serverLauncher';
import { updateEnvValue } from './envWriter';
import { getLocalIp } from './network';
import { Updater } from './updater';

export class SimRacingAgent {
  private socket: Socket<ServerToAgentEvents, AgentToServerEvents> | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private contentInterval: NodeJS.Timeout | null = null;
  private acRunning = false;
  private cmRunning = false;
  private vrConnected = false;
  private apiKey: string | undefined = config.API_KEY;
  private isProvisioning = false;
  private acLauncher: AcLauncher;
  private luaBridge: LuaBridge;
  private contentSync: ContentSync;
  private contentScanner: ContentScanner;
  private serverLauncher: ServerLauncher;
  private updater: Updater;

  constructor(private readonly logger: Logger) {
    this.acLauncher = new AcLauncher(logger);
    this.luaBridge = new LuaBridge(logger);
    this.contentSync = new ContentSync(logger);
    this.contentScanner = new ContentScanner(logger);
    this.serverLauncher = new ServerLauncher(logger);
    this.updater = new Updater(logger);
  }

  async start(): Promise<void> {
    if (!this.apiKey) {
      await this.provision();
      return;
    }

    await this.connectWithApiKey(this.apiKey);
  }

  private async provision(): Promise<void> {
    if (this.isProvisioning) {
      this.logger.warn('Provisioning already in progress, skipping');
      return;
    }
    this.isProvisioning = true;
    this.logger.info({ stationId: config.STATION_ID }, 'Auto-provisioning agent');

    const socket = io(`${config.SERVER_URL}/agent`, {
      auth: { stationId: config.STATION_ID, stationName: config.STATION_NAME },
      transports: ['websocket'],
      reconnection: false,
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.disconnect();
          reject(new Error('Auto-provisioning timeout'));
        }, 30000);

        socket.on('connect', () => {
          this.logger.info('Connected in provisioning mode');
          socket.emit('agent:register', {
            stationId: config.STATION_ID,
            stationName: config.STATION_NAME,
            version: VERSION,
          });
        });

        socket.on('agent:provisioned', (data: { stationId: string; apiKey: string }) => {
          clearTimeout(timeout);
          this.logger.info({ stationId: data.stationId }, 'Agent provisioned');
          this.apiKey = data.apiKey;
          try {
            updateEnvValue('API_KEY', data.apiKey);
            this.logger.info('API key saved to .env');
          } catch (err) {
            this.logger.warn({ err }, 'Failed to save API key to .env');
          }
          socket.disconnect();
          void this.connectWithApiKey(data.apiKey).then(resolve).catch(reject);
        });

        socket.on('connect_error', (err) => {
          clearTimeout(timeout);
          reject(new Error(`Provisioning connection failed: ${err.message}`));
        });

        socket.on('disconnect', (reason) => {
          clearTimeout(timeout);
          if (!this.apiKey) {
            reject(new Error(`Provisioning disconnected: ${reason}`));
          }
        });
      });
    } finally {
      this.isProvisioning = false;
    }
  }

  private async connectWithApiKey(apiKey: string): Promise<void> {
    this.logger.info({ stationId: config.STATION_ID }, 'Connecting to backend');

    this.socket = io(`${config.SERVER_URL}/agent`, {
      auth: { token: apiKey },
      transports: ['websocket'],
      reconnection: false,
    });

    this.socket.on('connect', () => {
      this.logger.info(
        { stationId: config.STATION_ID, socketId: this.socket?.id },
        'Connected to backend',
      );
      this.startHeartbeat();
      void this.sendContent();
      this.startContentSync();
    });

    this.socket.on('connect_error', (err) => {
      const message = err.message ?? String(err);
      this.logger.error({ message }, 'Connection error');
      if (this.isApiKeyError(message)) {
        void this.handleInvalidApiKey();
      }
    });

    (this.socket as any).on('error', (err: Error | string) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ message }, 'Socket error');
      if (this.isApiKeyError(message)) {
        void this.handleInvalidApiKey();
      }
    });

    this.socket.on('disconnect', (reason) => {
      this.logger.warn({ reason }, 'Disconnected from backend');
      this.stopHeartbeat();
      this.stopContentSync();
      // Reconnect using the same API key after a short delay unless the key was invalidated.
      if (this.apiKey && reason !== 'io client disconnect') {
        setTimeout(() => {
          if (this.apiKey) {
            void this.connectWithApiKey(this.apiKey);
          }
        }, 5000);
      }
    });

    this.socket.on('agent:unauthorized', (payload) => {
      this.logger.warn({ reason: payload.reason }, 'Received unauthorized from backend');
      void this.handleInvalidApiKey();
    });

    this.socket.on('session:launch', (payload) => this.handleLaunch(payload));
    this.socket.on('session:stop', () => this.handleStop());
    this.socket.on('ac:idealLine', () => this.handleIdealLine());
    this.socket.on('ac:autoShifter', () => this.handleAutoShifter());
    this.socket.on('ac:teleportToPits', () => this.handleTeleportToPits());
    this.socket.on('vr:recenter', () => this.handleRecenter());
    this.socket.on('system:update', () => this.handleUpdate());
    this.socket.on('server:join', (payload) => this.handleJoinServer(payload));
    this.socket.on('server:launch', (payload) => this.handleLaunchDedicatedServer(payload));
    this.socket.on('server:stop', (payload) => this.handleStopDedicatedServer(payload));
    this.socket.on('content:sync', () => this.handleContentSync());
  }

  private isApiKeyError(message: string): boolean {
    return message.includes('Invalid agent API key') || message.includes('Missing agent API key');
  }

  private async handleInvalidApiKey(): Promise<void> {
    if (this.isProvisioning) {
      this.logger.warn('Already re-provisioning after invalid API key, skipping');
      return;
    }
    this.logger.warn(
      'API key is invalid or missing on server, clearing local key and re-provisioning',
    );
    this.apiKey = undefined;
    try {
      updateEnvValue('API_KEY', '');
    } catch (e) {
      this.logger.warn(
        { error: e instanceof Error ? e.message : String(e) },
        'Failed to clear API_KEY from .env',
      );
    }
    this.socket?.disconnect();
    this.socket = null;
    try {
      await this.provision();
    } finally {
      this.isProvisioning = false;
    }
  }

  async stop(): Promise<void> {
    this.stopHeartbeat();
    this.stopContentSync();
    await this.acLauncher.stop();
    this.socket?.disconnect();
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const payload: HeartbeatPayload = {
        stationId: config.STATION_ID,
        stationName: config.STATION_NAME,
        version: VERSION,
        localIp: getLocalIp(),
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

  private startContentSync(): void {
    this.contentInterval = setInterval(() => {
      void this.sendContent();
    }, 60000);
  }

  private stopContentSync(): void {
    if (this.contentInterval) {
      clearInterval(this.contentInterval);
      this.contentInterval = null;
    }
  }

  private async sendContent(): Promise<void> {
    try {
      const content = await this.contentScanner.scan();
      this.socket?.emit('agent:content', {
        stationId: config.STATION_ID,
        content: content as unknown as Record<string, unknown>,
      });
    } catch (err) {
      this.logger.error({ err }, 'Failed to send content');
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

  private async handleIdealLine(): Promise<void> {
    this.logger.info('Received ideal line command');
    await this.luaBridge.toggleIdealLine();
  }

  private async handleAutoShifter(): Promise<void> {
    this.logger.info('Received auto shifter command');
    await this.luaBridge.toggleAutoShifter();
  }

  private async handleTeleportToPits(): Promise<void> {
    this.logger.info('Received teleport to pits command');
    await this.luaBridge.teleportToPits();
  }

  private async handleUpdate(): Promise<void> {
    this.logger.info('Received update command');
    try {
      await this.updater.update();
    } catch (err) {
      this.logger.error({ err }, 'Agent update failed');
    }
  }

  private async handleRecenter(): Promise<void> {
    this.logger.info('Received VR recenter command');
    await this.luaBridge.recenterVR();
  }

  private async handleContentSync(): Promise<void> {
    this.logger.info('Received content sync command');
    try {
      await this.contentSync.sync();
    } catch (err) {
      this.logger.error({ err }, 'Content sync failed');
    }
  }

  private async handleJoinServer(payload: {
    host: string;
    port: number;
    httpPort: number;
    password?: string;
    carAcId: string;
    track: string;
    trackLayout?: string;
    serverName?: string;
  }): Promise<void> {
    this.logger.info(payload, 'Received join server command');
    try {
      await this.acLauncher.joinServer(payload);
      this.logger.info('Join server command completed');
    } catch (err) {
      this.logger.error({ err }, 'Failed to execute join server command');
    }
  }

  private async handleLaunchDedicatedServer(payload: LaunchDedicatedServerPayload): Promise<void> {
    this.logger.info({ serverId: payload.serverId }, 'Received dedicated server launch command');
    try {
      const info = await this.serverLauncher.launch(payload);
      this.socket?.emit('server:started', {
        serverId: payload.serverId,
        serverDir: info.serverDir,
        udpPort: info.udpPort,
        tcpPort: info.tcpPort,
        httpPort: info.httpPort,
      });
    } catch (err) {
      this.logger.error({ err }, 'Failed to launch dedicated server');
      this.socket?.emit('server:stopped', {
        serverId: payload.serverId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async handleStopDedicatedServer(payload: { serverId: string }): Promise<void> {
    this.logger.info({ serverId: payload.serverId }, 'Received dedicated server stop command');
    await this.serverLauncher.stop(payload.serverId);
    this.socket?.emit('server:stopped', { serverId: payload.serverId });
  }
}
