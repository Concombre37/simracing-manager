import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

@Controller('content/previews')
export class ContentPreviewsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id')
  async findOne(@Param('id') id: string, @Res() res: Response) {
    const preview = await this.prisma.contentPreview.findUnique({
      where: { id },
    });
    if (!preview) {
      throw new NotFoundException('Preview not found');
    }

    const buffer = Buffer.from(preview.data, 'base64');
    res.setHeader('Content-Type', this.inferMime(preview.data));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  }

  private inferMime(data: string): string {
    // PNG files start with iVBORw0KGgo
    if (data.startsWith('iVBOR')) return 'image/png';
    // JPEG files start with /9j/
    if (data.startsWith('/9j/')) return 'image/jpeg';
    return 'application/octet-stream';
  }
}
