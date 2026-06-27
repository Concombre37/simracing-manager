import { io, Socket } from 'socket.io-client';
import { Logger } from 'pino';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import {
  AgentToServerEvents,
  ServerToAgentEvents,
  HeartbeatPayload,
  LaunchSessionPayload,
  LaunchDedicatedServerPayload,
  StationStatus,
  LaunchMode,
  TelemetrySnapshot,
} from '@simracing/shared';
import { config } from './config';
import { VERSION } from './version';
import { AcLauncher } from './acLauncher';
import { LuaBridge } from './luaBridge';
import { ContentSync } from './contentSync';
import { ContentScanner } from './contentScanner';
import { ServerLauncher } from './serverLauncher';
import { updateEnvValue } from './envWriter';
import { getLocalIp, getMacAddress } from './network';
import { Updater } from './updater';
import { findContentManagerExe, normalizeCmPath } from './cmLocator';
import { promptForContentManagerPath, validateFilePath } from './dialogs';
import { resolveAcPath } from './acPathResolver';
import { TelemetryReceiver } from './telemetryReceiver';
import { TelemetryFileReader } from './telemetryFileReader';
import { ProcessMonitor } from './processMonitor';
import { BlankingManager } from './blankingManager';
import { AcSharedMemoryChecker } from './acSharedMemory';
import { BlankingMediaSync } from './blankingMediaSync';
import { sendWakeOnLan } from './wol';
import { runWolDiagnostics } from './wolDiagnostics';

export class SimRacingAgent {
  private socket: Socket<ServerToAgentEvents, AgentToServerEvents> | null = null;
  private heartbeatRunning = false;
  private heartbeatTimeout: NodeJS.Timeout | null = null;
  private contentInterval: NodeJS.Timeout | null = null;
  private acRunning = false;
  private acLoaded = false;
  private cmRunning = false;
  private vrConnected = false;
  private apiKey: string | undefined = config.API_KEY;
  private isProvisioning = false;
  private lastContentHash = '';
  private joinTimeout: NodeJS.Timeout | null = null;
  private currentSession: {
    sessionId: string;
    durationMinutes: number;
    startedAt: number;
    timeout: NodeJS.Timeout | null;
  } | null = null;
  private acLauncher: AcLauncher;
  private luaBridge: LuaBridge;
  private contentSync: ContentSync;
  private contentScanner: ContentScanner;
  private serverLauncher: ServerLauncher;
  private updater: Updater;
  private telemetryReceiver: TelemetryReceiver | null = null;
  private telemetryFileReader: TelemetryFileReader | null = null;
  private processMonitor: ProcessMonitor;
  private blankingManager: BlankingManager;
  private acSharedMemory: AcSharedMemoryChecker;
  private blankingMediaSync: BlankingMediaSync;

  constructor(private readonly logger: Logger) {
    this.acLauncher = new AcLauncher(logger);
    this.luaBridge = new LuaBridge(logger);
    this.contentSync = new ContentSync(logger);
    this.contentScanner = new ContentScanner(logger);
    this.serverLauncher = new ServerLauncher(logger);
    this.updater = new Updater(logger);
    this.processMonitor = new ProcessMonitor(logger);
    this.blankingManager = new BlankingManager(logger);
    this.acSharedMemory = new AcSharedMemoryChecker(logger);
    this.blankingMediaSync = new BlankingMediaSync(logger, this.blankingManager);
  }

  private onTelemetrySnapshot(snapshot: TelemetrySnapshot): void {
    this.logger.debug(
      { stationId: snapshot.stationId, speedKmh: snapshot.speedKmh },
      'Local telemetry snapshot received',
    );
    this.socket?.emit('agent:log', {
      stationId: config.STATION_ID,
      level: 'debug',
      message: `Telemetry received: speed=${Math.round(snapshot.speedKmh)} km/h, rpm=${Math.round(snapshot.rpm)}`,
      timestamp: Date.now(),
    });
    this.blankingManager.onTelemetry(snapshot);
  }

  private sendLog(
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    meta?: Record<string, unknown>,
  ): void {
    this.socket?.emit('agent:log', {
      stationId: config.STATION_ID,
      level,
      message,
      meta,
      timestamp: Date.now(),
    });
  }

