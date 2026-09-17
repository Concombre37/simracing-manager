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
  BadRequestException,
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
import { RaceFormatsService } from '../race-formats/race-formats.service';

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
    private readonly raceFormatsService: RaceFormatsService,
  ) {}

  @Post()
  @Roles(UserRole.ADMIN)
  async create(
    @Body(new ZodValidationPipe(createDedicatedServerSchema))
    dto: CreateDedicatedServerDto,
  ) {
    const server = await this.dedicatedServersService.create(dto);
    // Always present: create() rejects an unknown/missing raceFormatId
    // before the server row is even written (see RaceFormatsService.findOne).
    const raceFormat = this.raceFormatsService.toConfig(server.raceFormat!);
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
        raceFormat,
      },
    );
    return this.dedicatedServersService.updateStatus(server.id, 'starting');
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  findAll() {
    return this.dedicatedServersService.findAll();
  }

  @Get('spectate-status')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  getSpectateStatus() {
    return this.prisma.spectatorAssignment.findMany({
      orderBy: { startedAt: 'asc' },
      include: {
        station: { select: { id: true, stationId: true, name: true, status: true } },
        server: {
          select: { id: true, name: true, track: true, trackLayout: true, status: true },
        },
      },
    });
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

    const sessions: { sessionId: string; stationId: string }[] = [];

    for (const pod of dto.pods) {
      const station = await this.prisma.station.findUnique({
        where: { stationId: pod.stationId },
      });
      if (!station) {
        this.logger.warn(`Station ${pod.stationId} not found, skipping`);
        continue;
      }
      if (station.role !== StationRole.SIMULATOR) {
        this.logger.warn(
          `Station ${pod.stationId} is not a simulator station, skipping join`,
        );
        continue;
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
          durationMinutes: pod.durationMinutes ?? null,
          config: {},
          status: 'running',
          // startedAt intentionally left unset: the frontend countdown only
          // starts once the agent confirms the player can actually drive
          // (agent:session:started, handled in AgentGateway), not at join
          // time — the loading screen shouldn't silently eat into the
          // session's duration. Sessions.tsx already treats a null
          // startedAt as "no countdown yet" everywhere it's read.
        },
      });

      sessions.push({ sessionId: session.id, stationId: pod.stationId });

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
        durationMinutes: pod.durationMinutes,
        clientName: pod.clientName,
        difficulty: pod.difficulty,
        gearbox: pod.gearbox,
        sessionId: session.id,
      });
    }

    return { success: true, sessions };
  }

  /**
   * Sends one configured spectator station to a running dedicated server.
   *
   * A spectator deliberately has no Session row: it is a capture source,
   * not a driver. This prevents its laps or race_out.json from polluting the
   * customer leaderboard while still letting the Windows agent launch AC and
   * start its automatic FFmpeg capture.
   */
  @Post(':id/spectate')
  @Roles(UserRole.ADMIN)
  async spectate(@Param('id') id: string) {
    const server = await this.dedicatedServersService.findOne(id);
    if (server.status !== 'running') {
      throw new BadRequestException('The dedicated server is not running');
    }

    // CAR_0 in the generated entry list is always the first configured car.
    // Keeping this choice deterministic gives the spectator its dedicated,
    // predictable vehicle on the 11-slot server instead of a random car.
    const carAcId = server.cars[0];
    if (!carAcId) {
      throw new BadRequestException('The dedicated server has no configured car');
    }

    const connected = new Set(this.agentGateway.getConnectedStationIds());
    const spectators = await this.prisma.station.findMany({
      where: { role: StationRole.SPECTATOR },
      orderBy: { createdAt: 'asc' },
    });
    const spectator = spectators.find((station) => connected.has(station.stationId));
    if (!spectator) {
      throw new BadRequestException('No spectator station is online');
    }

    const host = server.station.localIp ?? '127.0.0.1';
    const labelMap = await this.contentLabelsService.getMap();
    const hostContent = server.station.content as StationContentShape | null;
    const carName = formatCarName(
      hostContent?.cars?.find((car) => car.acId === carAcId)?.name,
      carAcId,
      labelMap,
    );
    const trackName = formatTrackName(
      hostContent?.tracks?.find((track) => track.acId === server.track)?.name,
      server.track,
      labelMap,
    );

    await this.agentGateway.emitJoinServer(spectator.stationId, {
      host,
      port: server.tcpPort ?? 9600,
      httpPort: server.httpPort ?? 8081,
      password: server.password ?? undefined,
      carAcId,
      carName,
      track: server.track,
      trackName,
      trackLayout: server.trackLayout ?? undefined,
      serverName: server.name,
      clientName: 'Spectateur',
      // No sessionId on purpose: this is a live capture, not a player's
      // session. The agent still opens AC and starts live capture.
    });

    await this.prisma.spectatorAssignment.upsert({
      where: { stationId: spectator.id },
      create: { stationId: spectator.id, serverId: server.id, carAcId },
      update: { serverId: server.id, carAcId, startedAt: new Date() },
    });

    return {
      success: true,
      spectatorStationId: spectator.stationId,
      carAcId,
      reservedSlot: 1,
    };
  }

  @Post('spectate/stop')
  @Roles(UserRole.ADMIN)
  async stopSpectating(@Body() body: { assignmentId?: string }) {
    const assignmentId = String(body.assignmentId ?? '').trim();
    if (!assignmentId) throw new BadRequestException('Spectator assignment is required');
    const assignment = await this.prisma.spectatorAssignment.findUnique({
      where: { id: assignmentId },
      include: { station: true },
    });
    if (!assignment) throw new BadRequestException('Spectator assignment not found');

    await this.agentGateway.emitStop(assignment.station.stationId);
    await this.prisma.spectatorAssignment.delete({ where: { id: assignment.id } });
    return { success: true, spectatorStationId: assignment.station.stationId };
  }
}
