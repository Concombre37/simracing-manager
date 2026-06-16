import { Module, forwardRef } from '@nestjs/common';
import { DedicatedServersService } from './dedicated-servers.service';
import { DedicatedServersController } from './dedicated-servers.controller';
import { AgentModule } from '../agent/agent.module';

@Module({
  imports: [forwardRef(() => AgentModule)],
  controllers: [DedicatedServersController],
  providers: [DedicatedServersService],
  exports: [DedicatedServersService],
})
export class DedicatedServersModule {}
