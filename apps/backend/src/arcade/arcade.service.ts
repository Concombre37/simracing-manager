import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { CreateArcadeAttractionDto } from './dto/create-arcade-attraction.dto';
import { UpdateArcadeAttractionDto } from './dto/update-arcade-attraction.dto';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
// Les cartes arcade sur /tablet-menu ne dépassent jamais quelques centaines
// de px de large — même principe que BlankingMedia (voir son commentaire),
// juste une limite plus basse, ce contenu n'étant jamais affiché plein écran.
const MAX_IMAGE_DIMENSION = 1600;

export interface ArcadeAttractionSummary {
  id: string;
  name: string;
  players: string | null;
  kind: string | null;
  photoUrl: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ArcadeService {
  private readonly logger = new Logger(ArcadeService.name);

  constructor(private readonly prisma: PrismaService) {}

  private toSummary(row: {
    id: string;
    name: string;
    players: string | null;
    kind: string | null;
    photoMimeType: string | null;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }): ArcadeAttractionSummary {
    return {
      id: row.id,
      name: row.name,
      players: row.players,
      kind: row.kind,
      photoUrl: row.photoMimeType ? `/api/arcade/${row.id}/photo` : null,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async list(): Promise<ArcadeAttractionSummary[]> {
    const rows = await this.prisma.arcadeAttraction.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        players: true,
        kind: true,
        photoMimeType: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows.map((r) => this.toSummary(r));
  }

  private async findOrThrow(id: string) {
    const attraction = await this.prisma.arcadeAttraction.findUnique({
      where: { id },
    });
    if (!attraction) throw new NotFoundException('Attraction introuvable');
    return attraction;
  }

  async create(
    dto: CreateArcadeAttractionDto,
  ): Promise<ArcadeAttractionSummary> {
    const row = await this.prisma.arcadeAttraction.create({
      data: {
        name: dto.name,
        players: dto.players || null,
        kind: dto.kind || null,
        sortOrder: dto.sortOrder,
      },
    });
    return this.toSummary(row);
  }

  async update(
    id: string,
    dto: UpdateArcadeAttractionDto,
  ): Promise<ArcadeAttractionSummary> {
    await this.findOrThrow(id);
    const row = await this.prisma.arcadeAttraction.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.players !== undefined && { players: dto.players || null }),
        ...(dto.kind !== undefined && { kind: dto.kind || null }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });
    return this.toSummary(row);
  }

  async remove(id: string) {
    await this.findOrThrow(id);
    return this.prisma.arcadeAttraction.delete({ where: { id } });
  }

  async getPhoto(
    id: string,
  ): Promise<{ data: Buffer; mimeType: string } | null> {
    const row = await this.prisma.arcadeAttraction.findUnique({
      where: { id },
      select: { photo: true, photoMimeType: true },
    });
    if (!row?.photo || !row.photoMimeType) return null;
    return { data: row.photo, mimeType: row.photoMimeType };
  }

  async setPhoto(
    id: string,
    file: Express.Multer.File,
  ): Promise<ArcadeAttractionSummary> {
    await this.findOrThrow(id);
    this.validateFile(file);
    const data = await this.resizeIfNeeded(file.buffer, file.mimetype);
    const row = await this.prisma.arcadeAttraction.update({
      where: { id },
      data: { photo: data, photoMimeType: file.mimetype },
    });
    return this.toSummary(row);
  }

  async removePhoto(id: string): Promise<ArcadeAttractionSummary> {
    await this.findOrThrow(id);
    const row = await this.prisma.arcadeAttraction.update({
      where: { id },
      data: { photo: null, photoMimeType: null },
    });
    return this.toSummary(row);
  }

  private validateFile(file: Express.Multer.File): void {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Type de fichier non autorisé : ${file.mimetype}. Autorisés : ${ALLOWED_TYPES.join(', ')}`,
      );
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `Fichier trop volumineux : ${file.size} octets (max ${MAX_FILE_SIZE_BYTES})`,
      );
    }
  }

  private async resizeIfNeeded(
    buffer: Buffer,
    mimeType: string,
  ): Promise<Buffer> {
    try {
      const image = sharp(buffer);
      const { width, height } = await image.metadata();
      if (
        !width ||
        !height ||
        (width <= MAX_IMAGE_DIMENSION && height <= MAX_IMAGE_DIMENSION)
      ) {
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
        `Failed to resize arcade photo (${mimeType}), storing original: ${err}`,
      );
      return buffer;
    }
  }
}
