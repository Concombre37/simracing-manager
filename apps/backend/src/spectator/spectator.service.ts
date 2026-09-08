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

export interface SpectatorScreenState {
  updatedAt: string;
  servers: {
    id: string;
    name: string;
    track: string;
    trackLayout: string | null;
    status: string;
    maxClients: number;
    stationName: string;
    stationIp: string | null;
    raceFormatName: string | null;
    startedAt: Date | null;
  }[];
  sessions: {
    id: string;
    serverId: string | null;
    clientName: string | null;
    carAcId: string | null;
    track: string | null;
    status: string;
    stationName: string;
    startedAt: Date | null;
  }[];
}

@Injectable()
export class SpectatorService {
  private readonly liveFrames = new Map<
    string,
    { data: Buffer; updatedAt: number }
  >();

  constructor(private readonly prisma: PrismaService) {}

  saveLiveFrame(stationId: string, data: Buffer): void {
    this.liveFrames.set(stationId, { data, updatedAt: Date.now() });
  }

  listLiveSources(): { stationId: string; updatedAt: number }[] {
    const cutoff = Date.now() - 10_000;
    for (const [stationId, frame] of this.liveFrames) {
      if (frame.updatedAt < cutoff) this.liveFrames.delete(stationId);
    }
    return [...this.liveFrames.entries()]
      .map(([stationId, frame]) => ({ stationId, updatedAt: frame.updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getLiveFrame(stationId?: string): { data: Buffer; updatedAt: number } | null {
    if (stationId) {
      const frame = this.liveFrames.get(stationId);
      return frame && Date.now() - frame.updatedAt < 10_000 ? frame : null;
    }
    const source = this.listLiveSources()[0];
    return source ? this.liveFrames.get(source.stationId) ?? null : null;
  }

  async getPublicScreenState(): Promise<SpectatorScreenState> {
    const [servers, sessions] = await Promise.all([
      this.prisma.dedicatedServer.findMany({
        where: { status: { in: ['starting', 'running'] } },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          track: true,
          trackLayout: true,
          status: true,
          maxClients: true,
          startedAt: true,
          station: { select: { name: true, localIp: true } },
          raceFormat: { select: { name: true } },
        },
      }),
      this.prisma.session.findMany({
        where: { status: { in: ['pending', 'running'] } },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          serverId: true,
          clientName: true,
          carAcId: true,
          track: true,
          status: true,
          startedAt: true,
          station: { select: { name: true } },
        },
      }),
    ]);

    return {
      updatedAt: new Date().toISOString(),
      servers: servers.map((server) => ({
        id: server.id,
        name: server.name,
        track: server.track,
        trackLayout: server.trackLayout,
        status: server.status,
        maxClients: server.maxClients,
        stationName: server.station.name,
        stationIp: server.station.localIp,
        raceFormatName: server.raceFormat?.name ?? null,
        startedAt: server.startedAt,
      })),
      sessions: sessions.map((session) => ({
        id: session.id,
        serverId: session.serverId,
        clientName: session.clientName,
        carAcId: session.carAcId,
        track: session.track,
        status: session.status,
        stationName: session.station.name,
        startedAt: session.startedAt,
      })),
    };
  }

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
    return this.createRecordingFromBuffer(
      file.buffer,
      file.mimetype,
      file.originalname,
      title,
      durationSeconds,
    );
  }

  async createRecordingFromBuffer(
    data: Buffer,
    mimeType: string,
    fileName: string,
    title: string | undefined,
    durationSeconds: number | undefined,
  ): Promise<ScreenRecordingDto> {
    if (!ALLOWED_TYPES.includes(mimeType)) {
      throw new BadRequestException(
        `Unsupported recording type. Allowed: ${ALLOWED_TYPES.join(', ')}`,
      );
    }
    if (data.length > MAX_SIZE_BYTES) {
      throw new BadRequestException('Recording is too large (maximum 500 MB)');
    }
    const normalizedTitle = (title ?? '').trim().slice(0, 160) || fileName;
    const safeDuration =
      durationSeconds != null && Number.isFinite(durationSeconds) && durationSeconds >= 0
        ? Math.min(durationSeconds, 24 * 60 * 60)
        : null;
    const recording = await this.prisma.screenRecording.create({
      data: {
        id: randomUUID(),
        title: normalizedTitle,
        fileName: fileName.slice(0, 255),
        mimeType,
        sizeBytes: data.length,
        durationSeconds: safeDuration,
        data,
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
