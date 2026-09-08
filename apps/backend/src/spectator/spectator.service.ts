import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const ALLOWED_TYPES = ['video/webm', 'video/mp4', 'video/quicktime'];
const MAX_SIZE_BYTES = 500 * 1024 * 1024;

export interface ScreenRecordingDto {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  createdAt: Date;
  playbackUrl: string;
  downloadUrl: string;
}

@Injectable()
export class SpectatorService {
  constructor(private readonly prisma: PrismaService) {}

  async listRecordings(): Promise<ScreenRecordingDto[]> {
    const recordings = await this.prisma.screenRecording.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        durationSeconds: true,
        createdAt: true,
      },
    });
    return recordings.map((recording) => this.toDto(recording));
  }

  async createRecording(
    file: Express.Multer.File,
    title: string | undefined,
    durationSeconds: number | undefined,
  ): Promise<ScreenRecordingDto> {
    if (!file) throw new BadRequestException('A recording file is required');
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported recording type. Allowed: ${ALLOWED_TYPES.join(', ')}`,
      );
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException('Recording is too large (maximum 500 MB)');
    }
    const normalizedTitle = (title ?? '').trim().slice(0, 160) || file.originalname;
    const safeDuration =
      durationSeconds != null && Number.isFinite(durationSeconds) && durationSeconds >= 0
        ? Math.min(durationSeconds, 24 * 60 * 60)
        : null;
    const recording = await this.prisma.screenRecording.create({
      data: {
        id: randomUUID(),
        title: normalizedTitle,
        fileName: file.originalname.slice(0, 255),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        durationSeconds: safeDuration,
        data: file.buffer,
      },
      select: {
        id: true,
        title: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        durationSeconds: true,
        createdAt: true,
      },
    });
    return this.toDto(recording);
  }

  async getFile(id: string): Promise<{ data: Buffer; mimeType: string; fileName: string }> {
    const recording = await this.prisma.screenRecording.findUnique({
      where: { id },
      select: { data: true, mimeType: true, fileName: true },
    });
    if (!recording) throw new NotFoundException('Recording not found');
    return { data: recording.data, mimeType: recording.mimeType, fileName: recording.fileName };
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.screenRecording.delete({ where: { id } });
    } catch {
      throw new NotFoundException('Recording not found');
    }
  }

  private toDto(recording: {
    id: string;
    title: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    durationSeconds: number | null;
    createdAt: Date;
  }): ScreenRecordingDto {
    return {
      ...recording,
      playbackUrl: `/api/spectator/recordings/${recording.id}/file`,
      downloadUrl: `/api/spectator/recordings/${recording.id}/file?download=1`,
    };
  }
}
