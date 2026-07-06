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
import { AcSharedMemoryReader } from './acSharedMemoryReader';
import { RaceResultReader } from './raceResultReader';
import { cleanupRaceResult, RaceResultData } from './raceResultCleaner';
import { waitForServerReachable } from './serverReachability';
import { LapTelemetryRecorder } from './lapTelemetryRecorder';
import { TrayManager } from './trayManager';
import { ProcessMonitor } from './processMonitor';
import { BlankingManager } from './blankingManager';
import { KioskManager } from './kioskManager';
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
  private lastReportedStatus: StationStatus | null = null;
  private statusMismatchStreak = 0;
  private apiKey: string | undefined = config.API_KEY;
  private isProvisioning = false;
  private lastContentHash = '';
  private joinTimeout: NodeJS.Timeout | null = null;
  private currentSession: {
    sessionId: string;
    /** null means unlimited ("Illimité" join) — no auto-end is scheduled. */
    durationMinutes: number | null;
    startedAt: number;
    timeout: NodeJS.Timeout | null;
    clientName?: string;
    carAcId?: string;
    track?: string;
    trackLayout?: string;
    bestLapMs?: number;
    bestInvalidLapMs?: number;
    lastSeenLapCount?: number;
  } | null = null;
  private resultsTimeout: NodeJS.Timeout | null = null;
  private acLauncher: AcLauncher;
  private luaBridge: LuaBridge;
  private contentSync: ContentSync;
  private contentScanner: ContentScanner;
  private serverLauncher: ServerLauncher;
  private updater: Updater;
  private telemetryReceiver: TelemetryReceiver | null = null;
  private telemetryFileReader: TelemetryFileReader | null = null;
  private acSharedMemoryReader: AcSharedMemoryReader | null = null;
  private raceResultReader: RaceResultReader;
  private processMonitor: ProcessMonitor;
  private blankingManager: BlankingManager;
  private kioskManager: KioskManager;
  private acSharedMemory: AcSharedMemoryChecker;
  private lapTelemetryRecorder: LapTelemetryRecorder;
  private trayManager: TrayManager;
  private blankingMediaSync: BlankingMediaSync;

  constructor(private readonly logger: Logger) {
    this.acLauncher = new AcLauncher(logger);
    this.luaBridge = new LuaBridge(logger);
    this.contentSync = new ContentSync(logger);
    this.contentScanner = new ContentScanner(logger);
    this.serverLauncher = new ServerLauncher(logger);
    this.updater = new Updater(logger);
    this.processMonitor = new ProcessMonitor(logger);
    this.raceResultReader = new RaceResultReader(logger);
    this.kioskManager = new KioskManager(logger);
    this.blankingManager = new BlankingManager(logger, () => this.kioskManager.revealGame());
    this.acSharedMemory = new AcSharedMemoryChecker(logger);
    this.lapTelemetryRecorder = new LapTelemetryRecorder(logger);
    this.trayManager = new TrayManager(logger, {
      onToggleBlanking: () => {
        if (this.blankingManager.isBlankingActive()) {
          this.blankingManager.hide();
        } else {
          this.blankingManager.show();
        }
      },
      onQuit: () => {
        this.logger.info('Quit requested from tray icon');
        void this.stop().then(() => process.exit(0));
      },
    });
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
    this.trackBestLap(snapshot);
    this.lapTelemetryRecorder.record(snapshot);
    this.socket?.emit('agent:telemetry', snapshot);
  }

  private trackBestLap(snapshot: TelemetrySnapshot): void {
    if (!this.currentSession || snapshot.sessionId !== this.currentSession.sessionId) return;
    if (typeof snapshot.bestLapMs === 'number' && snapshot.bestLapMs > 0) {
      const current = this.currentSession.bestLapMs;
      if (!current || snapshot.bestLapMs < current) {
        this.currentSession.bestLapMs = snapshot.bestLapMs;
        this.logger.debug({ bestLapMs: snapshot.bestLapMs }, 'New best lap recorded');
      }
    }

    // AC's own bestLapMs (iBestTime) already excludes invalid laps (cuts,
    // etc.) — it only ever reflects the fastest *valid* completed lap. So if
    // a just-completed lap (lastLapMs) is faster than the currently known
    // valid best but didn't become the new bestLapMs above, AC rejected it:
    // it was invalid. Track the fastest such rejected lap separately.
    if (
      typeof snapshot.lapCount === 'number' &&
      snapshot.lapCount !== this.currentSession.lastSeenLapCount &&
      typeof snapshot.lastLapMs === 'number' &&
      snapshot.lastLapMs > 0
    ) {
      this.currentSession.lastSeenLapCount = snapshot.lapCount;
      const validBest = this.currentSession.bestLapMs;
      if (!validBest || snapshot.lastLapMs < validBest) {
        const currentInvalidBest = this.currentSession.bestInvalidLapMs;
        if (!currentInvalidBest || snapshot.lastLapMs < currentInvalidBest) {
          this.currentSession.bestInvalidLapMs = snapshot.lastLapMs;
          this.logger.debug(
            { lastLapMs: snapshot.lastLapMs },
            'New best invalid (cut) lap recorded',
          );
        }
      }
    }
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
    await this.kioskManager.init();
    await this.acSharedMemory.init();
    await this.trayManager.init();
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

    const reachable = await waitForServerReachable(config.SERVER_URL, this.logger);
    if (!reachable) {
      this.logger.warn(
        { serverUrl: config.SERVER_URL },
        'Backend server is not reachable; WebSocket connection may fail. Check network and SERVER_URL.',
      );
    }

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

      this.acSharedMemoryReader = new AcSharedMemoryReader(
        this.logger,
        config.STATION_ID,
        this.currentSession?.sessionId,
        (snapshot) => this.onTelemetrySnapshot(snapshot),
      );
    });

    this.socket.on('connect_error', (err) => {
      const message = err.message ?? String(err);
      this.logger.error({ message }, 'Connection error');
      if (this.isApiKeyError(message)) {
        void this.handleInvalidApiKey();
      }
    });

    (this.socket as unknown as import('events').EventEmitter).on('error', (err: Error | string) => {
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
    this.socket.on('settings:updated', (payload) =>
      this.blankingManager.setHideDelaySeconds(payload.blankingDelaySeconds),
    );
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
    this.acSharedMemoryReader?.stop();
    this.trayManager.stop();
    // Child processes on Windows don't die with their parent automatically:
    // without this, every agent restart (update, crash recovery) piles up
    // another blanking/results window on top of an orphaned one.
    this.blankingManager.shutdown();
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
        // Reconciliation: re-evaluate blanking and the reported POD status
        // against reality on every tick (not just when something notifies
        // us of a change), so the agent self-corrects any drift on its own
        // — e.g. if a status emit was missed or blanking ended up in the
        // wrong state for any reason.
        this.blankingManager.setAcRunning(this.acRunning);
        this.blankingManager.setAcLoaded(this.acLoaded);
        this.reconcileReportedStatus();
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
        blankingActive: this.blankingManager.isBlankingActive(),
        timestamp: Date.now(),
      };
      this.socket?.emit('agent:heartbeat', payload);
      this.heartbeatTimeout = setTimeout(() => void beat(), 2000);
    };

    void beat();
  }

  /**
   * Self-heals the status reported to the backend: if what's actually
   * running no longer matches what we last told the backend (a missed
   * transition, a race between two emits, a reconnect, etc.), correct it
   * immediately instead of waiting on the next explicit event. Mirrors the
   * same reconciliation the previous production launcher did every polling
   * cycle (`syncAssettoState()`).
   */
  private reconcileReportedStatus(): void {
    const desired = this.acRunning ? StationStatus.IN_GAME : StationStatus.ONLINE;
    if (this.lastReportedStatus === desired) {
      this.statusMismatchStreak = 0;
      return;
    }
    if (this.lastReportedStatus === null) {
      // First observation since connecting: nothing to protect against, so
      // report the accurate status right away instead of waiting out the
      // debounce below (e.g. the agent was restarted while AC was already
      // running).
      this.setReportedStatus(desired);
      this.statusMismatchStreak = 0;
      return;
    }
    // Require the drift to persist for a couple of ticks (~4s) so this
    // doesn't fight the brief, expected lag right after an explicit launch
    // (process not detected by tasklist yet) — only genuine drift gets
    // corrected here.
    this.statusMismatchStreak += 1;
    if (this.statusMismatchStreak < 2) return;
    this.logger.info(
      { from: this.lastReportedStatus, to: desired },
      'POD status drifted, correcting',
    );
    this.setReportedStatus(desired);
    this.statusMismatchStreak = 0;
  }

  private setReportedStatus(status: StationStatus): void {
    this.lastReportedStatus = status;
    this.socket?.emit('agent:status', { stationId: config.STATION_ID, status });
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
    this.clearResultsTimeout();
    try {
      await this.acLauncher.launch(payload);
      this.acRunning = true;
      this.acSharedMemoryReader?.start();
      this.lapTelemetryRecorder.start(payload.sessionId);
      await this.luaBridge.autoStart();
      this.setReportedStatus(StationStatus.IN_GAME);
      // Keep the blanking screen up until telemetry confirms the game has
      // really started (mirrors the in_game status just reported). Resets
      // any stale manual override internally.
      this.blankingManager.setPodInGame(true);
      // Only the game should be visible during a session: hide the
      // taskbar, minimize whatever else was open, and bring the game
      // window to the foreground once it appears.
      this.kioskManager.enter();
    } catch (err) {
      this.logger.error({ err }, 'Failed to launch Assetto Corsa');
    }
  }

  private async handleStop(): Promise<void> {
    this.logger.info('Received stop command');
    if (this.currentSession) {
      // A tracked (timed / dedicated-server) session must end the same way
      // regardless of whether the timer ran out, was reduced to zero, or
      // was stopped manually: results screen with driver name/best lap.
      await this.endSession();
      return;
    }
    this.acSharedMemoryReader?.stop();
    await this.luaBridge.quit();
    await this.acLauncher.stop();
    this.acRunning = false;
    this.clearResultsTimeout();
    const csvPath = await this.lapTelemetryRecorder.finish();
    if (csvPath) {
      this.logger.info({ csvPath }, 'Lap telemetry CSV saved');
      await this.uploadLapTelemetryCsv(csvPath);
    }
    this.blankingManager.setPodInGame(false);
    this.blankingManager.clearResults();
    this.blankingManager.setAuto();
    this.kioskManager.exit();
    this.setReportedStatus(StationStatus.ONLINE);
  }

  private clearCurrentSession(): void {
    if (this.currentSession?.timeout) {
      clearTimeout(this.currentSession.timeout);
    }
    this.currentSession = null;
  }

  private clearResultsTimeout(): void {
    if (this.resultsTimeout) {
      clearTimeout(this.resultsTimeout);
      this.resultsTimeout = null;
    }
  }

  private async handleSessionExtend(payload: {
    sessionId: string;
    minutes: number;
    newDurationMinutes: number;
  }): Promise<void> {
    this.logger.info(payload, 'Received session extend command');
    if (!this.currentSession || this.currentSession.sessionId !== payload.sessionId) {
      this.logger.warn(
        { currentSessionId: this.currentSession?.sessionId, payloadSessionId: payload.sessionId },
        'No matching active session to extend',
      );
      return;
    }
    // durationMinutes is null for a session that started unlimited
    // ("Illimité") — treat it as 0 for the relative-math fallback below.
    const oldDuration = this.currentSession.durationMinutes ?? 0;
    // The backend sends the absolute new duration; use it as the source of
    // truth so the agent timer stays in sync even if a relative update is
    // lost or delivered twice. Fall back to relative math only if the
    // absolute value is missing or invalid.
    const hasAbsolute =
      typeof payload.newDurationMinutes === 'number' &&
      Number.isFinite(payload.newDurationMinutes) &&
      payload.newDurationMinutes >= 0;
    const newDuration = hasAbsolute
      ? payload.newDurationMinutes
      : Math.max(0, oldDuration + payload.minutes);
    this.currentSession.durationMinutes = newDuration;
    this.logger.info(
      {
        oldDurationMinutes: oldDuration,
        newDurationMinutes: newDuration,
        usedAbsolute: hasAbsolute,
      },
      'Session duration updated',
    );
    if (newDuration === 0) {
      this.logger.info('Session duration reduced to zero, ending immediately');
      void this.endSession();
      return;
    }
    this.scheduleSessionEnd();
  }

  private scheduleSessionEnd(): void {
    if (!this.currentSession || this.currentSession.durationMinutes === null) return;
    if (this.currentSession.timeout) {
      clearTimeout(this.currentSession.timeout);
      this.currentSession.timeout = null;
    }
    const elapsedMs = Date.now() - this.currentSession.startedAt;
    const totalMs = this.currentSession.durationMinutes * 60 * 1000;
    const remainingMs = Math.max(0, totalMs - elapsedMs);
    this.logger.info(
      {
        sessionId: this.currentSession.sessionId,
        durationMinutes: this.currentSession.durationMinutes,
        elapsedMinutes: Math.round(elapsedMs / 60000),
        remainingMinutes: Math.round(remainingMs / 60000),
      },
      'Session end rescheduled',
    );
    if (remainingMs > 0) {
      this.currentSession.timeout = setTimeout(() => {
        void this.endSession();
      }, remainingMs);
    } else {
      void this.endSession();
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
      await this.updater.update(() => this.blankingManager.shutdown());
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

  private async uploadLapTelemetryCsv(csvPath: string | null): Promise<void> {
    if (!csvPath) return;
    try {
      const csv = await fs.readFile(csvPath, 'utf-8');
      const sessionId = this.lapTelemetryRecorder.getSessionId();
      if (!sessionId) return;
      this.socket?.emit('agent:telemetry:csv', {
        stationId: config.STATION_ID,
        sessionId,
        csv,
      });
      this.logger.info({ sessionId }, 'Lap telemetry CSV uploaded');
    } catch (err) {
      this.logger.warn({ err }, 'Failed to upload lap telemetry CSV');
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
      this.setReportedStatus(StationStatus.IN_GAME);
      // Keep the blanking screen up until telemetry confirms the game has
      // really started (mirrors the in_game status just reported). Resets
      // any stale manual override internally.
      this.blankingManager.setPodInGame(true);
      // Only the game should be visible during a session: hide the
      // taskbar, minimize whatever else was open, and bring the game
      // window to the foreground once it appears.
      this.kioskManager.enter();
      this.logger.info('Join server command completed');

      // Shared-memory telemetry (the only reliable source for the
      // isInMainMenu/isSessionStarted fields blanking's ready-detection
      // relies on) and session tracking must both start regardless of
      // whether the session has a duration — an "Illimité" join (the
      // frontend's default) must dismiss blanking and show the results
      // screen on stop just like a timed one. Only the auto-end timer is
      // actually conditional on having a duration.
      if (payload.sessionId) {
        this.acSharedMemoryReader?.setSessionId(payload.sessionId);
        this.acSharedMemoryReader?.start();
        this.lapTelemetryRecorder.start(payload.sessionId);

        const hasDuration = !!payload.durationMinutes && payload.durationMinutes > 0;
        this.currentSession = {
          sessionId: payload.sessionId,
          durationMinutes: hasDuration ? (payload.durationMinutes as number) : null,
          startedAt: Date.now(),
          timeout: null,
          clientName: payload.clientName,
          carAcId: payload.carAcId,
          track: payload.track,
          trackLayout: payload.trackLayout,
        };
        this.logger.info(
          { sessionId: payload.sessionId, durationMinutes: payload.durationMinutes ?? 'unlimited' },
          'Session tracking started',
        );
        if (hasDuration) {
          this.scheduleSessionEnd();
        }
      }
    } catch (err) {
      this.logger.error({ err }, 'Failed to execute join server command');
    }
  }

  /**
   * Ends a tracked session and shows the results screen, no matter why it
   * ended: duration expired naturally, was reduced to zero via extend, or
   * was stopped manually — all three must behave identically.
   */
  private async endSession(): Promise<void> {
    this.logger.info('Ending session, returning POD to paddock');
    const session = this.currentSession;
    this.clearCurrentSession();
    const csvPath = await this.lapTelemetryRecorder.finish();
    if (csvPath) {
      this.logger.info({ csvPath }, 'Lap telemetry CSV saved');
      await this.uploadLapTelemetryCsv(csvPath);
    }
    this.acSharedMemoryReader?.stop();

    // Show the results screen right away, before asking AC to quit: quit()
    // waits up to 15s for the game to close gracefully, and leaving that
    // time dead (last frame frozen, nothing shown) is exactly the gap users
    // saw between the session ending and the results appearing. The
    // blanking window is topmost, so it already covers the still-running
    // game — no need to wait for it to actually exit first.
    if (session) {
      this.blankingManager.showResults({
        clientName: session.clientName,
        carAcId: session.carAcId,
        track: session.track,
        trackLayout: session.trackLayout,
        bestLapMs: session.bestLapMs,
        bestInvalidLapMs: session.bestInvalidLapMs,
        pending: true,
      });
    } else {
      this.blankingManager.show();
    }

    try {
      await this.acLauncher.quit();
      this.acRunning = false;
      this.setReportedStatus(StationStatus.ONLINE);
      this.blankingManager.setPodInGame(false);
      this.kioskManager.exit();
      if (session) {
        // Wait for Assetto Corsa to write race_out.json, then read and push results.
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const rawResult = await this.raceResultReader.readLatest(session.startedAt);
        let raceResult: RaceResultData | undefined;
        if (rawResult) {
          const cleaned = cleanupRaceResult(rawResult);
          if (cleaned.valid && cleaned.resultData) {
            raceResult = cleaned.resultData;
            this.socket?.emit('agent:results', {
              stationId: config.STATION_ID,
              sessionId: session.sessionId,
              result: raceResult as unknown as Record<string, unknown>,
            });
            this.logger.info({ sessionId: session.sessionId }, 'Session results pushed to backend');
          }
        }
        this.blankingManager.showResults({
          clientName: session.clientName,
          carAcId: session.carAcId,
          track: session.track,
          trackLayout: session.trackLayout,
          bestLapMs: session.bestLapMs,
          bestInvalidLapMs: session.bestInvalidLapMs,
          result: raceResult,
        });
        this.socket?.emit('agent:session:ended', { sessionId: session.sessionId });
        this.resultsTimeout = setTimeout(() => {
          this.logger.info('Results display timeout expired, returning to auto blanking');
          this.blankingManager.setAuto();
          this.resultsTimeout = null;
        }, 60000);
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
