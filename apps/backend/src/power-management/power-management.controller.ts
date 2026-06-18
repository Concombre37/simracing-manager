import { Controller, Post, Param, UseGuards } from '@nestjs/common';
import { PowerManagementService } from './power-management.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@simracing/shared';

@Controller('stations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PowerManagementController {
  constructor(
    private readonly powerManagementService: PowerManagementService,
  ) {}

  @Post(':id/wake')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  async wake(@Param('id') id: string) {
    return this.powerManagementService.wake(id);
  }

  @Post(':id/shutdown')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  async shutdown(@Param('id') id: string) {
    return this.powerManagementService.shutdown(id);
  }
}
