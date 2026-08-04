import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { StationsService } from './stations.service';
import { SessionsService } from '../sessions/sessions.service';
import { AgentGateway } from '../agent/agent.gateway';
import { TelemetryService } from '../telemetry/telemetry.service';
import {
  createStationSchema,
  CreateStationDto,
} from './dto/create-station.dto';
import {
  updateStationSchema,
  UpdateStationDto,
} from './dto/update-station.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  StationRole,
  UserRole,
  formatCarName,
  formatTrackName,
} from '@simracing/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ContentLabelsService } from '../content-labels/content-labels.service';

interface StationContentShape {
  cars?: { acId: string; name?: string }[];
  tracks?: { acId: string; name?: string }[];
}

@Controller('stations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StationsController {
  constructor(
    private readonly stationsService: StationsService,
    private readonly sessionsService: SessionsService,
    private readonly agentGateway: AgentGateway,
    private readonly telemetryService: TelemetryService,
    private readonly contentLabelsService: ContentLabelsService,
  ) {}

  @Post()
  @Roles(UserRole.ADMIN)
  create(
    @Body(new ZodValidationPipe(createStationSchema)) dto: CreateStationDto,
  ) {
    return this.stationsService.create(dto);
  }

  @Get()
  findAll() {
    return this.stationsService.findAll();
  }

  @Get('connected')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  getConnected() {
    return this.agentGateway.getConnectedStationIds();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.stationsService.findOne(id);
  }

  @Get(':id/telemetry')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  async getTelemetry(@Param('id') id: string) {
    const station = await this.stationsService.findOne(id);
    return this.telemetryService.getCurrent(station.stationId);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateStationSchema)) dto: UpdateStationDto,
  ) {
    const station = await this.stationsService.update(id, dto);
    if (dto.role) {
      await this.agentGateway.emitStationRole(station.stationId, dto.role);
    }
    return station;
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.stationsService.remove(id);
  }

  @Post(':id/regenerate-api-key')
  @Roles(UserRole.ADMIN)
  regenerateApiKey(@Param('id') id: string) {
    return this.stationsService.regenerateApiKey(id);
  }

  @Post(':id/launch')
  @Roles(UserRole.ADMIN)
  async launch(@Param('id') id: string) {
    const station = await this.stationsService.findOne(id);
    if (station.role !== StationRole.SIMULATOR) {
      throw new BadRequestException(
        'Only a simulator station can launch a direct session',
      );
    }
    const session = await this.sessionsService.create({
      stationId: station.id,
      config: (station.config ?? {}) as Record<string, unknown>,
    });
    await this.sessionsService.start(session.id);
    const sessionConfig = (session.config ?? {}) as unknown;

    // Resolved so the agent's blanking screens (launching/results) can show
    // the customized display name instead of the raw acId — see
    // packages/shared/src/naming.ts for the same fallback logic already
    // used by the dashboard.
    const cfg = (sessionConfig ?? {}) as Record<string, unknown>;
    const carAcId = cfg.carId ? String(cfg.carId) : undefined;
    const trackAcId = cfg.trackId ? String(cfg.trackId) : undefined;
    const content = station.content as StationContentShape | null;
    const labelMap = await this.contentLabelsService.getMap();
    const carName = carAcId
      ? formatCarName(
          content?.cars?.find((c) => c.acId === carAcId)?.name,
          carAcId,
          labelMap,
        )
      : undefined;
    const trackName = trackAcId
      ? formatTrackName(
          content?.tracks?.find((t) => t.acId === trackAcId)?.name,
          trackAcId,
          labelMap,
        )
      : undefined;

    await this.agentGateway.emitLaunch(station.stationId, {
      sessionId: session.id,
      config: sessionConfig,
      carName,
      trackName,
    });
    return session;
  }

  @Post(':id/stop')
  @Roles(UserRole.ADMIN)
  async stop(@Param('id') id: string) {
    const station = await this.stationsService.findOne(id);
    await this.agentGateway.emitStop(station.stationId);
    return { success: true };
  }

  @Post(':id/update-agent')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  async updateAgent(@Param('id') id: string) {
    const station = await this.stationsService.findOne(id);
    await this.agentGateway.emitUpdateAgent(station.stationId);
    return { success: true };
  }

  @Post(':id/sync-content')
  @Roles(UserRole.ADMIN)
  async syncContent(@Param('id') id: string) {
    const station = await this.stationsService.findOne(id);
    await this.agentGateway.emitContentSync(station.stationId);
    return { success: true };
  }

  @Get(':id/logs')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  async getLogs(@Param('id') id: string) {
    const station = await this.stationsService.findOne(id);
    const lines = await this.agentGateway.requestLogs(station.stationId);
    return { lines };
  }
}
