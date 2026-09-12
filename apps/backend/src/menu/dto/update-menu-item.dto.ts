import { z } from 'zod';
import { menuItemShape } from './create-menu-item.dto';

// `null` explicitly clears an optional subscriber price when an existing
// article is edited; omitted fields keep their previous value.
export const updateMenuItemSchema = z
  .object({
    ...menuItemShape,
    // `null` explicitly clears an existing description when an item is edited.
    description: z.string().max(1000).nullable().optional(),
    subscriberPrice: z.string().max(30).nullable().optional(),
    grams: z.number().int().min(0).max(100000).nullable().optional(),
  })
  .partial();

export type UpdateMenuItemDto = z.infer<typeof updateMenuItemSchema>;
