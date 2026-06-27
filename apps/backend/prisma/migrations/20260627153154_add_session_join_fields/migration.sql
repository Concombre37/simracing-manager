-- AlterTable
ALTER TABLE "content_previews" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "car_ac_id" TEXT,
ADD COLUMN     "client_name" TEXT,
ADD COLUMN     "difficulty" TEXT,
ADD COLUMN     "duration_minutes" INTEGER,
ADD COLUMN     "server_id" UUID,
ADD COLUMN     "track" TEXT,
ADD COLUMN     "track_layout" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'direct_launch';
