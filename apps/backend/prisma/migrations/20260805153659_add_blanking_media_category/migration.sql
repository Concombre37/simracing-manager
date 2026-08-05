-- AlterTable
ALTER TABLE "blanking_media" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'idle';

-- DropIndex
DROP INDEX "blanking_media_station_id_order_key";

-- CreateIndex
CREATE UNIQUE INDEX "blanking_media_station_id_category_order_key" ON "blanking_media"("station_id", "category", "order");
