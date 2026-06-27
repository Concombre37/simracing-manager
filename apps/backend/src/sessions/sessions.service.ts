import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SessionStatus } from '@simracing/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSessionDto } from './dto/create-session.dto';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSessionDto) {
    return this.prisma.session.create({
      data: {
        stationId: dto.stationId,
        config: dto.config as Prisma.InputJsonValue,
        status: SessionStatus.PENDING,
      },
    });
  }

  async findOne(id: string) {
    const session = await this.prisma.session.findUnique({ where: { id } });
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    return session;
  }

  async findByStation(stationId: string) {
    return this.prisma.session.findMany({
      where: { stationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async start(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    return this.prisma.session.update({
      where: { id: sessionId },
      data: { status: SessionStatus.RUNNING, startedAt: new Date() },
    });
  }

  async finish(sessionId: string, result: Record<string, unknown>) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    return this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.FINISHED,
        endedAt: new Date(),
        result: result as Prisma.InputJsonValue,
      },
    });
  }

  async cancel(sessionId: string) {
    await this.findOne(sessionId);
    return this.prisma.session.update({
      where: { id: sessionId },
      data: { status: SessionStatus.CANCELLED, endedAt: new Date() },
    });
  }

  async findActive() {
    return this.prisma.session.findMany({
      where: { status: SessionStatus.RUNNING },
      include: { station: true },
      orderBy: { startedAt: 'desc' },
    });
  }

  async extend(sessionId: string, minutes: number) {
    const session = await this.findOne(sessionId);
    const currentDuration = session.durationMinutes ?? 0;
    const newDuration = Math.max(0, currentDuration + minutes);
    return this.prisma.session.update({
      where: { id: sessionId },
      data: { durationMinutes: newDuration },
    });
  }

  async stop(sessionId: string) {
    await this.findOne(sessionId);
    return this.prisma.session.update({
      where: { id: sessionId },
      data: { status: SessionStatus.FINISHED, endedAt: new Date() },
    });
  }
}
