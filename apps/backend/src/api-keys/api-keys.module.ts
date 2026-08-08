import { Module } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysController } from './api-keys.controller';
import { ExternalApiKeyGuard } from './external-api-key.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ExternalApiKeyGuard],
  exports: [ApiKeysService, ExternalApiKeyGuard],
})
export class ApiKeysModule {}
