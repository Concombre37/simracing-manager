import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { SpectatorController } from './spectator.controller';
import { SpectatorPublicController } from './spectator-public.controller';
import { SpectatorFrameController } from './spectator-frame.controller';
import { SpectatorService } from './spectator.service';
import { StationsModule } from '../stations/stations.module';

@Module({
  imports: [PrismaModule, AuthModule, StationsModule],
  controllers: [SpectatorController, SpectatorPublicController, SpectatorFrameController],
  providers: [SpectatorService],
})
export class SpectatorModule {}
