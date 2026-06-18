import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BlankingMediaController } from './blanking-media.controller';
import { BlankingMediaService } from './blanking-media.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StationsModule } from '../stations/stations.module';

@Module({
  imports: [PrismaModule, StationsModule, AuthModule],
  controllers: [BlankingMediaController],
  providers: [BlankingMediaService],
  exports: [BlankingMediaService],
})
export class BlankingMediaModule {}
