import { Module } from '@nestjs/common';
import { BlankingMediaController } from './blanking-media.controller';
import { BlankingMediaService } from './blanking-media.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StationsModule } from '../stations/stations.module';

@Module({
  imports: [PrismaModule, StationsModule],
  controllers: [BlankingMediaController],
  providers: [BlankingMediaService],
  exports: [BlankingMediaService],
})
export class BlankingMediaModule {}
