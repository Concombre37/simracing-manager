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
import {
  joinServerSchema,
  JoinServerDto,
  JoinPodDto,
} from './dto/join-server.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ClientsService } from '../clients/clients.service';
import { AgentGateway } from '../agent/agent.gateway';
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

@Controller('dedicated-servers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DedicatedServersController {
  private readonly logger = new Logger(DedicatedServersController.name);

  constructor(
    private readonly dedicatedServersService: DedicatedServersService,
    private readonly agentGateway: AgentGateway,
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
    private readonly contentLabelsService: ContentLabelsService,
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
        udpPort: server.udpPort ?? undefined,
        tcpPort: server.tcpPort ?? undefined,
        httpPort: server.httpPort ?? undefined,
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

    // Resolved once for the whole call (same host content/labels for every
    // pod) so the agent's blanking screens (launching/results) can show
    // the customized display name instead of the raw acId — see
    // packages/shared/src/naming.ts for the exact same fallback logic
    // already used by the dashboard.
    const hostContent = server.station.content as StationContentShape | null;
    const labelMap = await this.contentLabelsService.getMap();
    const rawTrackName = hostContent?.tracks?.find(
      (t) => t.acId === server.track,
    )?.name;
    const trackName = formatTrackName(rawTrackName, server.track, labelMap);

    // Each pod's own optional `delaySeconds` (UI: SendPodsModal / JoinServer)
    // is honored by scheduling that pod's session-creation + server:join to
    // fire independently later, rather than blocking the whole loop — pods
    // sent together can still start at staggered real-world times instead
    // of all simultaneously.
    const launchPod = async (
      pod: JoinPodDto,
    ): Promise<{ sessionId: string; stationId: string } | null> => {
      const station = await this.prisma.station.findUnique({
        where: { stationId: pod.stationId },
      });
      if (!station) {
        this.logger.warn(`Station ${pod.stationId} not found, skipping`);
        return null;
      }
      if (station.role !== StationRole.SIMULATOR) {
        this.logger.warn(
          `Station ${pod.stationId} is not a simulator station, skipping join`,
        );
        return null;
      }

      const client = pod.clientName?.trim()
        ? await this.clientsService.findOrCreateByName(pod.clientName)
        : null;

      const session = await this.prisma.session.create({
        data: {
          stationId: station.id,
          type: 'dedicated_join',
          serverId: id,
          clientId: client?.id ?? null,
          clientName: client?.name ?? pod.clientName ?? null,
          difficulty: pod.difficulty ?? null,
          gearbox: pod.gearbox ?? null,
          carAcId: pod.carAcId,
          track: server.track,
          trackLayout: server.trackLayout,
          durationMinutes: dto.durationMinutes ?? null,
          config: {},
          status: 'running',
          startedAt: new Date(),
        },
      });

      const rawCarName = hostContent?.cars?.find(
        (c) => c.acId === pod.carAcId,
      )?.name;
      const carName = formatCarName(rawCarName, pod.carAcId, labelMap);

      this.logger.log(`Emitting server:join to station:${pod.stationId}`);
      await this.agentGateway.emitJoinServer(pod.stationId, {
        host,
        port,
        httpPort,
        password: server.password ?? undefined,
        carAcId: pod.carAcId,
        carName,
        track: server.track,
        trackName,
        trackLayout: server.trackLayout ?? undefined,
        serverName: server.name,
        durationMinutes: dto.durationMinutes,
        clientName: pod.clientName,
        difficulty: pod.difficulty,
        gearbox: pod.gearbox,
        sessionId: session.id,
      });

      return { sessionId: session.id, stationId: pod.stationId };
    };

    const sessions: { sessionId: string; stationId: string }[] = [];

    for (const pod of dto.pods) {
      const delayMs = (pod.delaySeconds ?? 0) * 1000;
      if (delayMs > 0) {
        this.logger.log(
          `Scheduling server:join to station:${pod.stationId} in ${pod.delaySeconds}s`,
        );
        setTimeout(() => {
          launchPod(pod).catch((err) =>
            this.logger.error(
              `Delayed join failed for station ${pod.stationId}: ${err}`,
            ),
          );
        }, delayMs);
        continue;
      }
      const result = await launchPod(pod);
      if (result) sessions.push(result);
    }

    // Pods with a delaySeconds > 0 are scheduled but not yet started when
    // this responds — their sessions aren't in this array yet, they'll show
    // up via the normal active-sessions polling once their timer fires.
    return { success: true, sessions };
  }
}
