import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContentPackageDto } from './dto/create-content-package.dto';

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateContentPackageDto) {
    return this.prisma.contentPackage.create({ data: dto });
  }

  async findAll() {
    return this.prisma.contentPackage.findMany({
      select: {
        id: true,
        type: true,
        name: true,
        version: true,
        archiveUrl: true,
        checksum: true,
        isRequired: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async getCatalog() {
    const packages = await this.findAll();
    return {
      version: '1.0.0',
      packages: packages.map((pkg: (typeof packages)[number]) => ({
        id: pkg.id,
        type: pkg.type,
        name: pkg.name,
        version: pkg.version,
        archiveUrl: `/api/content/packages/${pkg.id}/download`,
        checksum: pkg.checksum,
        isRequired: pkg.isRequired,
      })),
    };
  }

  async findById(id: string) {
    return this.prisma.contentPackage.findUnique({ where: { id } });
  }

  async saveSourcePackage(input: {
    type: 'car' | 'track';
    acId: string;
    archive: Buffer;
  }) {
    const checksum = createHash('sha256').update(input.archive).digest('hex');
    // A source share is the canonical package for this mod. Reusing one
    // version keeps repeated shares from filling the catalogue with copies.
    return this.prisma.contentPackage.upsert({
      where: {
        type_name_version: { type: input.type, name: input.acId, version: 'source' },
      },
      create: {
        type: input.type,
        name: input.acId,
        version: 'source',
        archiveUrl: 'https://simracing.hytlabs.com/',
        archiveData: input.archive,
        checksum,
        isRequired: false,
      },
      update: { archiveData: input.archive, checksum, updatedAt: new Date() },
    });
  }
}
