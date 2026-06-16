import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StationsService } from '../stations/stations.service';
import { SessionsService } from '../sessions/sessions.service';
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
    this.logger.log(`Agent connected: ${client.stationId ?? 'unknown'}`);
  }

  async handleDisconnect(client: AuthenticatedSocket): Promise<void> {
    if (client.stationId) {
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
}
