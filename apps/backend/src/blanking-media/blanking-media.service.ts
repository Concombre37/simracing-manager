import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BlankingMediaCategory } from '@simracing/shared';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'blanking-media');

const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

// Only the idle waiting screen supports video slideshows; the launching
// screen (rotating background images) and the results screen (a single
// static logo) are both still images rendered under HTML text overlays.
const IMAGE_ONLY_CATEGORIES: BlankingMediaCategory[] = ['launching', 'results'];
const SINGLE_ITEM_CATEGORIES: BlankingMediaCategory[] = ['results'];

export interface BlankingMediaFile {
  id: string;
  stationId: string;
  category: BlankingMediaCategory;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  order: number;
  downloadUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class BlankingMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findByStation(
    stationId: string,
    category: BlankingMediaCategory = 'idle',
  ): Promise<BlankingMediaFile[]> {
    const station = await this.findStationByIdOrStationId(stationId);

    const media = await this.prisma.blankingMedia.findMany({
      where: { stationId: station.id, category },
      orderBy: { order: 'asc' },
    });

    return media.map((m) => ({
      id: m.id,
      stationId: m.stationId,
      category: m.category as BlankingMediaCategory,
      filename: m.filename,
      mimeType: m.mimeType,
      sizeBytes: m.sizeBytes,
      order: m.order,
      downloadUrl: `/api/blanking-media/${m.id}/download`,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    }));
  }

  async upload(
    stationId: string,
    file: Express.Multer.File,
    category: BlankingMediaCategory = 'idle',
  ): Promise<BlankingMediaFile> {
    const station = await this.findStationByIdOrStationId(stationId);
    return this.saveMediaForStation(station, file, category);
  }

  async uploadToStations(
    stationIds: string[],
    file: Express.Multer.File,
    category: BlankingMediaCategory = 'idle',
  ): Promise<{
    success: number;
    failed: { stationId: string; reason: string }[];
  }> {
    this.validateFile(file, category);

    const stations = await this.prisma.station.findMany({
      where: { id: { in: stationIds } },
    });

    const foundIds = new Set(stations.map((s) => s.id));
    const failed: { stationId: string; reason: string }[] = [];

    for (const id of stationIds) {
      if (!foundIds.has(id)) {
        failed.push({ stationId: id, reason: 'Station not found' });
      }
    }

    let success = 0;
    for (const station of stations) {
      try {
        await this.saveMediaForStation(station, file, category);
        success++;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        failed.push({ stationId: station.id, reason: message });
      }
    }

    return { success, failed };
  }

  async reorder(
    stationId: string,
    mediaIds: string[],
    category: BlankingMediaCategory = 'idle',
  ): Promise<void> {
    const station = await this.findStationByIdOrStationId(stationId);

    const media = await this.prisma.blankingMedia.findMany({
      where: { stationId: station.id, category },
    });

    const mediaIdsSet = new Set(media.map((m) => m.id));
    if (
      mediaIds.length !== media.length ||
      !mediaIds.every((id) => mediaIdsSet.has(id))
    ) {
      throw new BadRequestException('Invalid media IDs for station');
    }

    await this.prisma.$transaction(
      mediaIds.map((id, index) =>
        this.prisma.blankingMedia.update({
          where: { id },
          data: { order: index },
        }),
      ),
    );

    this.emitMediaUpdated(station.stationId);
  }

  async remove(stationId: string, mediaId: string): Promise<void> {
    const station = await this.findStationByIdOrStationId(stationId);

    const media = await this.prisma.blankingMedia.findFirst({
      where: { id: mediaId, stationId: station.id },
    });
    if (!media) {
      throw new NotFoundException('Media not found');
    }

    await this.prisma.blankingMedia.delete({ where: { id: mediaId } });

    const ext = path.extname(media.filename) || this.mimeToExt(media.mimeType);
    const filePath = path.join(UPLOAD_DIR, station.id, `${media.id}${ext}`);
    try {
      await fs.unlink(filePath);
    } catch {
      // Ignore cleanup errors
    }

    // Compact remaining orders (scoped to the same category — order is
    // only meaningful within a category's own playlist/slot)
    const remaining = await this.prisma.blankingMedia.findMany({
      where: { stationId: station.id, category: media.category },
      orderBy: { order: 'asc' },
    });
    await this.prisma.$transaction(
      remaining.map((m, index) =>
        this.prisma.blankingMedia.update({
          where: { id: m.id },
          data: { order: index },
        }),
      ),
    );

    this.emitMediaUpdated(station.stationId);
  }

