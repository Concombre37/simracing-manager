import { Injectable } from '@nestjs/common';
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
}
