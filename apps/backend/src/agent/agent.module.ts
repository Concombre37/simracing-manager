import { Module, forwardRef } from '@nestjs/common';
import { AgentGateway } from './agent.gateway';
import { StationsModule } from '../stations/stations.module';
import { SessionsModule } from '../sessions/sessions.module';
import { DashboardModule } from '../dashboard/dashboard.module';

@Module({
  imports: [forwardRef(() => StationsModule), SessionsModule, DashboardModule],
  providers: [AgentGateway],
  exports: [AgentGateway],
})
export class AgentModule {}
