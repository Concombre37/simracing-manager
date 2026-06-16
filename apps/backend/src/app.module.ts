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
import { DedicatedServersModule } from './dedicated-servers/dedicated-servers.module';
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
    DedicatedServersModule,
  ],
})
export class AppModule {}
