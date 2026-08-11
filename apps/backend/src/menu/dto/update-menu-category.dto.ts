import { z } from 'zod';
import { menuCategoryShape } from './create-menu-category.dto';

export const updateMenuCategorySchema = z.object(menuCategoryShape).partial();

export type UpdateMenuCategoryDto = z.infer<typeof updateMenuCategorySchema>;
