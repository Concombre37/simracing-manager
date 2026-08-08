import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SessionStatus } from '@simracing/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { buildSessionDetail } from './session-detail';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Détail complet d'une session : tous les tours (pas juste le meilleur),
   * secteurs, pneus, coupures, classement final — tout ce que race_out.json
   * contient, pas seulement ce dont le classement a besoin. Voir
   * session-detail.ts pour le detail du parsing. */
  async getDetail(id: string) {
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: {
        station: { select: { id: true, stationId: true, name: true } },
        client: { select: { id: true, name: true } },
        telemetryFiles: {
          select: {
            id: true,
            fileName: true,
            sizeBytes: true,
            createdAt: true,
          },
        },
      },
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    return buildSessionDetail(session);
  }

  async findHistory(params: { limit: number; cursor?: string }) {
    const sessions = await this.prisma.session.findMany({
      where: { status: SessionStatus.FINISHED },
      orderBy: { createdAt: 'desc' },
      take: params.limit,
      ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
      select: {
        id: true,
        track: true,
        trackLayout: true,
        carAcId: true,
        clientName: true,
        type: true,
        startedAt: true,
        endedAt: true,
        createdAt: true,
        durationMinutes: true,
        station: { select: { name: true, stationId: true } },
      },
    });
    return sessions;
  }

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

  /** `result` est optionnel : `agent:session:ended` (filet de sécurité,
   * fires toujours juste après `agent:results`) appelle `finish()` sans
   * résultat pour marquer la session terminée même si aucun `race_out.json`
   * n'a pu être lu. Passer `{}` explicitement ici écrasait un résultat déjà
   * enregistré par `agent:results` chaque fois que ce dernier event
   * terminait son écriture DB après celui-ci (aucune garantie d'ordre entre
   * deux handlers async sur des messages socket reçus quasi simultanément)
   * — une session de 15 minutes avec un vrai classement pouvait ainsi finir
   * avec `result: {}`. Ne jamais écrire `result` quand on n'en a pas un
   * nouveau exclut cette classe de course, quel que soit l'ordre d'arrivée. */
  async finish(sessionId: string, result?: Record<string, unknown>) {
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
        ...(result !== undefined
          ? { result: result as Prisma.InputJsonValue }
          : {}),
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
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { station: true },
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    const newDuration = Math.max(0, (session.durationMinutes ?? 0) + minutes);
    return this.prisma.session.update({
      where: { id: sessionId },
      data: { durationMinutes: newDuration },
      include: { station: true },
    });
  }

  async stop(sessionId: string) {
    await this.findOne(sessionId);
    return this.prisma.session.update({
      where: { id: sessionId },
      data: { status: SessionStatus.FINISHED, endedAt: new Date() },
      include: { station: true },
    });
  }
}
