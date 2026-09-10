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

    const groups = new Map<
      string,
      {
        representative: (typeof previews)[number];
        stations: (typeof previews)[number]['station'][];
      }
    >();

    for (const preview of previews) {
      const key = `${preview.type}:${preview.acId}`;
      const group = groups.get(key);
      if (group) {
        if (
          !group.stations.some((station) => station.id === preview.station.id)
        ) {
          group.stations.push(preview.station);
        }
        continue;
      }
      groups.set(key, { representative: preview, stations: [preview.station] });
    }

    const counts = new Map<string, number>();
    for (const preview of previews) {
      const key = `${preview.type}:${preview.acId}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return Array.from(groups.values())
      .map(({ representative, stations }) => ({
        id: representative.id,
        type: representative.type,
        acId: representative.acId,
        name: representative.name,
        url: `/api/content/previews/${representative.id}`,
        stations,
        previewCount:
          counts.get(`${representative.type}:${representative.acId}`) ?? 1,
        createdAt: representative.createdAt,
        updatedAt: representative.updatedAt,
      }))
      .sort((a, b) =>
        `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`),
      );
  }

  @Delete('group')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async removeGroup(
    @Query('type') type?: string,
    @Query('acId') acId?: string,
  ) {
    if (!type || !acId) {
      throw new NotFoundException('Contenu à supprimer introuvable');
    }
    const result = await this.prisma.contentPreview.deleteMany({
      where: { type, acId },
    });
    return { success: true, deleted: result.count };
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
