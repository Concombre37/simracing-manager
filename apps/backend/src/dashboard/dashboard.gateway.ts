import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { WsJwtAuthGuard } from '../auth/guards/ws-jwt-auth.guard';

@WebSocketGateway({ cors: { origin: '*' } })
@UseGuards(WsJwtAuthGuard)
export class DashboardGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(DashboardGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket): void {
    this.logger.log(`Dashboard client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Dashboard client disconnected: ${client.id}`);
  }

  emitStationUpdated(stationId: string, status: string): void {
    this.server.emit('station:updated', { stationId, status });
  }
}
