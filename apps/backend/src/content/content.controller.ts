import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Res,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { ContentService } from './content.service';
import {
  createContentPackageSchema,
  CreateContentPackageDto,
} from './dto/create-content-package.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminOrStationAuthGuard } from '../auth/guards/admin-or-station-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@simracing/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('content')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Post('packages')
  @Roles(UserRole.ADMIN)
  create(
    @Body(new ZodValidationPipe(createContentPackageSchema))
    dto: CreateContentPackageDto,
  ) {
    return this.contentService.create(dto);
  }

  @Get('catalog')
  @UseGuards(AdminOrStationAuthGuard)
  getCatalog() {
    return this.contentService.getCatalog();
  }

  @Get('packages/:id/download')
  @UseGuards(AdminOrStationAuthGuard)
  async download(@Param('id') id: string, @Res() res: Response) {
    const pkg = await this.contentService.findById(id);
    if (!pkg) {
      throw new NotFoundException('Package not found');
    }
    return res.redirect(pkg.archiveUrl);
  }
}
