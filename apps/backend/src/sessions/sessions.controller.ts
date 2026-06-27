import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { SessionsService } from './sessions.service';
import {
  createSessionSchema,
  CreateSessionDto,
} from './dto/create-session.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@simracing/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AgentGateway } from '../agent/agent.gateway';
import { DashboardGateway } from '../dashboard/dashboard.gateway';

@Controller('sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly agentGateway: AgentGateway,
    private readonly dashboardGateway: DashboardGateway,
  ) {}

  @Post()
  @Roles(UserRole.ADMIN)
  create(
    @Body(new ZodValidationPipe(createSessionSchema)) dto: CreateSessionDto,
  ) {
    return this.sessionsService.create(dto);
  }

  @Get('station/:stationId')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  findByStation(@Param('stationId') stationId: string) {
    return this.sessionsService.findByStation(stationId);
  }

  @Get('active')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  async findActive() {
    return this.sessionsService.findActive();
  }

  @Post(':id/extend')
  @Roles(UserRole.ADMIN)
  async extend(
    @Param('id') id: string,
    @Body('minutes', ParseIntPipe) minutes: number,
  ) {
    const session = await this.sessionsService.extend(id, minutes);
    await this.agentGateway.emitSessionExtend(session.station.stationId, {
      sessionId: session.id,
      minutes,
    });
    this.dashboardGateway.server.emit('session:updated', {
      sessionId: session.id,
      stationId: session.stationId,
      durationMinutes: session.durationMinutes ?? undefined,
      status: session.status,
    });
    return session;
  }

  @Post(':id/stop')
  @Roles(UserRole.ADMIN)
  async stop(@Param('id') id: string) {
    const session = await this.sessionsService.stop(id);
    await this.agentGateway.emitStopSession(session.stationId);
    this.dashboardGateway.server.emit('session:updated', {
      sessionId: session.id,
      stationId: session.stationId,
      status: session.status,
    });
    return session;
  }
}
