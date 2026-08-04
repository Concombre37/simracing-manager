import { Module } from '@nestjs/common';
import { ContentLabelsService } from './content-labels.service';
import { ContentLabelsController } from './content-labels.controller';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ContentLabelsController],
  providers: [ContentLabelsService],
  exports: [ContentLabelsService],
})
export class ContentLabelsModule {}
