import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Inject, forwardRef } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StationsService } from '../stations/stations.service';
import { SessionsService } from '../sessions/sessions.service';
import { DedicatedServersService } from '../dedicated-servers/dedicated-servers.service';
import { AgentAuthGuard } from './guards/agent-auth.guard';
import {
  AgentToServerEvents,
  ServerToAgentEvents,
  HeartbeatPayload,
  LogPayload,
  ResultsPayload,
  TelemetryCsvPayload,
  LaunchSessionPayload,
  StationStatus,
  StatusPayload,
  SessionStatus,
} from '@simracing/shared';
import { DashboardGateway } from '../dashboard/dashboard.gateway';
import { TelemetryService } from '../telemetry/telemetry.service';
import { SettingsService } from '../settings/settings.service';
import { TelemetrySnapshot } from '@simracing/shared';
import { promises as fs } from 'fs';
import path from 'path';

interface AuthenticatedSocket extends Socket {
  stationId?: string;
  stationName?: string;
  apiKey?: string;
  provisioning?: boolean;
}

@WebSocketGateway({
  namespace: 'agent',
  cors: { origin: '*' },
  maxHttpBufferSize: 1 * 1024 * 1024 * 1024,
})
@UseGuards(AgentAuthGuard)
export class AgentGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  private readonly logger = new Logger(AgentGateway.name);
  private readonly connectedStationIds = new Set<string>();

  @WebSocketServer()
  server!: Server<AgentToServerEvents, ServerToAgentEvents>;

  constructor(
    private readonly stationsService: StationsService,
    private readonly sessionsService: SessionsService,
    @Inject(forwardRef(() => DedicatedServersService))
    private readonly dedicatedServersService: DedicatedServersService,
    private readonly dashboardGateway: DashboardGateway,
    private readonly telemetryService: TelemetryService,
    private readonly settingsService: SettingsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit(): void {
    this.eventEmitter.on(
      'agent.command',
      async (payload: { stationId: string; command: string }) => {
        switch (payload.command) {
          case 'idealLine':
            await this.emitIdealLine(payload.stationId);
            break;
          case 'autoShifter':
            await this.emitAutoShifter(payload.stationId);
            break;
          case 'teleportToPits':
            await this.emitTeleportToPits(payload.stationId);
            break;
          case 'recenterVR':
            await this.emitRecenterVR(payload.stationId);
            break;
          case 'contentSync':
            await this.emitContentSync(payload.stationId);
            break;
          case 'blankingHide':
            await this.emitBlankingHide(payload.stationId);
            break;
          case 'blankingShow':
            await this.emitBlankingShow(payload.stationId);
            break;
          case 'shutdown':
            await this.emitShutdown(payload.stationId);
            break;
          case 'wake':
            // Wake-on-LAN is handled by the power-management REST endpoint;
            // this case prevents the dashboard WS command from being silently ignored.
            this.logger.warn(
              `Wake command received via dashboard WS for ${payload.stationId}; use POST /stations/:id/wake instead.`,
            );
            break;
        }
      },
    );

    this.eventEmitter.on(
      'blanking.mediaUpdated',
      async (payload: { stationId: string }) => {
        await this.emitBlankingMediaUpdated(payload.stationId);
      },
    );

    this.eventEmitter.on(
      'settings.updated',
      (payload: { blankingDelaySeconds: number }) => {
        this.server.emit('settings:updated', payload);
      },
    );
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    if (client.provisioning) {
      this.logger.log(`Agent provisioning: ${client.stationId}`);
      return;
    }
    if (client.stationId) {
      await client.join(`station:${client.stationId}`);
      this.connectedStationIds.add(client.stationId);
      this.logger.log(
        `Agent connected and joined room station:${client.stationId} (socket ${client.id})`,
      );
      const settings = await this.settingsService.get();
      client.emit('settings:updated', {
        blankingDelaySeconds: settings.blankingDelaySeconds,
      });
    } else {
      this.logger.log(`Agent connected: unknown station (socket ${client.id})`);
    }
  }

  async handleDisconnect(client: AuthenticatedSocket): Promise<void> {
    if (client.stationId && !client.provisioning) {
      this.connectedStationIds.delete(client.stationId);
      const station = await this.stationsService.updateStatus(
        client.stationId,
        StationStatus.OFFLINE,
      );
      this.dashboardGateway.emitStationUpdated(
        station.stationId,
        station.status,
        station.blankingActive,
      );
    }
    this.logger.log(`Agent disconnected: ${client.stationId ?? 'unknown'}`);
  }

  getConnectedStationIds(): string[] {
    return Array.from(this.connectedStationIds);
  }

  @SubscribeMessage('agent:register')
  async handleRegister(
    client: AuthenticatedSocket,
    payload: { stationId: string; stationName: string; version?: string },
  ): Promise<void> {
    if (!client.provisioning) {
      this.logger.warn(`Agent register ignored: not in provisioning mode`);
      return;
    }

    const result = await this.stationsService.provision(
      payload.stationId,
      payload.stationName,
      payload.version,
    );

    client.emit('agent:provisioned', {
      stationId: result.stationId,
      apiKey: result.apiKey,
    });

    this.logger.log(
      `Agent provisioned: ${result.stationId} -> ${result.apiKey.slice(0, 8)}...`,
    );
  }

  @SubscribeMessage('agent:heartbeat')
  async handleHeartbeat(
    client: AuthenticatedSocket,
    payload: HeartbeatPayload,
  ): Promise<void> {
    client.stationId = payload.stationId;
    const room = `station:${payload.stationId}`;
    if (!client.rooms.has(room)) {
      await client.join(room);
      this.logger.log(`Agent joined room ${room} (heartbeat)`);
    }
    this.connectedStationIds.add(payload.stationId);
    const station = await this.stationsService.updateHeartbeat(payload);
    this.dashboardGateway.emitStationUpdated(
      station.stationId,
      station.status,
      station.blankingActive,
    );
  }

  @SubscribeMessage('agent:log')
  async handleLog(
    _client: AuthenticatedSocket,
    payload: LogPayload,
  ): Promise<void> {
    this.logger.log(`[${payload.stationId}] ${payload.message}`);
  }

  @SubscribeMessage('agent:results')
  async handleResults(
    _client: AuthenticatedSocket,
    payload: ResultsPayload,
  ): Promise<void> {
    await this.sessionsService.finish(payload.sessionId, payload.result);
  }

  @SubscribeMessage('agent:telemetry:csv')
  async handleTelemetryCsv(
    _client: AuthenticatedSocket,
    payload: TelemetryCsvPayload,
  ): Promise<void> {
    try {
      const uploadDir = path.join(process.cwd(), 'uploads', 'telemetry');
      await fs.mkdir(uploadDir, { recursive: true });
      const filePath = path.join(uploadDir, `${payload.sessionId}.csv`);
      await fs.writeFile(filePath, payload.csv, 'utf-8');
      this.logger.log(
        {
          stationId: payload.stationId,
          sessionId: payload.sessionId,
          filePath,
        },
        'Lap telemetry CSV saved',
      );
    } catch (err) {
      this.logger.error(
        { err, stationId: payload.stationId, sessionId: payload.sessionId },
        'Failed to save lap telemetry CSV',
      );
    }
  }

  @SubscribeMessage('agent:content')
  async handleContent(
    client: AuthenticatedSocket,
    payload: { stationId: string; content: Record<string, unknown> },
  ): Promise<void> {
    try {
      client.stationId = payload.stationId;
      this.logger.log(`Content received from ${payload.stationId}`);
      await this.stationsService.updateContent(
        payload.stationId,
        payload.content,
      );
      this.logger.log(`Content processed for ${payload.stationId}`);
    } catch (err) {
      this.logger.error(
        { err, stationId: payload.stationId },
        'Failed to process content',
      );
    }
  }

  @SubscribeMessage('agent:telemetry')
  async handleTelemetry(
    client: AuthenticatedSocket,
    payload: TelemetrySnapshot,
  ): Promise<void> {
    this.logger.log(
      {
        stationId: payload.stationId,
        socketStationId: client.stationId,
        speedKmh: payload.speedKmh,
        timestamp: payload.timestamp,
      },
      'Telemetry snapshot received',
    );
    this.telemetryService.update(payload);
    this.dashboardGateway.emitStationTelemetry(payload);
  }

  @SubscribeMessage('agent:status')
  async handleStatus(
    client: AuthenticatedSocket,
    payload: StatusPayload,
  ): Promise<void> {
    client.stationId = payload.stationId;
    const room = `station:${payload.stationId}`;
    if (!client.rooms.has(room)) {
      await client.join(room);
      this.connectedStationIds.add(payload.stationId);
    }
    const station = await this.stationsService.updateStatus(
      payload.stationId,
      payload.status,
    );
    this.dashboardGateway.emitStationUpdated(
      station.stationId,
      station.status,
      station.blankingActive,
    );
  }

  @SubscribeMessage('agent:session:ended')
  async handleSessionEnded(
    _client: AuthenticatedSocket,
    payload: { sessionId: string },
  ): Promise<void> {
    try {
      const session = await this.sessionsService.findOne(payload.sessionId);
      if (!session || session.status === SessionStatus.FINISHED) {
        this.logger.debug(
          { sessionId: payload.sessionId, status: session?.status },
          'Session already finished or not found; skipping finish on session ended',
        );
        return;
      }
      await this.sessionsService.finish(payload.sessionId, {});
      this.dashboardGateway.server.emit('session:updated', {
        sessionId: payload.sessionId,
        stationId: session.stationId,
        status: session.status,
      });
    } catch (err) {
      this.logger.warn(
        { err, sessionId: payload.sessionId },
        'Failed to finish session',
      );
    }
  }

  @SubscribeMessage('server:started')
  async handleServerStarted(
    _client: AuthenticatedSocket,
    payload: {
      serverId: string;
      serverDir?: string;
      udpPort: number;
      tcpPort: number;
      httpPort: number;
    },
  ): Promise<void> {
    this.logger.log(
      `Dedicated server started: ${payload.serverId} (ports udp=${payload.udpPort}, tcp=${payload.tcpPort}, http=${payload.httpPort})`,
    );
    await this.dedicatedServersService.updateStatus(
      payload.serverId,
      'running',
      {
        serverDir: payload.serverDir,
        udpPort: payload.udpPort,
        tcpPort: payload.tcpPort,
        httpPort: payload.httpPort,
      },
    );
  }

  @SubscribeMessage('server:stopped')
  async handleServerStopped(
    _client: AuthenticatedSocket,
    payload: { serverId: string; error?: string },
  ): Promise<void> {
    this.logger.log(`Dedicated server stopped: ${payload.serverId}`);
    await this.dedicatedServersService.updateStatus(
      payload.serverId,
      payload.error ? 'error' : 'stopped',
      { error: payload.error },
    );
  }

  async emitLaunch(
    stationId: string,
    payload: LaunchSessionPayload,
  ): Promise<void> {
    this.server.to(`station:${stationId}`).emit('session:launch', payload);
  }

  async emitStop(stationId: string): Promise<void> {
    this.server.to(`station:${stationId}`).emit('session:stop');
  }

  async emitIdealLine(stationId: string): Promise<void> {
    this.server.to(`station:${stationId}`).emit('ac:idealLine');
  }

  async emitAutoShifter(stationId: string): Promise<void> {
    this.server.to(`station:${stationId}`).emit('ac:autoShifter');
  }

  async emitTeleportToPits(stationId: string): Promise<void> {
    this.server.to(`station:${stationId}`).emit('ac:teleportToPits');
  }

  async emitRecenterVR(stationId: string): Promise<void> {
    this.server.to(`station:${stationId}`).emit('vr:recenter');
  }

  async emitContentSync(stationId: string): Promise<void> {
    this.server.to(`station:${stationId}`).emit('content:sync');
  }

  async emitBlankingHide(stationId: string): Promise<void> {
    this.server.to(`station:${stationId}`).emit('blanking:hide');
  }

  async emitBlankingShow(stationId: string): Promise<void> {
    this.server.to(`station:${stationId}`).emit('blanking:show');
  }

  async emitBlankingMediaUpdated(stationId: string): Promise<void> {
    this.server.to(`station:${stationId}`).emit('blanking:mediaUpdated');
  }

  async emitShutdown(stationId: string): Promise<void> {
    this.server.to(`station:${stationId}`).emit('system:shutdown');
  }

  async emitWakeOnLan(
    stationId: string,
    payload: { targetMac: string; targetIp?: string },
  ): Promise<void> {
    this.server.to(`station:${stationId}`).emit('wol:send', payload);
  }

  async emitUpdateAgent(stationId: string): Promise<void> {
    this.server.to(`station:${stationId}`).emit('system:update');
  }

  async emitJoinServer(
    stationId: string,
    payload: {
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
    },
  ): Promise<void> {
    const room = `station:${stationId}`;
    const sockets = await this.server.in(room).fetchSockets();
    this.logger.log(
      `Emitting server:join to ${room} — ${sockets.length} socket(s) found`,
    );
    if (sockets.length === 0) {
      this.logger.warn(
        `No agent socket in ${room}; command will not be received. Connected stations: [${this.getConnectedStationIds().join(', ')}]`,
      );
      return;
    }
    for (const socket of sockets) {
      socket.emit('server:join', payload);
      this.logger.log(`Sent server:join to socket ${socket.id} in ${room}`);
    }
  }

  async emitLaunchDedicatedServer(
    stationId: string,
    payload: {
      serverId: string;
      name: string;
      track: string;
      trackLayout: string | null;
      cars: string[];
      maxClients: number;
      password: string | null;
      rconPassword: string | null;
      udpPort?: number;
      tcpPort?: number;
      httpPort?: number;
    },
  ): Promise<void> {
    this.server.to(`station:${stationId}`).emit('server:launch', {
      serverId: payload.serverId,
      name: payload.name,
      track: payload.track,
      trackLayout: payload.trackLayout ?? undefined,
      cars: payload.cars,
      maxClients: payload.maxClients,
      password: payload.password ?? undefined,
      rconPassword: payload.rconPassword ?? undefined,
      udpPort: payload.udpPort,
      tcpPort: payload.tcpPort,
      httpPort: payload.httpPort,
    });
  }

  async emitStopDedicatedServer(
    stationId: string,
    payload: { serverId: string },
  ): Promise<void> {
    this.server.to(`station:${stationId}`).emit('server:stop', payload);
  }

  async emitStopSession(stationId: string): Promise<void> {
    this.server.to(`station:${stationId}`).emit('session:stop');
  }

  async emitSessionExtend(
    stationId: string,
    payload: { sessionId: string; minutes: number; newDurationMinutes: number },
  ): Promise<void> {
    this.server.to(`station:${stationId}`).emit('session:extend', payload);
  }
}
