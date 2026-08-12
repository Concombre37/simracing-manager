import { z } from 'zod';

export const contentCategoryShape = {
  type: z.enum(['car', 'track']),
  name: z.string().trim().min(1).max(60),
  sortOrder: z.number().int().default(0),
};

export const createContentCategorySchema = z.object(contentCategoryShape);

export type CreateContentCategoryDto = z.infer<
  typeof createContentCategorySchema
>;
