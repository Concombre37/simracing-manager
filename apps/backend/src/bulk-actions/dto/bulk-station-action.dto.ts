import { z } from 'zod';

export const bulkStationActionSchema = z.object({
  stationIds: z.array(z.string().uuid()).min(1),
});

export type BulkStationActionDto = z.infer<typeof bulkStationActionSchema>;
