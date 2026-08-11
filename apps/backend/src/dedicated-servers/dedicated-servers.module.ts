import { Module, forwardRef } from '@nestjs/common';
import { DedicatedServersService } from './dedicated-servers.service';
import { DedicatedServersController } from './dedicated-servers.controller';
import { AgentModule } from '../agent/agent.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ClientsModule } from '../clients/clients.module';
import { ContentLabelsModule } from '../content-labels/content-labels.module';
import { RaceFormatsModule } from '../race-formats/race-formats.module';

@Module({
  imports: [
    forwardRef(() => AgentModule),
    PrismaModule,
    ClientsModule,
    ContentLabelsModule,
    RaceFormatsModule,
  ],
  controllers: [DedicatedServersController],
  providers: [DedicatedServersService],
  exports: [DedicatedServersService],
})
export class DedicatedServersModule {}
