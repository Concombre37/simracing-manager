import { z } from 'zod';

export const upsertContentLabelSchema = z.object({
  type: z.enum(['car', 'track']),
  acId: z.string().min(1),
  displayName: z.string().trim().max(120),
});

export type UpsertContentLabelDto = z.infer<typeof upsertContentLabelSchema>;
