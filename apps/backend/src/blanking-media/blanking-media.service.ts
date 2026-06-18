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

export interface BlankingMediaFile {
  id: string;
  stationId: string;
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

  async findByStation(stationId: string): Promise<BlankingMediaFile[]> {
    const station = await this.prisma.station.findUnique({
      where: { id: stationId },
    });
    if (!station) {
      throw new NotFoundException('Station not found');
    }

    const media = await this.prisma.blankingMedia.findMany({
      where: { stationId },
      orderBy: { order: 'asc' },
    });

    return media.map((m) => ({
      id: m.id,
      stationId: m.stationId,
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
  ): Promise<BlankingMediaFile> {
    const station = await this.prisma.station.findUnique({
      where: { id: stationId },
    });
    if (!station) {
      throw new NotFoundException('Station not found');
    }

    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type not allowed: ${file.mimetype}. Allowed: ${ALLOWED_TYPES.join(', ')}`,
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File too large: ${file.size} bytes (max ${MAX_FILE_SIZE_BYTES} bytes)`,
      );
    }

    const maxOrderRow = await this.prisma.blankingMedia.findFirst({
      where: { stationId },
      orderBy: { order: 'desc' },
    });
    const nextOrder = (maxOrderRow?.order ?? -1) + 1;

    const ext =
      path.extname(file.originalname) || this.mimeToExt(file.mimetype);
    const id = randomUUID();
    const filename = `${id}${ext}`;
    const dir = path.join(UPLOAD_DIR, stationId);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    await fs.writeFile(filePath, file.buffer);

    const media = await this.prisma.blankingMedia.create({
      data: {
        id,
        stationId,
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
      filename: media.filename,
      mimeType: media.mimeType,
      sizeBytes: media.sizeBytes,
      order: media.order,
      downloadUrl: `/api/blanking-media/${media.id}/download`,
      createdAt: media.createdAt,
      updatedAt: media.updatedAt,
    };
  }

  async reorder(stationId: string, mediaIds: string[]): Promise<void> {
    const station = await this.prisma.station.findUnique({
      where: { id: stationId },
    });
    if (!station) {
      throw new NotFoundException('Station not found');
    }

    const media = await this.prisma.blankingMedia.findMany({
      where: { stationId },
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
    const station = await this.prisma.station.findUnique({
      where: { id: stationId },
    });
    if (!station) {
      throw new NotFoundException('Station not found');
    }

    const media = await this.prisma.blankingMedia.findFirst({
      where: { id: mediaId, stationId },
    });
    if (!media) {
      throw new NotFoundException('Media not found');
    }

    await this.prisma.blankingMedia.delete({ where: { id: mediaId } });

    const ext = path.extname(media.filename) || this.mimeToExt(media.mimeType);
    const filePath = path.join(UPLOAD_DIR, stationId, `${media.id}${ext}`);
    try {
      await fs.unlink(filePath);
    } catch {
      // Ignore cleanup errors
    }

    // Compact remaining orders
    const remaining = await this.prisma.blankingMedia.findMany({
      where: { stationId },
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
