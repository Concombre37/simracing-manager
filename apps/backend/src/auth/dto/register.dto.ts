import { z } from 'zod';
import { UserRole } from '@simracing/shared';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  role: z.nativeEnum(UserRole).default(UserRole.TECHNICIAN),
});

export type RegisterDto = z.infer<typeof registerSchema>;
