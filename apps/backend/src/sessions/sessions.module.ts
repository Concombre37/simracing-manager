import { Module, forwardRef } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { AgentModule } from '../agent/agent.module';
import { DashboardModule } from '../dashboard/dashboard.module';

@Module({
  imports: [forwardRef(() => AgentModule), DashboardModule],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
