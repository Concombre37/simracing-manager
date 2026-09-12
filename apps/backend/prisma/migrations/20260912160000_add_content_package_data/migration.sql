-- Source agents upload a zip once; keeping it in PostgreSQL makes the
-- package survive backend container rebuilds and remain available to offline
-- stations when they reconnect.
ALTER TABLE "content_packages" ADD COLUMN "archive_data" BYTEA;