  private startTelemetry(): void {
    this.stopTelemetry();
    this.telemetryReceiver = new TelemetryReceiver(this.logger, this.socket, (snapshot) =>
      this.onTelemetrySnapshot(snapshot),
    );
    this.telemetryReceiver.start();
    this.telemetryFileReader = new TelemetryFileReader(this.logger, this.socket, (snapshot) =>
      this.onTelemetrySnapshot(snapshot),
    );
    this.telemetryFileReader.start();
  }

  private stopTelemetry(): void {
    this.telemetryReceiver?.stop();
    this.telemetryReceiver = null;
    this.telemetryFileReader?.stop();
    this.telemetryFileReader = null;
  }

  async start(): Promise<void> {
    await this.resolveAcPath();
    await this.ensureContentManagerPath();
    await this.blankingManager.init();
    await this.acSharedMemory.init();
    this.blankingManager.setAuto();

    if (!this.apiKey) {
      await this.provision();
      return;
    }

    await this.connectWithApiKey(this.apiKey);
  }

  private async resolveAcPath(): Promise<void> {
    if (!config.AC_PATH) {
      const acPath = await resolveAcPath();
      if (acPath) {
        config.AC_PATH = acPath;
        try {
          updateEnvValue('AC_PATH', acPath);
          this.logger.info({ acPath }, 'Assetto Corsa path resolved and saved');
        } catch (err) {
          this.logger.warn({ err, acPath }, 'Failed to save AC_PATH to .env');
        }
      } else {
        this.logger.warn('Could not auto-resolve Assetto Corsa path');
      }
    }
    if (config.AC_PATH) {
      await this.acLauncher.ensureLuaAppInstalled();
    }
  }

  private async ensureContentManagerPath(): Promise<void> {
    if (process.platform !== 'win32') return;
    if (config.LAUNCH_MODE !== LaunchMode.CONTENT_MANAGER) return;
    if (config.CM_PATH) return;

    const found = await findContentManagerExe(this.logger);
    if (found) return;

    this.logger.warn('Content Manager path not found, prompting user');
    const userInput = promptForContentManagerPath();
    if (!userInput) {
      this.logger.warn('User cancelled Content Manager path prompt');
      return;
    }

    const normalized = normalizeCmPath(userInput);
    if (!validateFilePath(normalized)) {
      this.logger.warn({ path: normalized }, 'Provided Content Manager path does not exist');
      return;
    }

    config.CM_PATH = normalized;
    try {
      updateEnvValue('CM_PATH', normalized);
      this.logger.info({ cmPath: normalized }, 'Content Manager path saved to .env');
    } catch (err) {
      this.logger.warn({ err, cmPath: normalized }, 'Failed to save CM_PATH to .env');
    }
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
          config.API_KEY = data.apiKey;
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
      void this.runStartupDiagnostics();
      void this.writeStationConfig();
      this.startTelemetry();
      this.startHeartbeat();
      void this.sendContent();
      this.startContentSync();
      void this.blankingMediaSync.sync(config.STATION_ID, this.apiKey);
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
      this.stopTelemetry();
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
    this.socket.on('session:extend', (payload) => this.handleSessionExtend(payload));
    this.socket.on('ac:idealLine', () => this.handleIdealLine());
    this.socket.on('ac:autoShifter', () => this.handleAutoShifter());
    this.socket.on('ac:teleportToPits', () => this.handleTeleportToPits());
    this.socket.on('vr:recenter', () => this.handleRecenter());
    this.socket.on('system:update', () => this.handleUpdate());
    this.socket.on('server:join', (payload) => this.handleJoinServer(payload));
    this.socket.on('server:launch', (payload) => this.handleLaunchDedicatedServer(payload));
    this.socket.on('server:stop', (payload) => this.handleStopDedicatedServer(payload));
    this.socket.on('content:sync', () => this.handleContentSync());
    this.socket.on('blanking:hide', () => this.blankingManager.hide());
    this.socket.on('blanking:show', () => this.blankingManager.show());
    this.socket.on('blanking:mediaUpdated', () => this.handleBlankingMediaUpdated());
    this.socket.on('system:shutdown', () => this.handleShutdown());
    this.socket.on('wol:send', (payload) => this.handleWakeOnLan(payload));
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
    this.stopTelemetry();
    await this.acLauncher.stop();
    this.socket?.disconnect();
  }

