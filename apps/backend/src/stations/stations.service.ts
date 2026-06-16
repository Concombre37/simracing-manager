import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateStationDto, UpdateStationDto } from './dto';
import { HeartbeatPayload, StationStatus } from '@simracing/shared';

export interface StationWithApiKey {
  id: string;
  stationId: string;
  name: string;
  apiKey: string;
}

@Injectable()
export class StationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateStationDto): Promise<StationWithApiKey> {
    const existing = await this.prisma.station.findUnique({
      where: { stationId: dto.stationId },
    });
    if (existing) {
      throw new ConflictException('Station ID already exists');
    }

    const apiKey = this.generateApiKey();
    const station = await this.prisma.station.create({
      data: {
        stationId: dto.stationId,
        name: dto.name,
        apiKeyHash: this.hashApiKey(apiKey),
        config: (dto.config ?? {}) as Prisma.InputJsonValue,
      },
    });

    return {
      id: station.id,
      stationId: station.stationId,
      name: station.name,
      apiKey,
    };
  }

  async findAll() {
    return this.prisma.station.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const station = await this.prisma.station.findUnique({ where: { id } });
    if (!station) {
      throw new NotFoundException('Station not found');
    }
    return station;
  }

  async findByStationId(stationId: string) {
    return this.prisma.station.findUnique({ where: { stationId } });
  }

  async update(id: string, dto: UpdateStationDto) {
    await this.findOne(id);
    return this.prisma.station.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.config && { config: dto.config as Prisma.InputJsonValue }),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.station.delete({ where: { id } });
  }

  async regenerateApiKey(id: string): Promise<StationWithApiKey> {
    await this.findOne(id);
    const apiKey = this.generateApiKey();
    const station = await this.prisma.station.update({
      where: { id },
      data: { apiKeyHash: this.hashApiKey(apiKey) },
    });
    return {
      id: station.id,
      stationId: station.stationId,
      name: station.name,
      apiKey,
    };
  }

  async validateApiKey(apiKey: string) {
    const hash = this.hashApiKey(apiKey);
    return this.prisma.station.findFirst({ where: { apiKeyHash: hash } });
  }

  async updateHeartbeat(payload: HeartbeatPayload) {
    const status = payload.acRunning
      ? StationStatus.IN_GAME
      : StationStatus.ONLINE;
    return this.prisma.station.update({
      where: { stationId: payload.stationId },
      data: {
        name: payload.stationName,
        version: payload.version,
        localIp: payload.localIp,
        lastSeenAt: new Date(payload.timestamp),
        status,
      },
    });
  }

  async updateStatus(stationId: string, status: StationStatus) {
    return this.prisma.station.update({
      where: { stationId },
      data: { status, lastSeenAt: new Date() },
    });
  }

  private generateApiKey(): string {
    return `sk_${randomBytes(32).toString('hex')}`;
  }

  private hashApiKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }
}
