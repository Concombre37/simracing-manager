import { z } from 'zod';
import { menuItemShape } from './create-menu-item.dto';

export const updateMenuItemSchema = z.object(menuItemShape).partial();

export type UpdateMenuItemDto = z.infer<typeof updateMenuItemSchema>;
