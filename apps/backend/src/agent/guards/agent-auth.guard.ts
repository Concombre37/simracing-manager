import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Socket } from 'socket.io';
import { StationsService } from '../../stations/stations.service';

@Injectable()
export class AgentAuthGuard implements CanActivate {
  constructor(private readonly stationsService: StationsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>();
    const apiKey = client.handshake.auth.token as string | undefined;

    if (!apiKey) {
      throw new UnauthorizedException('Missing agent API key');
    }

    const station = await this.stationsService.validateApiKey(apiKey);
    if (!station) {
      throw new UnauthorizedException('Invalid agent API key');
    }

    (client as Socket & { stationId: string }).stationId = station.stationId;
    return true;
  }
}
