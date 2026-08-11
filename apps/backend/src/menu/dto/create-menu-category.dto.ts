import { z } from 'zod';

export const menuCategoryShape = {
  section: z.enum(['food', 'drinks']),
  title: z.string().min(1).max(120),
  subtitle: z.string().max(200).optional(),
  sortOrder: z.number().int().default(0),
};

export const createMenuCategorySchema = z.object(menuCategoryShape);

export type CreateMenuCategoryDto = z.infer<typeof createMenuCategorySchema>;