  private startHeartbeat(): void {
    if (this.heartbeatRunning) return;
    this.heartbeatRunning = true;

    const beat = async (): Promise<void> => {
      if (!this.heartbeatRunning) return;
      try {
        this.acRunning = await this.processMonitor.isAcRunning();
        this.acLoaded = await this.acSharedMemory.isAcLoaded();
        this.blankingManager.setAcRunning(this.acRunning);
        this.blankingManager.setAcLoaded(this.acLoaded);
      } catch (err) {
        this.logger.debug({ err }, 'Failed to refresh AC process state');
      }
      const payload: HeartbeatPayload = {
        stationId: config.STATION_ID,
        stationName: config.STATION_NAME,
        version: VERSION,
        localIp: getLocalIp(),
        macAddress: getMacAddress(),
        acRunning: this.acRunning,
        cmRunning: this.cmRunning,
        vrConnected: this.vrConnected,
        timestamp: Date.now(),
      };
      this.socket?.emit('agent:heartbeat', payload);
      this.heartbeatTimeout = setTimeout(() => void beat(), 2000);
    };

    void beat();
  }

  private stopHeartbeat(): void {
    this.heartbeatRunning = false;
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  private async writeStationConfig(): Promise<void> {
    try {
      const documentsPath =
        config.DOCUMENTS_PATH ??
        path.join(process.env.USERPROFILE ?? '', 'Documents', 'Assetto Corsa');
      const dir = path.join(documentsPath, 'cfg', 'SimCenterManager');
      await fs.mkdir(dir, { recursive: true });
      const stationFile = path.join(dir, 'station.txt');
      await fs.writeFile(stationFile, config.STATION_ID, 'utf-8');
      this.logger.info(
        { stationFile, stationId: config.STATION_ID },
        'Wrote station config for Lua telemetry',
      );
      this.sendLog('info', 'Station config written', { stationFile, stationId: config.STATION_ID });
    } catch (err) {
      this.logger.warn({ err }, 'Failed to write station config for Lua telemetry');
      this.sendLog('warn', 'Failed to write station config', {
        error: err instanceof Error ? err.message : String(err),
      });
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
      this.logger.info('Scanning content for upload');
      const content = await this.contentScanner.scan();
      const hash = crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
      if (hash === this.lastContentHash) {
        this.logger.info('Content unchanged, skipping upload');
        return;
      }
      this.lastContentHash = hash;
      if (!this.socket?.connected) {
        this.logger.warn('Socket not connected, cannot send content');
        return;
      }
      const payload = JSON.stringify({
        stationId: config.STATION_ID,
        content: content as unknown as Record<string, unknown>,
      });
      const payloadSizeMb = Buffer.byteLength(payload, 'utf8') / (1024 * 1024);
      this.logger.info(
        {
          cars: content.cars.length,
          tracks: content.tracks.length,
          carsWithPreview: content.cars.filter((c) => c.preview).length,
          tracksWithPreview: content.tracks.filter((t) => t.preview).length,
          payloadSizeMb: payloadSizeMb.toFixed(2),
        },
        'Sending content to backend',
      );
      this.socket.emit('agent:content', {
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
    this.clearCurrentSession();
    this.socket?.emit('agent:status', {
      stationId: config.STATION_ID,
      status: StationStatus.ONLINE,
    });
  }

  private clearCurrentSession(): void {
    if (this.currentSession?.timeout) {
      clearTimeout(this.currentSession.timeout);
    }
    this.currentSession = null;
  }

  private async handleSessionExtend(payload: {
    sessionId: string;
    minutes: number;
  }): Promise<void> {
    this.logger.info(payload, 'Received session extend command');
    if (!this.currentSession || this.currentSession.sessionId !== payload.sessionId) {
      this.logger.warn('No matching active session to extend');
      return;
    }
    const newDuration = Math.max(0, this.currentSession.durationMinutes + payload.minutes);
    this.currentSession.durationMinutes = newDuration;
    this.scheduleSessionEnd();
  }

  private scheduleSessionEnd(): void {
    if (!this.currentSession) return;
    if (this.currentSession.timeout) {
      clearTimeout(this.currentSession.timeout);
      this.currentSession.timeout = null;
    }
    const elapsedMs = Date.now() - this.currentSession.startedAt;
    const totalMs = this.currentSession.durationMinutes * 60 * 1000;
    const remainingMs = Math.max(0, totalMs - elapsedMs);
    this.logger.info(
      { remainingMinutes: Math.round(remainingMs / 60000) },
      'Session end rescheduled',
    );
    if (remainingMs > 0) {
      this.currentSession.timeout = setTimeout(() => {
        void this.returnToPaddockAfterDuration();
      }, remainingMs);
    } else {
      void this.returnToPaddockAfterDuration();
    }
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

  private async handleBlankingMediaUpdated(): Promise<void> {
    this.logger.info('Received blanking media updated command');
    try {
      await this.blankingMediaSync.sync(config.STATION_ID, this.apiKey);
    } catch (err) {
      this.logger.error({ err }, 'Blanking media sync failed');
    }
  }

  private async handleShutdown(): Promise<void> {
    this.logger.info('Received shutdown command');
    try {
      if (process.platform === 'win32') {
        const { execFile } = await import('child_process');
        execFile('shutdown', ['/s', '/t', '0']);
      } else {
        this.logger.warn('Shutdown command is only implemented on Windows');
      }
    } catch (err) {
      this.logger.error({ err }, 'Failed to execute shutdown command');
    }
  }

  private async handleWakeOnLan(payload: { targetMac: string; targetIp?: string }): Promise<void> {
    this.logger.info(payload, 'Received Wake-on-LAN relay command');
    try {
      await sendWakeOnLan(payload.targetMac, this.logger, payload.targetIp);
    } catch (err) {
      this.logger.error({ err }, 'Wake-on-LAN relay failed');
    }
  }

  private async runStartupDiagnostics(): Promise<void> {
    try {
      const diagnostics = await runWolDiagnostics(this.logger);
      this.logger.info(
        {
          overallReady: diagnostics.overallReady,
          fastStartupEnabled: diagnostics.fastStartupEnabled,
          adapterCount: diagnostics.adapters.length,
        },
        'Wake-on-LAN diagnostics completed',
      );
      for (const warning of diagnostics.warnings) {
        this.logger.warn(warning);
      }
      for (const adapter of diagnostics.adapters) {
        this.logger.info({ adapter }, 'Network adapter WoL status');
      }
    } catch (err) {
      this.logger.warn({ err }, 'Failed to run Wake-on-LAN diagnostics');
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
    durationMinutes?: number;
    clientName?: string;
    difficulty?: 'EASY' | 'PRO' | 'CUSTOM';
    sessionId?: string;
  }): Promise<void> {
    this.logger.info(payload, 'Received join server command');
    this.clearCurrentSession();
    try {
      await this.acLauncher.joinServer(payload);
      this.acRunning = true;
      this.socket?.emit('agent:status', {
        stationId: config.STATION_ID,
        status: StationStatus.IN_GAME,
      });
      this.logger.info('Join server command completed');

      if (payload.sessionId && payload.durationMinutes && payload.durationMinutes > 0) {
        this.currentSession = {
          sessionId: payload.sessionId,
          durationMinutes: payload.durationMinutes,
          startedAt: Date.now(),
          timeout: null,
        };
        this.scheduleSessionEnd();
      }
    } catch (err) {
      this.logger.error({ err }, 'Failed to execute join server command');
    }
  }

  private async returnToPaddockAfterDuration(): Promise<void> {
    this.logger.info('Duration expired, returning POD to paddock');
    const sessionId = this.currentSession?.sessionId;
    this.clearCurrentSession();
    try {
      await this.acLauncher.quit();
      this.acRunning = false;
      this.blankingManager.show();
      this.socket?.emit('agent:status', {
        stationId: config.STATION_ID,
        status: StationStatus.ONLINE,
      });
      if (sessionId) {
        this.socket?.emit('agent:session:ended', { sessionId });
      }
      this.logger.info('POD returned to paddock (blanking shown)');
    } catch (err) {
      this.logger.error({ err }, 'Failed to return POD to paddock');
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
