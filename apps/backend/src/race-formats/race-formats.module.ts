import { Module } from '@nestjs/common';
import { RaceFormatsService } from './race-formats.service';
import { RaceFormatsController } from './race-formats.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RaceFormatsController],
  providers: [RaceFormatsService],
  exports: [RaceFormatsService],
})
export class RaceFormatsModule {}
