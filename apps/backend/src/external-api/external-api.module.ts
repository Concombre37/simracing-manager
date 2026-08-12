import { Module } from '@nestjs/common';
import { ExternalApiController } from './external-api.controller';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { SessionsModule } from '../sessions/sessions.module';
import { ContentLabelsModule } from '../content-labels/content-labels.module';
import { ContentCategoriesModule } from '../content-categories/content-categories.module';
import { MenuModule } from '../menu/menu.module';
import { ArcadeModule } from '../arcade/arcade.module';

@Module({
  imports: [
    ApiKeysModule,
    LeaderboardModule,
    SessionsModule,
    ContentLabelsModule,
    ContentCategoriesModule,
    MenuModule,
    ArcadeModule,
  ],
  controllers: [ExternalApiController],
})
export class ExternalApiModule {}
