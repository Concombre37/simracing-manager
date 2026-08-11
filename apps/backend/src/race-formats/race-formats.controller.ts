import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { RaceFormatsService } from './race-formats.service';
import {
  createRaceFormatSchema,
  CreateRaceFormatDto,
} from './dto/create-race-format.dto';
import {
  updateRaceFormatSchema,
  UpdateRaceFormatDto,
} from './dto/update-race-format.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@simracing/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Controller('race-formats')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RaceFormatsController {
  constructor(private readonly raceFormatsService: RaceFormatsService) {}

  // Lecture ouverte à technician aussi : nécessaire pour choisir un format
  // dans l'assistant de création de serveur, pas seulement pour les gérer.
  @Get()
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  list() {
    return this.raceFormatsService.list();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  findOne(@Param('id') id: string) {
    return this.raceFormatsService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(
    @Body(new ZodValidationPipe(createRaceFormatSchema))
    dto: CreateRaceFormatDto,
    @Req() req: Request,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.raceFormatsService.create(dto, user.sub);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRaceFormatSchema))
    dto: UpdateRaceFormatDto,
  ) {
    return this.raceFormatsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.raceFormatsService.remove(id);
  }
}
