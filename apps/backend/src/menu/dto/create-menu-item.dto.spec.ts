import { createMenuItemSchema } from './create-menu-item.dto';

const validItem = {
  categoryId: 'f53d62b4-d3cc-4ef7-a71d-42dbe8c5806e',
  name: 'Croque-monsieur',
  price: '9,50 €',
};

describe('createMenuItemSchema', () => {
  it('accepts an item without a weight', () => {
    expect(createMenuItemSchema.safeParse(validItem).success).toBe(true);
  });

  it('accepts a null weight from the food form', () => {
    expect(createMenuItemSchema.safeParse({ ...validItem, grams: null }).success).toBe(true);
  });

  it('still rejects an invalid weight', () => {
    expect(createMenuItemSchema.safeParse({ ...validItem, grams: -1 }).success).toBe(false);
  });
});
