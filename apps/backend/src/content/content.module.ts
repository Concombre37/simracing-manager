import { Module } from '@nestjs/common';
import { ContentService } from './content.service';
import { ContentController } from './content.controller';
import { AuthModule } from '../auth/auth.module';
import { StationsModule } from '../stations/stations.module';

@Module({
  imports: [AuthModule, StationsModule],
  controllers: [ContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
