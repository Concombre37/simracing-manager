import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SpectatorService } from './spectator.service';

@Controller('spectator')
@UseGuards(JwtAuthGuard)
export class SpectatorController {
  constructor(private readonly spectatorService: SpectatorService) {}

  @Get('recordings')
  listRecordings() {
    return this.spectatorService.listRecordings();
  }

  @Post('recordings')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 500 * 1024 * 1024 } }),
  )
  createRecording(
    @UploadedFile() file: Express.Multer.File,
    @Body('title') title?: string,
    @Body('durationSeconds') durationSecondsRaw?: string,
  ) {
    const durationSeconds = durationSecondsRaw ? Number(durationSecondsRaw) : undefined;
    return this.spectatorService.createRecording(file, title, durationSeconds);
  }

  @Get('recordings/:id/file')
  async getFile(
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.spectatorService.getFile(id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', file.data.length);
    res.setHeader(
      'Content-Disposition',
      `${download === '1' ? 'attachment' : 'inline'}; filename="${file.fileName.replace(/[\"\r\n]/g, '_')}"`,
    );
    res.send(file.data);
  }

  @Delete('recordings/:id')
  async remove(@Param('id') id: string) {
    await this.spectatorService.remove(id);
    return { success: true };
  }
}
