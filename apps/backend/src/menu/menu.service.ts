import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMenuCategoryDto } from './dto/create-menu-category.dto';
import { UpdateMenuCategoryDto } from './dto/update-menu-category.dto';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  /** Catégories avec leurs items, triés — consommé à la fois par la page
   * d'administration (`GET /menu`) et par la tablette publique
   * (`GET /external/v1/menu`, voir `ExternalApiController`). */
  listGrouped() {
    return this.prisma.menuCategory.findMany({
      orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      },
    });
  }

  async findCategory(id: string) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id },
    });
    if (!category) throw new NotFoundException('Catégorie de menu introuvable');
    return category;
  }

  createCategory(dto: CreateMenuCategoryDto) {
    return this.prisma.menuCategory.create({ data: dto });
  }

  async updateCategory(id: string, dto: UpdateMenuCategoryDto) {
    await this.findCategory(id);
    return this.prisma.menuCategory.update({ where: { id }, data: dto });
  }

  async removeCategory(id: string) {
    await this.findCategory(id);
    return this.prisma.menuCategory.delete({ where: { id } });
  }

  async findItem(id: string) {
    const item = await this.prisma.menuItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Article de menu introuvable');
    return item;
  }

  createItem(dto: CreateMenuItemDto) {
    return this.prisma.menuItem.create({ data: dto });
  }

  async updateItem(id: string, dto: UpdateMenuItemDto) {
    await this.findItem(id);
    return this.prisma.menuItem.update({ where: { id }, data: dto });
  }

  async removeItem(id: string) {
    await this.findItem(id);
    return this.prisma.menuItem.delete({ where: { id } });
  }
}
