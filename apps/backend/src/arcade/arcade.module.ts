import { Module } from '@nestjs/common';
import { ArcadeService } from './arcade.service';
import { ArcadeController } from './arcade.controller';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ArcadeController],
  providers: [ArcadeService],
  exports: [ArcadeService],
})
export class ArcadeModule {}
