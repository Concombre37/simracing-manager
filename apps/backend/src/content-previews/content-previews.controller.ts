import {
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@simracing/shared';
import { inferMimeFromBase64 } from '../common/infer-mime';

@Controller('content/previews')
export class ContentPreviewsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async findAll(
    @Query('stationId') stationId?: string,
    @Query('type') type?: string,
  ) {
    const where: { stationId?: string; type?: string } = {};
    if (stationId) where.stationId = stationId;
    if (type) where.type = type;

    const previews = await this.prisma.contentPreview.findMany({
      where,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: {
        station: {
          select: { id: true, stationId: true, name: true },
        },
      },
    });

    return previews.map((p) => ({
      id: p.id,
      stationId: p.stationId,
      station: p.station,
      type: p.type,
      acId: p.acId,
      name: p.name,
      url: `/api/content/previews/${p.id}`,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Res() res: Response) {
    const preview = await this.prisma.contentPreview.findUnique({
      where: { id },
    });
    if (!preview) {
      throw new NotFoundException('Preview not found');
    }

    const buffer = Buffer.from(preview.data, 'base64');
    res.setHeader('Content-Type', inferMimeFromBase64(preview.data));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async remove(@Param('id') id: string) {
    await this.prisma.contentPreview.delete({ where: { id } });
    return { success: true };
  }
}
