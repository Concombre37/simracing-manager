import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MenuService } from './menu.service';
import {
  createMenuCategorySchema,
  CreateMenuCategoryDto,
} from './dto/create-menu-category.dto';
import {
  updateMenuCategorySchema,
  UpdateMenuCategoryDto,
} from './dto/update-menu-category.dto';
import {
  createMenuItemSchema,
  CreateMenuItemDto,
} from './dto/create-menu-item.dto';
import {
  updateMenuItemSchema,
  UpdateMenuItemDto,
} from './dto/update-menu-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@simracing/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('menu')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  listGrouped() {
    return this.menuService.listGrouped();
  }

  @Post('categories')
  @Roles(UserRole.ADMIN)
  createCategory(
    @Body(new ZodValidationPipe(createMenuCategorySchema))
    dto: CreateMenuCategoryDto,
  ) {
    return this.menuService.createCategory(dto);
  }

  @Patch('categories/:id')
  @Roles(UserRole.ADMIN)
  updateCategory(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMenuCategorySchema))
    dto: UpdateMenuCategoryDto,
  ) {
    return this.menuService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @Roles(UserRole.ADMIN)
  removeCategory(@Param('id') id: string) {
    return this.menuService.removeCategory(id);
  }

  @Post('items')
  @Roles(UserRole.ADMIN)
  createItem(
    @Body(new ZodValidationPipe(createMenuItemSchema)) dto: CreateMenuItemDto,
  ) {
    return this.menuService.createItem(dto);
  }

  @Patch('items/:id')
  @Roles(UserRole.ADMIN)
  updateItem(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMenuItemSchema)) dto: UpdateMenuItemDto,
  ) {
    return this.menuService.updateItem(id, dto);
  }

  @Delete('items/:id')
  @Roles(UserRole.ADMIN)
  removeItem(@Param('id') id: string) {
    return this.menuService.removeItem(id);
  }
}
