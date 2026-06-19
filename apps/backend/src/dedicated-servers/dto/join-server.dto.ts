import { z } from 'zod';

export const joinServerSchema = z.object({
  stationIds: z.array(z.string().min(1)).min(1),
  carAcId: z.string().min(1),
  durationMinutes: z
    .union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)])
    .optional(),
});

export type JoinServerDto = z.infer<typeof joinServerSchema>;
