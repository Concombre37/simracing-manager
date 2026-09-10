-- Prices belong to food/drink menu items only; remove the unused catalog columns.
ALTER TABLE "content_labels"
  DROP COLUMN "public_price",
  DROP COLUMN "subscriber_price";
