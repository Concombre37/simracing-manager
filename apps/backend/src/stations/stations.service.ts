import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
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
        role: dto.role,
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
        ...(dto.role && { role: dto.role }),
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

  async provision(
    stationId: string,
    stationName: string,
    version?: string,
  ): Promise<StationWithApiKey> {
    let station = await this.prisma.station.findUnique({
      where: { stationId },
    });

    const apiKey = this.generateApiKey();
    const apiKeyHash = this.hashApiKey(apiKey);

    if (station) {
      station = await this.prisma.station.update({
        where: { stationId },
        data: {
          apiKeyHash,
          name: stationName,
          version: version ?? station.version,
          status: StationStatus.ONLINE,
          lastSeenAt: new Date(),
        },
      });
    } else {
      station = await this.prisma.station.create({
        data: {
          stationId,
          name: stationName,
          apiKeyHash,
          version: version ?? null,
          status: StationStatus.ONLINE,
          config: {},
        },
      });
    }

    return {
      id: station.id,
      stationId: station.stationId,
      name: station.name,
      apiKey,
    };
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
        macAddress: payload.macAddress,
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

  async updateContent(stationId: string, content: Record<string, unknown>) {
    const station = await this.prisma.station.findUnique({
      where: { stationId },
    });
    if (!station) {
      throw new NotFoundException('Station not found');
    }

    const processed = await this.extractPreviews(station.id, content);

    return this.prisma.station.update({
      where: { stationId },
      data: { content: processed as Prisma.InputJsonValue },
    });
  }

  private async extractPreviews(
    stationDbId: string,
    content: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = { ...content };

    const cars = Array.isArray(content.cars) ? [...content.cars] : [];
    result.cars = await this.processInBatches(
      cars,
      async (car: Record<string, unknown>) => {
        const previewUrl = await this.upsertPreview(
          stationDbId,
          'car',
          String(car.acId ?? ''),
          String(car.name ?? ''),
          car.preview,
        );
        return { ...car, preview: previewUrl };
      },
      25,
    );

    const tracks = Array.isArray(content.tracks) ? [...content.tracks] : [];
    result.tracks = await this.processInBatches(
      tracks,
      async (track: Record<string, unknown>) => {
        const previewUrl = await this.upsertPreview(
          stationDbId,
          'track',
          String(track.acId ?? ''),
          String(track.name ?? ''),
          track.preview,
        );
        return { ...track, preview: previewUrl };
      },
      25,
    );

    return result;
  }

  private async processInBatches<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    batchSize: number,
  ): Promise<R[]> {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(processor));
      results.push(...batchResults);
    }
    return results;
  }

  private async upsertPreview(
    stationDbId: string,
    type: string,
    acId: string,
    name: string,
    preview: unknown,
  ): Promise<string | undefined> {
    if (typeof preview !== 'string' || !preview.startsWith('data:')) {
      return preview as string | undefined;
    }

    const parsed = parseDataUrl(preview);
    if (!parsed) return undefined;

    const existing = await this.prisma.contentPreview.findUnique({
      where: {
        stationId_type_acId: {
          stationId: stationDbId,
          type,
          acId,
        },
      },
    });

    const previewId =
      existing?.id ??
      (
        await this.prisma.contentPreview.create({
          data: {
            stationId: stationDbId,
            type,
            acId,
            name,
            data: parsed.data,
          },
        })
      ).id;

    if (existing && existing.data !== parsed.data) {
      await this.prisma.contentPreview.update({
        where: { id: existing.id },
        data: { data: parsed.data, name },
      });
    }

    return `/api/content/previews/${previewId}`;
  }

  private generateApiKey(): string {
    return `sk_${randomBytes(32).toString('hex')}`;
  }

  private hashApiKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }
}

function parseDataUrl(
  dataUrl: string,
): { mime: string; data: string } | undefined {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return undefined;
  const [, mime, data] = match;
  if (!mime || !data) return undefined;
  return { mime, data };
}
