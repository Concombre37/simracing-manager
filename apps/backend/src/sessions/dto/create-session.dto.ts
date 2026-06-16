import { z } from 'zod';

export const createSessionSchema = z.object({
  stationId: z.string().uuid(),
  config: z.record(z.unknown()),
});

export type CreateSessionDto = z.infer<typeof createSessionSchema>;
