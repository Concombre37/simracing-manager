import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
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
import { inferMimeFromBase64 } from '../common/infer-mime';

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

  /** Public, sans auth — consommé par la page tablette publique
   * (`/tablet-menu`) au même titre que `ContentPreviewsController#findOne`. */
  @Get('layout-image/:id')
  async getLayoutImage(@Param('id') id: string, @Res() res: Response) {
    const data = await this.contentLabelsService.getLayoutImage(id);
    if (!data) {
      throw new NotFoundException('Layout image not found');
    }
    const buffer = Buffer.from(data, 'base64');
    res.setHeader('Content-Type', inferMimeFromBase64(data));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
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
