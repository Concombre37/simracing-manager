import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeysService } from './api-keys.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@simracing/shared';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Controller('api-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  list() {
    return this.apiKeysService.list();
  }

  @Post()
  create(@Body('name') name: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.apiKeysService.create(name?.trim() || 'Sans nom', user.sub);
  }

  @Post(':id/revoke')
  revoke(@Param('id') id: string) {
    return this.apiKeysService.revoke(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.apiKeysService.remove(id);
  }
}
