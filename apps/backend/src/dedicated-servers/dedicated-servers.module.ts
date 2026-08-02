import { Module, forwardRef } from '@nestjs/common';
import { DedicatedServersService } from './dedicated-servers.service';
import { DedicatedServersController } from './dedicated-servers.controller';
import { AgentModule } from '../agent/agent.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ClientsModule } from '../clients/clients.module';

@Module({
  imports: [forwardRef(() => AgentModule), PrismaModule, ClientsModule],
  controllers: [DedicatedServersController],
  providers: [DedicatedServersService],
  exports: [DedicatedServersService],
})
export class DedicatedServersModule {}
