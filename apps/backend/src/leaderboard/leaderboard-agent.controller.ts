import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminOrStationAuthGuard } from '../auth/guards/admin-or-station-auth.guard';
import { LeaderboardService } from './leaderboard.service';

/** Read-only historical leaderboard consumed by an authenticated station agent. */
@Controller('leaderboard')
@UseGuards(AdminOrStationAuthGuard)
export class LeaderboardAgentController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get('history')
  getHistory(
    @Query('track') track: string,
    @Query('trackLayout') trackLayout?: string,
    @Query('car') carAcId?: string,
    @Query('before') before?: string,
  ) {
    return this.leaderboardService.getHistoricalLeaderboard({
      track,
      trackLayout,
      carAcId,
      before,
    });
  }
}
