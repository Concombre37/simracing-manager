import { Module } from '@nestjs/common';
import { ContentCategoriesService } from './content-categories.service';
import { ContentCategoriesController } from './content-categories.controller';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ContentCategoriesController],
  providers: [ContentCategoriesService],
  exports: [ContentCategoriesService],
})
export class ContentCategoriesModule {}
