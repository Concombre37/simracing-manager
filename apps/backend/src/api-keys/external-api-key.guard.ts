import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiKeysService } from './api-keys.service';

export interface ExternalApiRequest extends Request {
  apiKeyId?: string;
}

@Injectable()
export class ExternalApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ExternalApiRequest>();
    const key = this.extractKey(request);
    if (!key) {
      throw new UnauthorizedException(
        'Clé API manquante (en-tête X-Api-Key ou Authorization: Bearer)',
      );
    }

    const record = await this.apiKeysService.validate(key);
    if (!record) {
      throw new UnauthorizedException('Clé API invalide ou révoquée');
    }

    request.apiKeyId = record.id;
    return true;
  }

  private extractKey(request: Request): string | undefined {
    const header = request.headers['x-api-key'];
    if (typeof header === 'string') return header;
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
