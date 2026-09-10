-- Optional subscriber price alongside the existing public menu price.
ALTER TABLE "menu_items"
  ADD COLUMN "subscriber_price" VARCHAR(30);
