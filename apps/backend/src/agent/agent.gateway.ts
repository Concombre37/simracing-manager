import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
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
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AgentGateway.name);

  @WebSocketServer()
  server!: Server<AgentToServerEvents, ServerToAgentEvents>;

  constructor(
    private readonly stationsService: StationsService,
    private readonly sessionsService: SessionsService,
    private readonly dashboardGateway: DashboardGateway,
  ) {}

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
}
