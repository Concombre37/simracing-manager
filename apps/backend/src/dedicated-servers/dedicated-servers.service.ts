import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateDedicatedServerDto } from './dto/create-dedicated-server.dto';
import { UpdateDedicatedServerDto } from './dto/update-dedicated-server.dto';

const serverInclude = { station: true } as const;

type DedicatedServerWithStation = Prisma.DedicatedServerGetPayload<{
  include: typeof serverInclude;
}>;

@Injectable()
export class DedicatedServersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateDedicatedServerDto,
  ): Promise<DedicatedServerWithStation> {
    const station = await this.prisma.station.findUnique({
      where: { id: dto.stationId },
    });
    if (!station) {
      throw new BadRequestException('Station not found');
    }

    return this.prisma.dedicatedServer.create({
      data: {
        name: dto.name,
        stationId: dto.stationId,
        track: dto.track,
        trackLayout: dto.trackLayout,
        cars: dto.cars,
        maxClients: dto.maxClients,
        password: dto.password,
        rconPassword: dto.rconPassword,
        config: {
          track: dto.track,
          trackLayout: dto.trackLayout,
          cars: dto.cars,
          maxClients: dto.maxClients,
          password: dto.password,
          rconPassword: dto.rconPassword,
        } as Prisma.InputJsonValue,
      },
      include: serverInclude,
    });
  }

  async findAll(): Promise<DedicatedServerWithStation[]> {
    return this.prisma.dedicatedServer.findMany({
      orderBy: { createdAt: 'desc' },
      include: serverInclude,
    });
  }

  async findOne(id: string): Promise<DedicatedServerWithStation> {
    const server = await this.prisma.dedicatedServer.findUnique({
      where: { id },
      include: serverInclude,
    });
    if (!server) {
      throw new NotFoundException('Dedicated server not found');
    }
    return server;
  }

  async update(
    id: string,
    dto: UpdateDedicatedServerDto,
  ): Promise<DedicatedServerWithStation> {
    await this.findOne(id);
    return this.prisma.dedicatedServer.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.track && { track: dto.track }),
        ...(dto.trackLayout !== undefined && { trackLayout: dto.trackLayout }),
        ...(dto.cars && { cars: dto.cars }),
        ...(dto.maxClients && { maxClients: dto.maxClients }),
        ...(dto.password !== undefined && { password: dto.password }),
        ...(dto.rconPassword !== undefined && {
          rconPassword: dto.rconPassword,
        }),
      },
      include: serverInclude,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.dedicatedServer.delete({ where: { id } });
  }

  async updateStatus(
    id: string,
    status: string,
    extra?: {
      serverDir?: string;
      error?: string;
      udpPort?: number;
      tcpPort?: number;
      httpPort?: number;
    },
  ): Promise<DedicatedServerWithStation> {
    const data: Prisma.DedicatedServerUpdateInput = { status };
    if (status === 'running') {
      data.startedAt = new Date();
      if (extra?.serverDir) data.serverDir = extra.serverDir;
      if (extra?.udpPort) data.udpPort = extra.udpPort;
      if (extra?.tcpPort) data.tcpPort = extra.tcpPort;
      if (extra?.httpPort) data.httpPort = extra.httpPort;
    } else if (status === 'stopped' || status === 'error') {
      data.endedAt = new Date();
    }
    return this.prisma.dedicatedServer.update({
      where: { id },
      data,
      include: serverInclude,
    });
  }
}
