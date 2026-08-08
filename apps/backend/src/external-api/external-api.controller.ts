import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ExternalApiKeyGuard } from '../api-keys/external-api-key.guard';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { SessionsService } from '../sessions/sessions.service';

/** Surface en lecture seule pensée pour un consommateur externe (site web,
 * bot Discord, etc.) — authentifiée par clé API dédiée (`ApiKeysModule`),
 * pas par le JWT du dashboard. Renvoie les mêmes données que le dashboard
 * admin, juste sous un chemin et une auth séparés pour ne jamais coupler
 * un client externe à la session JWT d'un utilisateur du dashboard. */
@Controller('external/v1')
@UseGuards(ExternalApiKeyGuard)
export class ExternalApiController {
  constructor(
    private readonly leaderboardService: LeaderboardService,
    private readonly sessionsService: SessionsService,
  ) {}

  @Get('leaderboard')
  getLeaderboard() {
    return this.leaderboardService.getLeaderboard();
  }

  @Get('sessions')
  getSessions(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const parsedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return this.sessionsService.findHistory({ limit: parsedLimit, cursor });
  }

  @Get('sessions/:id')
  getSessionDetail(@Param('id') id: string) {
    return this.sessionsService.getDetail(id);
  }
}
