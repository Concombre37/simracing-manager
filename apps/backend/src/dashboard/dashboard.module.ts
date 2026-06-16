import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DashboardGateway } from './dashboard.gateway';

@Module({
  imports: [AuthModule],
  providers: [DashboardGateway],
  exports: [DashboardGateway],
})
export class DashboardModule {}
