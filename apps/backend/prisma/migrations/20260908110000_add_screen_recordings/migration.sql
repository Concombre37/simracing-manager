CREATE TABLE "screen_recordings" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "duration_seconds" DOUBLE PRECISION,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "screen_recordings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "screen_recordings_created_at_idx" ON "screen_recordings"("created_at");
