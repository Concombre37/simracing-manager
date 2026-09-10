import { z } from 'zod';

export const menuItemShape = {
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(120),
  // Long descriptions are used for product variants (for example, a full
  // list of available ice-cream flavours).
  description: z.string().max(1000).optional(),
  // Texte libre ("9,50 €") — juste affiché sur la tablette, pas un calcul.
  price: z.string().min(1).max(30),
  subscriberPrice: z.string().max(30).optional(),
  sortOrder: z.number().int().default(0),
};

export const createMenuItemSchema = z.object(menuItemShape);

export type CreateMenuItemDto = z.infer<typeof createMenuItemSchema>;
