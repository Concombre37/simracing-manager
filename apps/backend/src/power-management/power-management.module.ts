import { Module } from '@nestjs/common';
import { PowerManagementService } from './power-management.service';
import { PowerManagementController } from './power-management.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentModule } from '../agent/agent.module';

@Module({
  imports: [PrismaModule, AgentModule],
  controllers: [PowerManagementController],
  providers: [PowerManagementService],
})
export class PowerManagementModule {}
