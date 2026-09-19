import { Module } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardAgentController } from './leaderboard-agent.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { StationsModule } from '../stations/stations.module';
import { ContentLabelsModule } from '../content-labels/content-labels.module';

@Module({
  imports: [PrismaModule, AuthModule, StationsModule, ContentLabelsModule],
  controllers: [LeaderboardController, LeaderboardAgentController],
  providers: [LeaderboardService],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}
