import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
// Bug réel trouvé en 2026-08-22 en déboguant la conversion WebP de
// /tablet-menu : `sharp` exporte via `export =`, pas de default export ESM
// — sans esModuleInterop (absent de tsconfig.json ici), `import sharp from
// 'sharp'` compile en un appel `sharp_1.default(...)` qui vaut `undefined`
// à l'exécution. Le try/catch de resizeImageIfNeeded() avalait ce
// TypeError en silence depuis l'introduction de cette méthode (v2.2.95) :
// le redimensionnement des images de blanking surdimensionnées ne s'est
// donc jamais exécuté, sans aucun symptôme visible (juste jamais optimisé).
// `import sharp = require(...)` corrige l'exécution, mais TS résout quand
// même les mauvaises déclarations (ESM) faute de moduleResolution
// "node16"/"bundler" dans tsconfig.json (voir commentaire détaillé dans
// image-optimizer.ts) — d'où le retypage local minimal ci-dessous plutôt
// qu'un changement de config TS global hors du cadre de cette tâche.
import sharpRuntime = require('sharp');

interface MinimalSharp {
  metadata(): Promise<{ width?: number; height?: number }>;
  resize(
    width: number,
    height: number,
    options: { fit: 'inside'; withoutEnlargement: boolean },
  ): MinimalSharp;
  toBuffer(): Promise<Buffer>;
}

const sharp = sharpRuntime as unknown as (buffer: Buffer) => MinimalSharp;
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BlankingMediaCategory } from '@simracing/shared';

const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
/** Launching/results images are rendered full-bleed ("cover") inside a
 * WPF WebBrowser control locked to the IE11 engine — a legacy
 * software-ish rasterizer that has to decode and alpha-blend every stacked
 * background layer on each crossfade frame (see blankingManager.ts's
 * renderSlideshowStyles()). Raw uploads (camera/wallpaper-site photos,
 * sometimes several MB at native 5120x1440+) turned that into a real
 * stutter independent of the CSS transition itself. Capping the longest
 * edge here keeps every upload well above any known POD's physical
 * resolution (1920x1080) while staying far cheaper to decode/blend. */
const MAX_IMAGE_DIMENSION = 2560;

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
  private readonly logger = new Logger(BlankingMediaService.name);

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
    media: { id: string; category: string },
  ): Promise<void> {
    await this.prisma.blankingMedia.delete({ where: { id: media.id } });

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

  async getFileData(
    mediaId: string,
  ): Promise<{ data: Buffer; mimeType: string; filename: string }> {
    const media = await this.prisma.blankingMedia.findUnique({
      where: { id: mediaId },
    });
    if (!media) {
      throw new NotFoundException('Media not found');
    }

    return {
      data: media.data,
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

  /** Downscales an oversized image so neither dimension exceeds
   * MAX_IMAGE_DIMENSION, preserving aspect ratio and the original format
   * (no forced re-encode to JPEG — keeps PNG/WebP transparency intact for
   * whatever future use might need it). A no-op for videos, already
   * small-enough images, or anything sharp fails to decode — a bad/unusual
   * file should never block the upload itself, it just skips the
   * optimization and stores the original bytes as before. */
  private async resizeImageIfNeeded(
    buffer: Buffer,
    mimeType: string,
  ): Promise<Buffer> {
    if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
      return buffer;
    }
    try {
      const image = sharp(buffer);
      const { width, height } = await image.metadata();
      if (!width || !height) {
        return buffer;
      }
      if (width <= MAX_IMAGE_DIMENSION && height <= MAX_IMAGE_DIMENSION) {
        return buffer;
      }
      return await image
        .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .toBuffer();
    } catch (err) {
      this.logger.warn(
        `Failed to resize blanking media image, storing original: ${err}`,
      );
      return buffer;
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
      await this.prisma.blankingMedia.deleteMany({
        where: { stationId: stationDbId, category },
      });
    }

    const maxOrderRow = await this.prisma.blankingMedia.findFirst({
      where: { stationId: stationDbId, category },
      orderBy: { order: 'desc' },
    });
    const nextOrder = (maxOrderRow?.order ?? -1) + 1;

    const id = randomUUID();
    const data = await this.resizeImageIfNeeded(file.buffer, file.mimetype);

    const media = await this.prisma.blankingMedia.create({
      data: {
        id,
        stationId: stationDbId,
        category,
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: data.length,
        data,
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
}
