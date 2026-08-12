-- CreateTable
CREATE TABLE "arcade_attractions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "players" TEXT,
    "kind" TEXT,
    "photo" BYTEA,
    "photo_mime_type" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arcade_attractions_pkey" PRIMARY KEY ("id")
);
