import { z } from 'zod';
import { UserRole } from '@simracing/shared';

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  role: z.nativeEnum(UserRole).default(UserRole.TECHNICIAN),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
