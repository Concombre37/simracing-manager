-- DropForeignKey
ALTER TABLE "blanking_media" DROP CONSTRAINT "blanking_media_station_id_fkey";

-- AlterTable
ALTER TABLE "blanking_media" ALTER COLUMN "station_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "blanking_media" ADD CONSTRAINT "blanking_media_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
