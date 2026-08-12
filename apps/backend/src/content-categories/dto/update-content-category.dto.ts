import { z } from 'zod';

// `type` n'est pas modifiable après création — renommer/réordonner
// seulement, changer le type reviendrait à recréer une autre catégorie.
export const updateContentCategorySchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  sortOrder: z.number().int().optional(),
});

export type UpdateContentCategoryDto = z.infer<
  typeof updateContentCategorySchema
>;
