import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
  Res,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminOrStationAuthGuard } from '../auth/guards/admin-or-station-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@simracing/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { BlankingMediaService } from './blanking-media.service';
import {
  reorderBlankingMediaSchema,
  ReorderBlankingMediaDto,
} from './dto/reorder-blanking-media.dto';

@Controller()
export class BlankingMediaController {
  constructor(private readonly blankingMediaService: BlankingMediaService) {}

  @Get('stations/:id/blanking-media')
  @UseGuards(AdminOrStationAuthGuard)
  async findByStation(@Param('id') stationId: string) {
    return this.blankingMediaService.findByStation(stationId);
  }

  @Post('stations/:id/blanking-media')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('id') stationId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new NotFoundException('No file uploaded');
    }
    return this.blankingMediaService.upload(stationId, file);
  }

  @Patch('stations/:id/blanking-media/reorder')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async reorder(
    @Param('id') stationId: string,
    @Body(new ZodValidationPipe(reorderBlankingMediaSchema))
    dto: ReorderBlankingMediaDto,
  ) {
    await this.blankingMediaService.reorder(stationId, dto.mediaIds);
    return { success: true };
  }

  @Delete('stations/:stationId/blanking-media/:mediaId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async remove(
    @Param('stationId') stationId: string,
    @Param('mediaId') mediaId: string,
  ) {
    await this.blankingMediaService.remove(stationId, mediaId);
    return { success: true };
  }

  @Post('blanking-media/bulk')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async uploadBulk(
    @Body('stationIds') stationIdsRaw: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new NotFoundException('No file uploaded');
    }

    let stationIds: string[];
    try {
      stationIds = JSON.parse(stationIdsRaw);
      if (
        !Array.isArray(stationIds) ||
        !stationIds.every((id) => typeof id === 'string')
      ) {
        throw new BadRequestException(
          'stationIds must be a JSON array of strings',
        );
      }
    } catch {
      throw new BadRequestException(
        'stationIds must be a valid JSON array of strings',
      );
    }

    if (stationIds.length === 0) {
      throw new BadRequestException('At least one station must be selected');
    }

    return this.blankingMediaService.uploadToStations(stationIds, file);
  }

  @Get('blanking-media/:id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const fileInfo = await this.blankingMediaService.getFilePath(id);
    try {
      const fileStat = await stat(fileInfo.path);
      res.setHeader('Content-Type', fileInfo.mimeType);
      res.setHeader('Content-Length', fileStat.size);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${fileInfo.filename}"`,
      );
      createReadStream(fileInfo.path).pipe(res);
    } catch {
      throw new NotFoundException('Media file not found on disk');
    }
  }
}
