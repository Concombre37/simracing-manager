import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContentCategoryDto } from './dto/create-content-category.dto';
import { UpdateContentCategoryDto } from './dto/update-content-category.dto';

@Injectable()
export class ContentCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list(type?: 'car' | 'track') {
    return this.prisma.contentCategory.findMany({
      where: type ? { type } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /** Consommé par la tablette publique (`ExternalApiController`) — scindé
   * cars/tracks comme `ContentLabelsService.getCatalog()`, pour construire
   * les tuiles de filtre sans dépendre du texte figé dans le code. */
  async listGroupedByType() {
    const rows = await this.list();
    return {
      cars: rows.filter((r) => r.type === 'car'),
      tracks: rows.filter((r) => r.type === 'track'),
    };
  }

  private async findOrThrow(id: string) {
    const category = await this.prisma.contentCategory.findUnique({
      where: { id },
    });
    if (!category) throw new NotFoundException('Catégorie introuvable');
    return category;
  }

  async create(dto: CreateContentCategoryDto) {
    const existing = await this.prisma.contentCategory.findUnique({
      where: { type_name: { type: dto.type, name: dto.name } },
    });
    if (existing) {
      throw new ConflictException('Cette catégorie existe déjà pour ce type');
    }
    return this.prisma.contentCategory.create({ data: dto });
  }

  /** Renommer une catégorie met aussi à jour tous les `ContentLabel` qui la
   * référencent (même texte libre historique) — sinon les voitures/circuits
   * déjà tagués redeviendraient invisibles pour le nouveau nom du filtre. */
  async update(id: string, dto: UpdateContentCategoryDto) {
    const existing = await this.findOrThrow(id);

    if (dto.name && dto.name !== existing.name) {
      const conflict = await this.prisma.contentCategory.findUnique({
        where: { type_name: { type: existing.type, name: dto.name } },
      });
      if (conflict) {
        throw new ConflictException('Cette catégorie existe déjà pour ce type');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.contentCategory.update({
        where: { id },
        data: dto,
      });
      if (dto.name && dto.name !== existing.name) {
        await tx.contentLabel.updateMany({
          where: { type: existing.type, category: existing.name },
          data: { category: dto.name },
        });
      }
      return updated;
    });
  }

  /** Supprimer une catégorie détache aussi les voitures/circuits qui
   * l'utilisaient (`category` remis à `null`) plutôt que de laisser une
   * valeur orpheline absente de la liste configurée. */
  async remove(id: string) {
    const existing = await this.findOrThrow(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.contentLabel.updateMany({
        where: { type: existing.type, category: existing.name },
        data: { category: null },
      });
      return tx.contentCategory.delete({ where: { id } });
    });
  }
}
