import { z } from 'zod';
import { StationRole } from '@simracing/shared';

export const createStationSchema = z.object({
  stationId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(128),
  role: z.nativeEnum(StationRole).default(StationRole.SIMULATOR),
  config: z.record(z.unknown()).optional(),
});

export type CreateStationDto = z.infer<typeof createStationSchema>;
