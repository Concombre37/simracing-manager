-- Blanking media used to be stored on disk (uploads/blanking-media/...) with
-- only metadata in Postgres. The files on disk were lost (empty volume found
-- during audit while the DB still listed 20 rows), so binaries now live
-- directly in the database as bytea, guaranteeing they survive backups and
-- container rebuilds the same way the rest of the app's data does.

ALTER TABLE "blanking_media" ADD COLUMN "data" BYTEA;

-- Existing rows point at files that no longer exist on disk; there is no
-- binary to backfill, so drop them rather than keep unrecoverable metadata.
DELETE FROM "blanking_media" WHERE "data" IS NULL;

ALTER TABLE "blanking_media" ALTER COLUMN "data" SET NOT NULL;
