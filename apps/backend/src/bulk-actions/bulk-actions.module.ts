import { Module } from '@nestjs/common';
import { BulkActionsController } from './bulk-actions.controller';
import { BulkActionsService } from './bulk-actions.service';
import { StationsModule } from '../stations/stations.module';
import { AgentModule } from '../agent/agent.module';
import { PowerManagementModule } from '../power-management/power-management.module';

@Module({
  imports: [StationsModule, AgentModule, PowerManagementModule],
  controllers: [BulkActionsController],
  providers: [BulkActionsService],
})
export class BulkActionsModule {}
