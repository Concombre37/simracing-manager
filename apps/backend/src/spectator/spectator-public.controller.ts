import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { SpectatorService } from './spectator.service';

/** Read-only feed used by a station physically configured as Spectator. */
@Controller('spectator')
export class SpectatorPublicController {
  constructor(private readonly spectatorService: SpectatorService) {}

  @Get('screen-state')
  getScreenState() {
    return this.spectatorService.getPublicScreenState();
  }

  @Get('live-sources')
  getLiveSources() {
    return this.spectatorService.listLiveSources();
  }

  @Get('frame')
  getFrame(@Query('station') stationId: string | undefined, @Res() response: Response) {
    const frame = this.spectatorService.getLiveFrame(stationId);
    if (!frame) {
      response.status(404).send();
      return;
    }
    response.setHeader('Content-Type', 'image/jpeg');
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.setHeader('Content-Length', frame.data.length);
    response.send(frame.data);
  }
}
