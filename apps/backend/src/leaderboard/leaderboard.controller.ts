import { Controller, Get, UseGuards } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@simracing/shared';

@Controller('leaderboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  getLeaderboard() {
    return this.leaderboardService.getLeaderboard();
  }
}
