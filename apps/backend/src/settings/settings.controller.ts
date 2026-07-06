import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SettingsService } from './settings.service';
import {
  updateSettingsSchema,
  UpdateSettingsDto,
} from './dto/update-settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@simracing/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  get() {
    return this.settingsService.get();
  }

  @Patch()
  @Roles(UserRole.ADMIN)
  async update(
    @Body(new ZodValidationPipe(updateSettingsSchema)) dto: UpdateSettingsDto,
  ) {
    const settings = await this.settingsService.update(dto);
    this.eventEmitter.emit('settings.updated', {
      blankingDelaySeconds: settings.blankingDelaySeconds,
    });
    return settings;
  }
}
