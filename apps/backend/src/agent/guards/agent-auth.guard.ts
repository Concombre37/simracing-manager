import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Socket } from 'socket.io';
import { StationsService } from '../../stations/stations.service';

export interface AgentAuthData {
  stationId: string;
  stationName?: string;
  apiKey?: string;
  provisioning?: boolean;
}

@Injectable()
export class AgentAuthGuard implements CanActivate {
  constructor(private readonly stationsService: StationsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>();
    const auth = client.handshake.auth as {
      token?: string;
      stationId?: string;
      stationName?: string;
    };

    // Provisioning mode: agent has no API key yet but provides station identity.
    if (!auth.token && auth.stationId) {
      (client as Socket & AgentAuthData).stationId = auth.stationId;
      (client as Socket & AgentAuthData).stationName =
        auth.stationName ?? auth.stationId;
      (client as Socket & AgentAuthData).provisioning = true;
      return true;
    }

    if (!auth.token) {
      client.emit('agent:unauthorized', {
        reason: 'Missing agent API key or station ID',
      });
      throw new UnauthorizedException('Missing agent API key or station ID');
    }

    const station = await this.stationsService.validateApiKey(auth.token);
    if (!station) {
      client.emit('agent:unauthorized', { reason: 'Invalid agent API key' });
      throw new UnauthorizedException('Invalid agent API key');
    }

    (client as Socket & AgentAuthData).stationId = station.stationId;
    (client as Socket & AgentAuthData).apiKey = auth.token;
    await client.join(`station:${station.stationId}`);
    return true;
  }
}
