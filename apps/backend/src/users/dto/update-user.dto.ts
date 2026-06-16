import { z } from 'zod';
import { UserRole } from '@simracing/shared';

export const updateUserSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(12).optional(),
  role: z.nativeEnum(UserRole).optional(),
});

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
