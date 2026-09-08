import { Controller, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AdminOrStationAuthGuard, AdminOrStationAuthRequest } from '../auth/guards/admin-or-station-auth.guard';
import { SpectatorService } from './spectator.service';

const MAX_FRAME_BYTES = 2 * 1024 * 1024;
const MAX_RECORDING_BYTES = 500 * 1024 * 1024;

@Controller('spectator')
@UseGuards(AdminOrStationAuthGuard)
export class SpectatorFrameController {
  constructor(private readonly spectatorService: SpectatorService) {}

  @Post('frame')
  async ingestFrame(@Req() request: AdminOrStationAuthRequest) {
    const data = await readRawBody(request, MAX_FRAME_BYTES);
    if (!data.length || !request.stationId) return { accepted: false };
    this.spectatorService.saveLiveFrame(request.stationId, data);
    return { accepted: true };
  }

  @Post('recordings/raw')
  async ingestRecording(
    @Req() request: AdminOrStationAuthRequest,
    @Headers('content-type') contentType: string | undefined,
    @Headers('x-recording-title') title: string | undefined,
    @Headers('x-recording-duration') durationRaw: string | undefined,
  ) {
    const data = await readRawBody(request, MAX_RECORDING_BYTES);
    const mimeType = contentType?.split(';', 1)[0] ?? 'video/mp4';
    const duration = durationRaw ? Number(durationRaw) : undefined;
    return this.spectatorService.createRecordingFromBuffer(
      data,
      mimeType,
      `agent-${Date.now()}.mp4`,
      title,
      duration,
    );
  }
}

function readRawBody(request: Request, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes) {
        reject(new Error('Payload too large'));
        request.destroy();
        return;
      }
      chunks.push(buffer);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}
