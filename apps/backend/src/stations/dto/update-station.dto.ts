import { z } from 'zod';
import { StationRole } from '@simracing/shared';

export const updateStationSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  role: z.nativeEnum(StationRole).optional(),
  config: z.record(z.unknown()).optional(),
});

export type UpdateStationDto = z.infer<typeof updateStationSchema>;
