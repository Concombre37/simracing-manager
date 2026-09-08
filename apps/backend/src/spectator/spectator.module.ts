import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { SpectatorController } from './spectator.controller';
import { SpectatorService } from './spectator.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [SpectatorController],
  providers: [SpectatorService],
})
export class SpectatorModule {}
