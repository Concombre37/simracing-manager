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
  LaunchSessionPayload,
  StationStatus,
} from '@simracing/shared';
import { DashboardGateway } from '../dashboard/dashboard.gateway';

interface AuthenticatedSocket extends Socket {
  stationId?: string;
  stationName?: string;
  apiKey?: string;
  provisioning?: boolean;
}

@WebSocketGateway({ namespace: 'agent', cors: { origin: '*' } })
@UseGuards(AgentAuthGuard)
export class AgentGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  private readonly logger = new Logger(AgentGateway.name);

  @WebSocketServer()
  server!: Server<AgentToServerEvents, ServerToAgentEvents>;

  constructor(
    private readonly stationsService: StationsService,
    private readonly sessionsService: SessionsService,
    @Inject(forwardRef(() => DedicatedServersService))
    private readonly dedicatedServersService: DedicatedServersService,
    private readonly dashboardGateway: DashboardGateway,
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
        }
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
    }
    this.logger.log(`Agent connected: ${client.stationId ?? 'unknown'}`);
  }

  async handleDisconnect(client: AuthenticatedSocket): Promise<void> {
    if (client.stationId && !client.provisioning) {
      const station = await this.stationsService.updateStatus(
        client.stationId,
        StationStatus.OFFLINE,
      );
      this.dashboardGateway.emitStationUpdated(
        station.stationId,
        station.status,
      );
    }
    this.logger.log(`Agent disconnected: ${client.stationId ?? 'unknown'}`);
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
    const station = await this.stationsService.updateHeartbeat(payload);
    this.dashboardGateway.emitStationUpdated(station.stationId, station.status);
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

  @SubscribeMessage('agent:content')
  async handleContent(
    client: AuthenticatedSocket,
    payload: { stationId: string; content: Record<string, unknown> },
  ): Promise<void> {
    client.stationId = payload.stationId;
    await this.stationsService.updateContent(
      payload.stationId,
      payload.content,
    );
    this.logger.log(`Content received from ${payload.stationId}`);
  }

  @SubscribeMessage('server:started')
  async handleServerStarted(
    _client: AuthenticatedSocket,
    payload: { serverId: string; serverDir?: string },
  ): Promise<void> {
    this.logger.log(`Dedicated server started: ${payload.serverId}`);
    await this.dedicatedServersService.updateStatus(
      payload.serverId,
      'running',
      {
        serverDir: payload.serverDir,
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

  async emitUpdateAgent(stationId: string): Promise<void> {
    this.server.to(`station:${stationId}`).emit('system:update');
  }

  async emitJoinServer(
    stationId: string,
    payload: { host: string; port: number; password?: string },
  ): Promise<void> {
    this.server.to(`station:${stationId}`).emit('server:join', payload);
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
    });
  }

  async emitStopDedicatedServer(
    stationId: string,
    payload: { serverId: string },
  ): Promise<void> {
    this.server.to(`station:${stationId}`).emit('server:stop', payload);
  }
}
