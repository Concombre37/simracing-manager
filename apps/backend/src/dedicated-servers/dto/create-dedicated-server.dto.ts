import { z } from 'zod';

export const createDedicatedServerSchema = z.object({
  name: z.string().min(1).max(128),
  stationId: z.string().uuid(),
  track: z.string().min(1),
  trackLayout: z.string().optional(),
  cars: z.array(z.string()).min(1),
  maxClients: z.number().int().min(1).max(64).default(10),
  password: z.string().optional(),
  rconPassword: z.string().optional(),
});

export type CreateDedicatedServerDto = z.infer<
  typeof createDedicatedServerSchema
>;
