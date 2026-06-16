import { z } from 'zod';

export const joinServerSchema = z.object({
  stationIds: z.array(z.string().uuid()).min(1),
});

export type JoinServerDto = z.infer<typeof joinServerSchema>;
