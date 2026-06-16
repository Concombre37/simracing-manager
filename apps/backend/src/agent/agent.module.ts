import { Module, forwardRef } from '@nestjs/common';
import { AgentGateway } from './agent.gateway';
import { StationsModule } from '../stations/stations.module';
import { SessionsModule } from '../sessions/sessions.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { DedicatedServersModule } from '../dedicated-servers/dedicated-servers.module';

@Module({
  imports: [
    forwardRef(() => StationsModule),
    SessionsModule,
    DashboardModule,
    forwardRef(() => DedicatedServersModule),
  ],
  providers: [AgentGateway],
  exports: [AgentGateway],
})
export class AgentModule {}
