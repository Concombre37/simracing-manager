-- CreateTable
CREATE TABLE "content_previews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "station_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "ac_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_previews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "content_previews_station_id_type_ac_id_key" ON "content_previews"("station_id", "type", "ac_id");

-- AddForeignKey
ALTER TABLE "content_previews" ADD CONSTRAINT "content_previews_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
