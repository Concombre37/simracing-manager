import { Module, forwardRef } from '@nestjs/common';
import { AgentGateway } from './agent.gateway';
import { StationsModule } from '../stations/stations.module';
import { SessionsModule } from '../sessions/sessions.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { DedicatedServersModule } from '../dedicated-servers/dedicated-servers.module';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    forwardRef(() => StationsModule),
    forwardRef(() => SessionsModule),
    DashboardModule,
    TelemetryModule,
    forwardRef(() => DedicatedServersModule),
    SettingsModule,
  ],
  providers: [AgentGateway],
  exports: [AgentGateway],
})
export class AgentModule {}
