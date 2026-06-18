import { z } from 'zod';

export const reorderBlankingMediaSchema = z.object({
  mediaIds: z.array(z.string().uuid()).min(1),
});

export type ReorderBlankingMediaDto = z.infer<
  typeof reorderBlankingMediaSchema
>;
