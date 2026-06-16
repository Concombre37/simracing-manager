import { z } from 'zod';

export const createStationSchema = z.object({
  stationId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(128),
  config: z.record(z.unknown()).optional(),
});

export type CreateStationDto = z.infer<typeof createStationSchema>;
