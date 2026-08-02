import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  search(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return [];
    return this.prisma.client.findMany({
      where: { name: { contains: trimmed, mode: 'insensitive' } },
      orderBy: { name: 'asc' },
      take: 10,
    });
  }

  /**
   * Reuses an existing client when the name already matches one
   * (case-insensitively) instead of creating a duplicate every time an
   * operator retypes the same pilot name at the join screen.
   */
  async findOrCreateByName(name: string) {
    const trimmed = name.trim();
    const existing = await this.prisma.client.findFirst({
      where: { name: { equals: trimmed, mode: Prisma.QueryMode.insensitive } },
    });
    if (existing) return existing;
    return this.prisma.client.create({ data: { name: trimmed } });
  }
}
