import { Module } from '@nestjs/common';
import { ExternalApiController } from './external-api.controller';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [ApiKeysModule, LeaderboardModule, SessionsModule],
  controllers: [ExternalApiController],
})
export class ExternalApiModule {}