  async getFilePath(
    mediaId: string,
  ): Promise<{ path: string; mimeType: string; filename: string }> {
    const media = await this.prisma.blankingMedia.findUnique({
      where: { id: mediaId },
    });
    if (!media) {
      throw new NotFoundException('Media not found');
    }

    const ext = path.extname(media.filename) || this.mimeToExt(media.mimeType);
    const filePath = path.join(
      UPLOAD_DIR,
      media.stationId,
      `${media.id}${ext}`,
    );
    return {
      path: filePath,
      mimeType: media.mimeType,
      filename: media.filename,
    };
  }

  private validateFile(
    file: Express.Multer.File,
    category: BlankingMediaCategory,
  ): void {
    const allowedTypes = IMAGE_ONLY_CATEGORIES.includes(category)
      ? ALLOWED_IMAGE_TYPES
      : ALLOWED_TYPES;
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type not allowed: ${file.mimetype}. Allowed: ${allowedTypes.join(', ')}`,
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File too large: ${file.size} bytes (max ${MAX_FILE_SIZE_BYTES} bytes)`,
      );
    }
  }

  private async saveMediaForStation(
    station: { id: string; stationId: string },
    file: Express.Multer.File,
    category: BlankingMediaCategory,
  ): Promise<BlankingMediaFile> {
    this.validateFile(file, category);

    // Categories like the results logo only ever hold a single file — a new
    // upload replaces whatever was there before instead of appending.
    if (SINGLE_ITEM_CATEGORIES.includes(category)) {
      const existing = await this.prisma.blankingMedia.findMany({
        where: { stationId: station.id, category },
      });
      for (const old of existing) {
        await this.deleteMediaFile(station.id, old);
      }
    }

    const maxOrderRow = await this.prisma.blankingMedia.findFirst({
      where: { stationId: station.id, category },
      orderBy: { order: 'desc' },
    });
    const nextOrder = (maxOrderRow?.order ?? -1) + 1;

    const ext =
      path.extname(file.originalname) || this.mimeToExt(file.mimetype);
    const id = randomUUID();
    const filename = `${id}${ext}`;
    const dir = path.join(UPLOAD_DIR, station.id);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    await fs.writeFile(filePath, file.buffer);

    const media = await this.prisma.blankingMedia.create({
      data: {
        id,
        stationId: station.id,
        category,
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        order: nextOrder,
      },
    });

    this.emitMediaUpdated(station.stationId);

    return {
      id: media.id,
      stationId: media.stationId,
      category: media.category as BlankingMediaCategory,
      filename: media.filename,
      mimeType: media.mimeType,
      sizeBytes: media.sizeBytes,
      order: media.order,
      downloadUrl: `/api/blanking-media/${media.id}/download`,
      createdAt: media.createdAt,
      updatedAt: media.updatedAt,
    };
  }

  private async deleteMediaFile(
    stationDbId: string,
    media: { id: string; filename: string; mimeType: string },
  ): Promise<void> {
    await this.prisma.blankingMedia.delete({ where: { id: media.id } });
    const ext = path.extname(media.filename) || this.mimeToExt(media.mimeType);
    const filePath = path.join(UPLOAD_DIR, stationDbId, `${media.id}${ext}`);
    try {
      await fs.unlink(filePath);
    } catch {
      // Ignore cleanup errors
    }
  }

  private async findStationByIdOrStationId(id: string) {
    if (this.isUuid(id)) {
      const station = await this.prisma.station.findUnique({
        where: { id },
      });
      if (station) return station;
    }

    const station = await this.prisma.station.findUnique({
      where: { stationId: id },
    });
    if (!station) {
      throw new NotFoundException('Station not found');
    }
    return station;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      value,
    );
  }

  private emitMediaUpdated(stationId: string): void {
    this.eventEmitter.emit('blanking.mediaUpdated', { stationId });
  }

  private mimeToExt(mimeType: string): string {
    switch (mimeType) {
      case 'image/png':
        return '.png';
      case 'image/jpeg':
      case 'image/jpg':
        return '.jpg';
      case 'image/webp':
        return '.webp';
      case 'video/mp4':
        return '.mp4';
      case 'video/webm':
        return '.webm';
      default:
        return '';
    }
  }
}
