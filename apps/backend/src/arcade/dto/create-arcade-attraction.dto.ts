import { z } from 'zod';

export const arcadeAttractionShape = {
  name: z.string().trim().min(1).max(120),
  players: z.string().trim().max(60).optional(),
  kind: z.string().trim().max(60).optional(),
  sortOrder: z.number().int().default(0),
};

export const createArcadeAttractionSchema = z.object(arcadeAttractionShape);

export type CreateArcadeAttractionDto = z.infer<
  typeof createArcadeAttractionSchema
>;
