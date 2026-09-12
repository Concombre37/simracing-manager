import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Res,
  UseGuards,
  NotFoundException,
  BadRequestException,
  UploadedFile,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AdminOrStationAuthRequest } from '../auth/guards/admin-or-station-auth.guard';
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
export class ContentController {
  constructor(
    private readonly contentService: ContentService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Post('packages')
  @UseGuards(JwtAuthGuard, RolesGuard)
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
    if (pkg.archiveData) {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Length', pkg.archiveData.length);
      res.setHeader('Content-Disposition', `attachment; filename="${pkg.name}.zip"`);
      return res.send(pkg.archiveData);
    }
    return res.redirect(pkg.archiveUrl);
  }

  /** Receives a package archived by an authenticated source agent. */
  @Post('source-upload')
  @UseGuards(AdminOrStationAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 1024 * 1024 * 1024 } }))
  async sourceUpload(
    @Req() request: AdminOrStationAuthRequest,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { type?: string; acId?: string; targets?: string },
  ) {
    if (!request.stationId) throw new BadRequestException('A station token is required');
    if (!file?.buffer?.length) throw new BadRequestException('No archive uploaded');
    if (body.type !== 'car' && body.type !== 'track') {
      throw new BadRequestException('Invalid content type');
    }
    const acId = String(body.acId ?? '').trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(acId)) throw new BadRequestException('Invalid content id');
    let targets: string[] = [];
    try {
      const parsed = body.targets ? JSON.parse(body.targets) : [];
      if (Array.isArray(parsed)) targets = parsed.filter((value): value is string => typeof value === 'string');
    } catch {
      throw new BadRequestException('Invalid target list');
    }
    await this.contentService.saveSourcePackage({ type: body.type, acId, archive: file.buffer });
    this.eventEmitter.emit('content.shared', {
      sourceStationId: request.stationId,
      type: body.type,
      acId,
      targets: [...new Set(targets)].filter((target) => target !== request.stationId),
    });
    return { success: true, type: body.type, acId, targets };
  }
}
