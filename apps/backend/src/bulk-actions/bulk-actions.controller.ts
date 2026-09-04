import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { BulkActionsService } from './bulk-actions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@simracing/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  bulkStationActionSchema,
  BulkStationActionDto,
} from './dto/bulk-station-action.dto';

// Préfixe dédié 'bulk-actions' (pas 'stations/bulk/...') pour ne jamais
// pouvoir entrer en collision avec les routes 'stations/:id/...' du même
// routeur Express — un segment littéral 'bulk' à la place de :id serait
// autrement ambigu selon l'ordre d'enregistrement des modules.
@Controller('bulk-actions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
export class BulkActionsController {
  constructor(private readonly bulkActionsService: BulkActionsService) {}

  @Post('wake')
  wake(
    @Body(new ZodValidationPipe(bulkStationActionSchema))
    dto: BulkStationActionDto,
  ) {
    return this.bulkActionsService.wake(dto.stationIds);
  }

  @Post('shutdown')
  shutdown(
    @Body(new ZodValidationPipe(bulkStationActionSchema))
    dto: BulkStationActionDto,
  ) {
    return this.bulkActionsService.shutdown(dto.stationIds);
  }

  @Post('restart')
  restart(
    @Body(new ZodValidationPipe(bulkStationActionSchema))
    dto: BulkStationActionDto,
  ) {
    return this.bulkActionsService.restart(dto.stationIds);
  }

  @Post('blanking-hide')
  blankingHide(
    @Body(new ZodValidationPipe(bulkStationActionSchema))
    dto: BulkStationActionDto,
  ) {
    return this.bulkActionsService.blankingHide(dto.stationIds);
  }

  @Post('blanking-show')
  blankingShow(
    @Body(new ZodValidationPipe(bulkStationActionSchema))
    dto: BulkStationActionDto,
  ) {
    return this.bulkActionsService.blankingShow(dto.stationIds);
  }

  @Post('update-agent')
  updateAgent(
    @Body(new ZodValidationPipe(bulkStationActionSchema))
    dto: BulkStationActionDto,
  ) {
    return this.bulkActionsService.updateAgent(dto.stationIds);
  }

  @Post('sync-content')
  syncContent(
    @Body(new ZodValidationPipe(bulkStationActionSchema))
    dto: BulkStationActionDto,
  ) {
    return this.bulkActionsService.syncContent(dto.stationIds);
  }
}
