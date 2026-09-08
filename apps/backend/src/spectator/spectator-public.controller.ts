import { Controller, Get } from '@nestjs/common';
import { SpectatorService } from './spectator.service';

/** Read-only feed used by a station physically configured as Spectator. */
@Controller('spectator')
export class SpectatorPublicController {
  constructor(private readonly spectatorService: SpectatorService) {}

  @Get('screen-state')
  getScreenState() {
    return this.spectatorService.getPublicScreenState();
  }
}
