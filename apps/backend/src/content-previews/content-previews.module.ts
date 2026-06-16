import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ContentPreviewsController } from './content-previews.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ContentPreviewsController],
})
export class ContentPreviewsModule {}
