import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ContentLabelsService } from './content-labels.service';
import {
  upsertContentLabelSchema,
  UpsertContentLabelDto,
} from './dto/upsert-content-label.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@simracing/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('content/labels')
export class ContentLabelsController {
  constructor(private readonly contentLabelsService: ContentLabelsService) {}

  @Get('known')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getKnown() {
    return this.contentLabelsService.getKnown();
  }

  @Get('map')
  @UseGuards(JwtAuthGuard)
  getMap() {
    return this.contentLabelsService.getMap();
  }

  @Put()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  upsert(
    @Body(new ZodValidationPipe(upsertContentLabelSchema))
    dto: UpsertContentLabelDto,
  ) {
    return this.contentLabelsService.upsert(dto);
  }
}
