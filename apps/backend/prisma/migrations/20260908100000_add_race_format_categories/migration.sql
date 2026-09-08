-- Keep the grouping optional so existing presets, including Practice libre,
-- remain available without being moved into a category.
ALTER TABLE "race_formats"
ADD COLUMN "category" TEXT;
