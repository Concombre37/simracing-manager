import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

export interface UserResponse {
  id: string;
  email: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UsersService {
  private readonly SALT_ROUNDS = 12;

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto): Promise<UserResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await hash(dto.password, this.SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: passwordHash,
        role: dto.role,
      },
    });

    return this.toResponse(user);
  }

  async findAll(): Promise<UserResponse[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return users.map((user) => this.toResponse(user));
  }

  async findOne(id: string): Promise<UserResponse> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toResponse(user);
  }

  async findByEmail(email: string): Promise<UserResponse | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user ? this.toResponse(user) : null;
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    currentUserId?: string,
  ): Promise<UserResponse> {
    await this.findOne(id);

    if (dto.role && id === currentUserId) {
      throw new ForbiddenException('You cannot change your own role');
    }

    const data: { email?: string; password?: string; role?: string } = {};
    if (dto.email) data.email = dto.email;
    if (dto.password)
      data.password = await hash(dto.password, this.SALT_ROUNDS);
    if (dto.role) data.role = dto.role;

    const user = await this.prisma.user.update({
      where: { id },
      data,
    });

    return this.toResponse(user);
  }

  async remove(id: string, currentUserId?: string): Promise<UserResponse> {
    if (id === currentUserId) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    await this.findOne(id);
    const user = await this.prisma.user.delete({ where: { id } });
    return this.toResponse(user);
  }

  private toResponse(user: {
    id: string;
    email: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
  }): UserResponse {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
