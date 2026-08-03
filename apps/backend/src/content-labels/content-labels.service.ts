import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertContentLabelDto } from './dto/upsert-content-label.dto';

interface RawContentItem {
  type: 'car' | 'track';
  acId: string;
  rawName: string;
}

interface StationContentShape {
  cars?: { acId: string; name?: string }[];
  tracks?: { acId: string; name?: string }[];
}

export interface KnownContentItem {
  type: 'car' | 'track';
  acId: string;
  rawName: string;
  displayName: string | null;
  labelId: string | null;
}

@Injectable()
export class ContentLabelsService {
  constructor(private readonly prisma: PrismaService) {}

  async getKnown(): Promise<KnownContentItem[]> {
    const stations = await this.prisma.station.findMany({
      select: { content: true },
    });

    const rawByKey = new Map<string, RawContentItem>();
    for (const station of stations) {
      const content = station.content as StationContentShape | null;
      for (const car of content?.cars ?? []) {
        if (!car.acId) continue;
        rawByKey.set(`car:${car.acId}`, {
          type: 'car',
          acId: car.acId,
          rawName: car.name?.trim() || car.acId,
        });
      }
      for (const track of content?.tracks ?? []) {
        if (!track.acId) continue;
        rawByKey.set(`track:${track.acId}`, {
          type: 'track',
          acId: track.acId,
          rawName: track.name?.trim() || track.acId,
        });
      }
    }

    const labels = await this.prisma.contentLabel.findMany();
    const labelByKey = new Map(labels.map((l) => [`${l.type}:${l.acId}`, l]));

    return Array.from(rawByKey.values())
      .map((item) => {
        const label = labelByKey.get(`${item.type}:${item.acId}`);
        return {
          type: item.type,
          acId: item.acId,
          rawName: item.rawName,
          displayName: label?.displayName ?? null,
          labelId: label?.id ?? null,
        };
      })
      .sort((a, b) => {
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        return a.rawName.localeCompare(b.rawName);
      });
  }

  async getMap(): Promise<{
    car: Record<string, string>;
    track: Record<string, string>;
  }> {
    const labels = await this.prisma.contentLabel.findMany();
    const map: { car: Record<string, string>; track: Record<string, string> } =
      {
        car: {},
        track: {},
      };
    for (const label of labels) {
      map[label.type as 'car' | 'track'][label.acId] = label.displayName;
    }
    return map;
  }

  async upsert(dto: UpsertContentLabelDto) {
    const displayName = dto.displayName.trim();
    if (!displayName) {
      await this.prisma.contentLabel.deleteMany({
        where: { type: dto.type, acId: dto.acId },
      });
      return null;
    }
    return this.prisma.contentLabel.upsert({
      where: { type_acId: { type: dto.type, acId: dto.acId } },
      create: { type: dto.type, acId: dto.acId, displayName },
      update: { displayName },
    });
  }
}
