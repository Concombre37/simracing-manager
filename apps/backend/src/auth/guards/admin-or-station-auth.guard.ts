import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { StationsService } from '../../stations/stations.service';
import { UserRole } from '@simracing/shared';

export interface AdminOrStationAuthRequest extends Request {
  stationId?: string;
  user?: { sub: string; email: string; role: string };
}

@Injectable()
export class AdminOrStationAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly stationsService: StationsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AdminOrStationAuthRequest>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Missing authorization token');
    }

    if (token.startsWith('sk_')) {
      return this.authorizeStation(request, token);
    }

    return this.authorizeAdmin(request, token);
  }

  private async authorizeStation(
    request: AdminOrStationAuthRequest,
    token: string,
  ): Promise<boolean> {
    const station = await this.stationsService.validateApiKey(token);
    if (!station) {
      throw new UnauthorizedException('Invalid station API key');
    }

    const requestedStationId =
      request.params['id'] ?? request.params['stationId'];
    if (requestedStationId && station.stationId !== requestedStationId) {
      throw new UnauthorizedException('Station ID mismatch');
    }

    request.stationId = station.stationId;
    return true;
  }

  private async authorizeAdmin(
    request: AdminOrStationAuthRequest,
    token: string,
  ): Promise<boolean> {
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        email: string;
        role: string;
      }>(token);

      if (payload.role !== UserRole.ADMIN) {
        throw new UnauthorizedException('Admin access required');
      }

      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
