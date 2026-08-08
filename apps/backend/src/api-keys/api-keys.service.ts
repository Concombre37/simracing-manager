import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const KEY_PREFIX = 'ext_';

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
        createdBy: { select: { email: true } },
      },
    });
  }

  /** Le secret en clair n'est renvoyé qu'ici, une seule fois — seul le
   * préfixe est conservé lisible ensuite (comme les clés station). */
  async create(name: string, createdById: string) {
    const key = this.generateKey();
    const record = await this.prisma.apiKey.create({
      data: {
        name,
        keyHash: this.hashKey(key),
        keyPrefix: key.slice(0, 12),
        createdById,
      },
    });
    return {
      id: record.id,
      name: record.name,
      key,
      createdAt: record.createdAt,
    };
  }

  async revoke(id: string) {
    const existing = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Clé API introuvable');
    return this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Clé API introuvable');
    return this.prisma.apiKey.delete({ where: { id } });
  }

  async validate(key: string) {
    const hash = this.hashKey(key);
    const record = await this.prisma.apiKey.findUnique({
      where: { keyHash: hash },
    });
    if (!record || record.revokedAt) return null;
    // Best-effort, ne bloque jamais la requête sur cette écriture.
    void this.prisma.apiKey
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    return record;
  }

  private generateKey(): string {
    return `${KEY_PREFIX}${randomBytes(32).toString('hex')}`;
  }

  private hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }
}
