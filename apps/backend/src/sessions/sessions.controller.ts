import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import {
  createSessionSchema,
  CreateSessionDto,
} from './dto/create-session.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createSessionSchema)) dto: CreateSessionDto,
  ) {
    return this.sessionsService.create(dto);
  }

  @Get('station/:stationId')
  findByStation(@Param('stationId') stationId: string) {
    return this.sessionsService.findByStation(stationId);
  }
}
