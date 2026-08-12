import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ArcadeService } from './arcade.service';
import {
  createArcadeAttractionSchema,
  CreateArcadeAttractionDto,
} from './dto/create-arcade-attraction.dto';
import {
  updateArcadeAttractionSchema,
  UpdateArcadeAttractionDto,
} from './dto/update-arcade-attraction.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@simracing/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('arcade')
export class ArcadeController {
  constructor(private readonly arcadeService: ArcadeService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  list() {
    return this.arcadeService.list();
  }

  // Public, sans auth — consommée par la page tablette publique
  // (/tablet-menu), même principe que ContentPreviewsController#findOne.
  @Get(':id/photo')
  async getPhoto(@Param('id') id: string, @Res() res: Response) {
    const photo = await this.arcadeService.getPhoto(id);
    if (!photo) throw new NotFoundException('Photo introuvable');
    res.setHeader('Content-Type', photo.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(photo.data);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(
    @Body(new ZodValidationPipe(createArcadeAttractionSchema))
    dto: CreateArcadeAttractionDto,
  ) {
    return this.arcadeService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateArcadeAttractionSchema))
    dto: UpdateArcadeAttractionDto,
  ) {
    return this.arcadeService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.arcadeService.remove(id);
  }

  @Post(':id/photo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Aucun fichier reçu');
    return this.arcadeService.setPhoto(id, file);
  }

  @Delete(':id/photo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  removePhoto(@Param('id') id: string) {
    return this.arcadeService.removePhoto(id);
  }
}
