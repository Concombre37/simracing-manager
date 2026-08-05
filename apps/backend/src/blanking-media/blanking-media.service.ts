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
/** Folder name for global (station-less) media on disk — not a valid UUID,
 * so it can never collide with a real station's own folder. */
const GLOBAL_DIR = '_global';

const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

// Only the idle waiting screen supports video slideshows and differs
// per-station; the launching screen (rotating background images) and the
// results screen (a single static logo) are both still images, identical
// on every pod, so they're stored as global (station-less) media.
const IMAGE_ONLY_CATEGORIES: BlankingMediaCategory[] = ['launching', 'results'];
const SINGLE_ITEM_CATEGORIES: BlankingMediaCategory[] = ['results'];
const GLOBAL_CATEGORIES: BlankingMediaCategory[] = ['launching', 'results'];

export interface BlankingMediaFile {
  id: string;
  stationId: string | null;
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
    return this.find(station.id, category);
  }

  async findGlobal(
    category: BlankingMediaCategory,
  ): Promise<BlankingMediaFile[]> {
    this.assertGlobalCategory(category);
    return this.find(null, category);
  }

  private async find(
    stationDbId: string | null,
    category: BlankingMediaCategory,
  ): Promise<BlankingMediaFile[]> {
    const media = await this.prisma.blankingMedia.findMany({
      where: { stationId: stationDbId, category },
      orderBy: { order: 'asc' },
    });
    return media.map((m) => this.toDto(m));
  }

  async upload(
    stationId: string,
    file: Express.Multer.File,
    category: BlankingMediaCategory = 'idle',
  ): Promise<BlankingMediaFile> {
    const station = await this.findStationByIdOrStationId(stationId);
    return this.saveMedia(station.id, station.stationId, file, category);
  }

  async uploadGlobal(
    file: Express.Multer.File,
    category: BlankingMediaCategory,
  ): Promise<BlankingMediaFile> {
    this.assertGlobalCategory(category);
    return this.saveMedia(null, null, file, category);
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
        await this.saveMedia(station.id, station.stationId, file, category);
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
    await this.reorderMedia(station.id, station.stationId, mediaIds, category);
  }

  async reorderGlobal(
    mediaIds: string[],
    category: BlankingMediaCategory,
  ): Promise<void> {
    this.assertGlobalCategory(category);
    await this.reorderMedia(null, null, mediaIds, category);
  }

  private async reorderMedia(
    stationDbId: string | null,
    businessStationId: string | null,
    mediaIds: string[],
    category: BlankingMediaCategory,
  ): Promise<void> {
    const media = await this.prisma.blankingMedia.findMany({
      where: { stationId: stationDbId, category },
    });

    const mediaIdsSet = new Set(media.map((m) => m.id));
    if (
      mediaIds.length !== media.length ||
      !mediaIds.every((id) => mediaIdsSet.has(id))
    ) {
      throw new BadRequestException('Invalid media IDs');
    }

    await this.prisma.$transaction(
      mediaIds.map((id, index) =>
        this.prisma.blankingMedia.update({
          where: { id },
          data: { order: index },
        }),
      ),
    );

    this.emitMediaUpdated(businessStationId);
  }

  async remove(stationId: string, mediaId: string): Promise<void> {
    const station = await this.findStationByIdOrStationId(stationId);

    const media = await this.prisma.blankingMedia.findFirst({
      where: { id: mediaId, stationId: station.id },
    });
    if (!media) {
      throw new NotFoundException('Media not found');
    }

    await this.removeMedia(station.id, station.stationId, media);
  }

  async removeGlobal(mediaId: string): Promise<void> {
    const media = await this.prisma.blankingMedia.findFirst({
      where: { id: mediaId, stationId: null },
    });
    if (!media) {
      throw new NotFoundException('Media not found');
    }

    await this.removeMedia(null, null, media);
  }

  private async removeMedia(
    stationDbId: string | null,
    businessStationId: string | null,
    media: { id: string; filename: string; mimeType: string; category: string },
  ): Promise<void> {
    await this.deleteMediaFile(stationDbId, media);

    // Compact remaining orders (scoped to the same station+category — order
    // is only meaningful within its own playlist/slot)
    const remaining = await this.prisma.blankingMedia.findMany({
      where: { stationId: stationDbId, category: media.category },
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

    this.emitMediaUpdated(businessStationId);
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
      media.stationId ?? GLOBAL_DIR,
      `${media.id}${ext}`,
    );
    return {
      path: filePath,
      mimeType: media.mimeType,
      filename: media.filename,
    };
  }

  private assertGlobalCategory(category: BlankingMediaCategory): void {
    if (!GLOBAL_CATEGORIES.includes(category)) {
      throw new BadRequestException(
        `Category "${category}" is per-station, not global. Use the station-scoped endpoint instead.`,
      );
    }
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

  private async saveMedia(
    stationDbId: string | null,
    businessStationId: string | null,
    file: Express.Multer.File,
    category: BlankingMediaCategory,
  ): Promise<BlankingMediaFile> {
    this.validateFile(file, category);

    // Categories like the results logo only ever hold a single file — a new
    // upload replaces whatever was there before instead of appending.
    if (SINGLE_ITEM_CATEGORIES.includes(category)) {
      const existing = await this.prisma.blankingMedia.findMany({
        where: { stationId: stationDbId, category },
      });
      for (const old of existing) {
        await this.deleteMediaFile(stationDbId, old);
      }
    }

    const maxOrderRow = await this.prisma.blankingMedia.findFirst({
      where: { stationId: stationDbId, category },
      orderBy: { order: 'desc' },
    });
    const nextOrder = (maxOrderRow?.order ?? -1) + 1;

    const ext =
      path.extname(file.originalname) || this.mimeToExt(file.mimetype);
    const id = randomUUID();
    const filename = `${id}${ext}`;
    const dir = path.join(UPLOAD_DIR, stationDbId ?? GLOBAL_DIR);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    await fs.writeFile(filePath, file.buffer);

    const media = await this.prisma.blankingMedia.create({
      data: {
        id,
        stationId: stationDbId,
        category,
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        order: nextOrder,
      },
    });

    this.emitMediaUpdated(businessStationId);

    return this.toDto(media);
  }

  private toDto(media: {
    id: string;
    stationId: string | null;
    category: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    order: number;
    createdAt: Date;
    updatedAt: Date;
  }): BlankingMediaFile {
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
    stationDbId: string | null,
    media: { id: string; filename: string; mimeType: string },
  ): Promise<void> {
    await this.prisma.blankingMedia.delete({ where: { id: media.id } });
    const ext = path.extname(media.filename) || this.mimeToExt(media.mimeType);
    const filePath = path.join(
      UPLOAD_DIR,
      stationDbId ?? GLOBAL_DIR,
      `${media.id}${ext}`,
    );
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

  /** Null stationId means global media — every connected agent needs to
   * resync, not just one station's room (see AgentGateway's listener). */
  private emitMediaUpdated(stationId: string | null): void {
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
