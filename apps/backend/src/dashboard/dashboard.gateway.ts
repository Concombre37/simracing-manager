import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WsJwtAuthGuard } from '../auth/guards/ws-jwt-auth.guard';
import { TelemetrySnapshot } from '@simracing/shared';

export interface StationCommandPayload {
  stationId: string;
  command:
    | 'launch'
    | 'stop'
    | 'idealLine'
    | 'autoShifter'
    | 'teleportToPits'
    | 'recenterVR'
    | 'contentSync'
    | 'blankingHide'
    | 'blankingShow'
    | 'shutdown'
    | 'wake';
}

@WebSocketGateway({ cors: { origin: '*' } })
@UseGuards(WsJwtAuthGuard)
export class DashboardGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(DashboardGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly eventEmitter: EventEmitter2) {}

  handleConnection(client: Socket): void {
    this.logger.log(`Dashboard client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Dashboard client disconnected: ${client.id}`);
  }

  emitStationUpdated(stationId: string, status: string): void {
    this.server.emit('station:updated', { stationId, status });
  }

  emitStationTelemetry(payload: TelemetrySnapshot): void {
    this.server.emit('station:telemetry', payload);
  }

  @SubscribeMessage('station:command')
  async handleStationCommand(
    _client: Socket,
    payload: StationCommandPayload,
  ): Promise<void> {
    this.logger.log(
      `Received command ${payload.command} for station ${payload.stationId}`,
    );
    this.eventEmitter.emit('agent.command', payload);
  }
}
