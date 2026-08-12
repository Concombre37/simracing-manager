import { z } from 'zod';

export const updateArcadeAttractionSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  players: z.string().trim().max(60).optional(),
  kind: z.string().trim().max(60).optional(),
  sortOrder: z.number().int().optional(),
});

export type UpdateArcadeAttractionDto = z.infer<
  typeof updateArcadeAttractionSchema
>;
