import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RaceFormat } from '@prisma/client';
import { RaceFormatConfig, RaceMode, GridType } from '@simracing/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRaceFormatDto } from './dto/create-race-format.dto';
import { UpdateRaceFormatDto } from './dto/update-race-format.dto';

@Injectable()
export class RaceFormatsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.raceFormat.findMany({
      orderBy: { createdAt: 'asc' },
      include: { createdBy: { select: { email: true } } },
    });
  }

  async findOne(id: string) {
    const format = await this.prisma.raceFormat.findUnique({
      where: { id },
      include: { createdBy: { select: { email: true } } },
    });
    if (!format) throw new NotFoundException('Format de course introuvable');
    return format;
  }

  create(dto: CreateRaceFormatDto, createdById: string) {
    return this.prisma.raceFormat.create({
      data: { ...dto, createdById },
    });
  }

  async update(id: string, dto: UpdateRaceFormatDto) {
    const existing = await this.findOne(id);
    const merged = { ...existing, ...dto };
    if (
      !merged.practiceEnabled &&
      !merged.qualifyingEnabled &&
      !merged.raceEnabled
    ) {
      throw new BadRequestException(
        'Au moins une session (Practice, Qualifying ou Race) doit être activée',
      );
    }
    return this.prisma.raceFormat.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.raceFormat.delete({ where: { id } });
  }

  /** Converts a stored `RaceFormat` row into the plain `RaceFormatConfig`
   * shape sent to the agent (see `LaunchDedicatedServerPayload` in
   * @simracing/shared) — `raceMode`/`gridType` are stored as plain strings
   * (same convention as every other enum-like column in this schema) but
   * always written from the enum values themselves, so the cast is safe. */
  toConfig(format: RaceFormat): RaceFormatConfig {
    return {
      practiceEnabled: format.practiceEnabled,
      practiceMinutes: format.practiceMinutes,
      qualifyingEnabled: format.qualifyingEnabled,
      qualifyingMinutes: format.qualifyingMinutes,
      raceEnabled: format.raceEnabled,
      raceMode: format.raceMode as RaceMode,
      raceLaps: format.raceLaps,
      raceMinutes: format.raceMinutes,
      gridType: format.gridType as GridType,
      weatherGraphics: format.weatherGraphics,
    };
  }
}
