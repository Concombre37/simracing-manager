import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { DedicatedServersService } from './dedicated-servers.service';
import {
  createDedicatedServerSchema,
  CreateDedicatedServerDto,
} from './dto/create-dedicated-server.dto';
import {
  updateDedicatedServerSchema,
  UpdateDedicatedServerDto,
} from './dto/update-dedicated-server.dto';
import { joinServerSchema, JoinServerDto } from './dto/join-server.dto';
import { AgentGateway } from '../agent/agent.gateway';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@simracing/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('dedicated-servers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DedicatedServersController {
  private readonly logger = new Logger(DedicatedServersController.name);

  constructor(
    private readonly dedicatedServersService: DedicatedServersService,
    private readonly agentGateway: AgentGateway,
  ) {}

  @Post()
  @Roles(UserRole.ADMIN)
  async create(
    @Body(new ZodValidationPipe(createDedicatedServerSchema))
    dto: CreateDedicatedServerDto,
  ) {
    const server = await this.dedicatedServersService.create(dto);
    await this.agentGateway.emitLaunchDedicatedServer(
      server.station.stationId,
      {
        serverId: server.id,
        name: server.name,
        track: server.track,
        trackLayout: server.trackLayout,
        cars: server.cars,
        maxClients: server.maxClients,
        password: server.password,
        rconPassword: server.rconPassword,
      },
    );
    return this.dedicatedServersService.updateStatus(server.id, 'starting');
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  findAll() {
    return this.dedicatedServersService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  findOne(@Param('id') id: string) {
    return this.dedicatedServersService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateDedicatedServerSchema))
    dto: UpdateDedicatedServerDto,
  ) {
    return this.dedicatedServersService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  async remove(@Param('id') id: string) {
    const server = await this.dedicatedServersService.findOne(id);
    await this.agentGateway.emitStopDedicatedServer(server.station.stationId, {
      serverId: server.id,
    });
    return this.dedicatedServersService.remove(id);
  }

  @Post(':id/stop')
  @Roles(UserRole.ADMIN)
  async stop(@Param('id') id: string) {
    const server = await this.dedicatedServersService.findOne(id);
    await this.agentGateway.emitStopDedicatedServer(server.station.stationId, {
      serverId: server.id,
    });
    await this.dedicatedServersService.updateStatus(server.id, 'stopped');
    return { success: true };
  }

  @Post(':id/join')
  @Roles(UserRole.ADMIN)
  async join(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(joinServerSchema)) dto: JoinServerDto,
  ) {
    const server = await this.dedicatedServersService.findOne(id);
    const host = server.station.localIp ?? '127.0.0.1';
    const port = server.tcpPort ?? 9600;
    const httpPort = server.httpPort ?? 8081;

    for (const stationId of dto.stationIds) {
      this.logger.log(`Emitting server:join to station:${stationId}`);
      await this.agentGateway.emitJoinServer(stationId, {
        host,
        port,
        httpPort,
        password: server.password ?? undefined,
        carAcId: dto.carAcId,
        track: server.track,
        trackLayout: server.trackLayout ?? undefined,
        serverName: server.name,
      });
    }
    return { success: true };
  }
}
