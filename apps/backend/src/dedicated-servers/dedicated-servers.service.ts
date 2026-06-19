import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as net from 'net';
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
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        dto.stationId,
      );
    let station = isUuid
      ? await this.prisma.station.findUnique({ where: { id: dto.stationId } })
      : null;
    if (!station) {
      station = await this.prisma.station.findUnique({
        where: { stationId: dto.stationId },
      });
    }
    if (!station) {
      throw new BadRequestException('Station not found');
    }

    const usedPorts = await this.getUsedPorts();
    const mainPort = await findAvailablePort(9600, 9700, usedPorts);
    const httpPort = await findAvailablePort(8081, 8181, usedPorts);

    return this.prisma.dedicatedServer.create({
      data: {
        name: dto.name,
        stationId: station.id,
        track: dto.track,
        trackLayout: dto.trackLayout,
        cars: dto.cars,
        maxClients: dto.maxClients,
        password: dto.password,
        rconPassword: dto.rconPassword,
        udpPort: mainPort,
        tcpPort: mainPort,
        httpPort,
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

  private async getUsedPorts(): Promise<Set<number>> {
    const servers = await this.prisma.dedicatedServer.findMany({
      where: {
        OR: [
          { udpPort: { not: null } },
          { tcpPort: { not: null } },
          { httpPort: { not: null } },
        ],
      },
    });
    const ports = new Set<number>();
    for (const server of servers) {
      if (server.udpPort) ports.add(server.udpPort);
      if (server.tcpPort) ports.add(server.tcpPort);
      if (server.httpPort) ports.add(server.httpPort);
    }
    return ports;
  }
}

function isTcpPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '0.0.0.0');
  });
}

async function findAvailablePort(
  start: number,
  end: number,
  usedPorts: Set<number>,
): Promise<number> {
  for (let port = start; port <= end; port++) {
    if (usedPorts.has(port)) continue;
    if (await isTcpPortAvailable(port)) return port;
  }
  throw new Error(`Aucun port libre trouvé entre ${start} et ${end}`);
}
