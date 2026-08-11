import { z } from 'zod';

export const upsertContentLabelSchema = z.object({
  type: z.enum(['car', 'track']),
  acId: z.string().min(1),
  displayName: z.string().trim().max(120),
  category: z.string().trim().max(60).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
});

export type UpsertContentLabelDto = z.infer<typeof upsertContentLabelSchema>;
