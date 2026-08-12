import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { LoggerModule } from './logger/logger.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { StationsModule } from './stations/stations.module';
import { SessionsModule } from './sessions/sessions.module';
import { AgentModule } from './agent/agent.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ContentModule } from './content/content.module';
import { ContentPreviewsModule } from './content-previews/content-previews.module';
import { ContentLabelsModule } from './content-labels/content-labels.module';
import { ContentCategoriesModule } from './content-categories/content-categories.module';
import { BlankingMediaModule } from './blanking-media/blanking-media.module';
import { DedicatedServersModule } from './dedicated-servers/dedicated-servers.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { PowerManagementModule } from './power-management/power-management.module';
import { SettingsModule } from './settings/settings.module';
import { ClientsModule } from './clients/clients.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { ExternalApiModule } from './external-api/external-api.module';
import { RaceFormatsModule } from './race-formats/race-formats.module';
import { MenuModule } from './menu/menu.module';
import { ArcadeModule } from './arcade/arcade.module';
import { envSchema } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envSchema.parse(config),
    }),
    EventEmitterModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '../../..', 'apps/frontend/dist'),
      exclude: ['/api/(.*)', '/socket.io/(.*)', '/docs'],
    }),
    LoggerModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    StationsModule,
    SessionsModule,
    AgentModule,
    DashboardModule,
    ContentModule,
    ContentPreviewsModule,
    ContentLabelsModule,
    ContentCategoriesModule,
    BlankingMediaModule,
    DedicatedServersModule,
    TelemetryModule,
    PowerManagementModule,
    SettingsModule,
    ClientsModule,
    LeaderboardModule,
    ApiKeysModule,
    ExternalApiModule,
    RaceFormatsModule,
    MenuModule,
    ArcadeModule,
  ],
})
export class AppModule {}
