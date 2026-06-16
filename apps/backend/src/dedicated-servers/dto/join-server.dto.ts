import { z } from 'zod';

export const joinServerSchema = z.object({
  stationIds: z.array(z.string().min(1)).min(1),
  carAcId: z.string().min(1),
});

export type JoinServerDto = z.infer<typeof joinServerSchema>;
