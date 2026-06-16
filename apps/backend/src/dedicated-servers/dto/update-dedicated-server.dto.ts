import { z } from 'zod';

export const updateDedicatedServerSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  track: z.string().min(1).optional(),
  trackLayout: z.string().optional(),
  cars: z.array(z.string()).min(1).optional(),
  maxClients: z.number().int().min(1).max(64).optional(),
  password: z.string().optional(),
  rconPassword: z.string().optional(),
});

export type UpdateDedicatedServerDto = z.infer<
  typeof updateDedicatedServerSchema
>;
