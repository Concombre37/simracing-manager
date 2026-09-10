-- Two independently editable prices are shown on the public tablet catalog.
ALTER TABLE "content_labels"
  ADD COLUMN "public_price" VARCHAR(30),
  ADD COLUMN "subscriber_price" VARCHAR(30);
