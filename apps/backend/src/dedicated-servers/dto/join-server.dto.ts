import { z } from 'zod';
import { Difficulty } from '@simracing/shared';

export const joinPodSchema = z.object({
  stationId: z.string().min(1),
  carAcId: z.string().min(1),
  clientName: z.string().min(1).max(100).optional(),
  difficulty: z
    .enum([Difficulty.EASY, Difficulty.PRO, Difficulty.CUSTOM])
    .optional(),
});

export const joinServerSchema = z.object({
  pods: z.array(joinPodSchema).min(1),
  durationMinutes: z
    .union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)])
    .optional(),
});

export type JoinPodDto = z.infer<typeof joinPodSchema>;
export type JoinServerDto = z.infer<typeof joinServerSchema>;
