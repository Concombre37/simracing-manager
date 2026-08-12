import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ContentCategoriesService } from './content-categories.service';
import {
  createContentCategorySchema,
  CreateContentCategoryDto,
} from './dto/create-content-category.dto';
import {
  updateContentCategorySchema,
  UpdateContentCategoryDto,
} from './dto/update-content-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@simracing/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

// Même accès que ContentLabelsController#getKnown (page /content-names) —
// admin uniquement, pas de rôle technicien ici.
@Controller('content-categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ContentCategoriesController {
  constructor(
    private readonly contentCategoriesService: ContentCategoriesService,
  ) {}

  @Get()
  list(@Query('type') type?: string) {
    return this.contentCategoriesService.list(
      type === 'car' || type === 'track' ? type : undefined,
    );
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createContentCategorySchema))
    dto: CreateContentCategoryDto,
  ) {
    return this.contentCategoriesService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateContentCategorySchema))
    dto: UpdateContentCategoryDto,
  ) {
    return this.contentCategoriesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.contentCategoriesService.remove(id);
  }
}
