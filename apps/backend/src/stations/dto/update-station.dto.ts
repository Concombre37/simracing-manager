import { z } from 'zod';

export const updateStationSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  config: z.record(z.unknown()).optional(),
});

export type UpdateStationDto = z.infer<typeof updateStationSchema>;
