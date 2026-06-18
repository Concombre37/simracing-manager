import { Module, forwardRef } from '@nestjs/common';
import { StationsService } from './stations.service';
import { StationsController } from './stations.controller';
import { SessionsModule } from '../sessions/sessions.module';
import { AgentModule } from '../agent/agent.module';
import { TelemetryModule } from '../telemetry/telemetry.module';

@Module({
  imports: [forwardRef(() => AgentModule), SessionsModule, TelemetryModule],
  controllers: [StationsController],
  providers: [StationsService],
  exports: [StationsService],
})
export class StationsModule {}
