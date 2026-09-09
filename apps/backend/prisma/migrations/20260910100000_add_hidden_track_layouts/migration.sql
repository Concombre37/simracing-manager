ALTER TABLE "content_labels"
ADD COLUMN "hidden_layouts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
