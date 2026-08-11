-- CreateTable
CREATE TABLE "race_formats" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "practice_enabled" BOOLEAN NOT NULL DEFAULT true,
    "practice_minutes" INTEGER NOT NULL DEFAULT 720,
    "qualifying_enabled" BOOLEAN NOT NULL DEFAULT false,
    "qualifying_minutes" INTEGER NOT NULL DEFAULT 15,
    "race_enabled" BOOLEAN NOT NULL DEFAULT false,
    "race_mode" TEXT NOT NULL DEFAULT 'LAPS',
    "race_laps" INTEGER NOT NULL DEFAULT 5,
    "race_minutes" INTEGER NOT NULL DEFAULT 20,
    "grid_type" TEXT NOT NULL DEFAULT 'NORMAL',
    "weather_graphics" TEXT[],
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "race_formats_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "race_formats" ADD CONSTRAINT "race_formats_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "dedicated_servers" ADD COLUMN "race_format_id" UUID;

-- AddForeignKey
ALTER TABLE "dedicated_servers" ADD CONSTRAINT "dedicated_servers_race_format_id_fkey" FOREIGN KEY ("race_format_id") REFERENCES "race_formats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed a default preset matching the previous hardcoded server_cfg.ini
-- behavior (v2.2.105: Practice-only, 12h, no Qualifying/Race) so the
-- "Créer un serveur" wizard always has at least one usable format right
-- after this migration runs, with no manual setup step required.
INSERT INTO "race_formats" ("id", "name", "description", "practice_enabled", "practice_minutes", "qualifying_enabled", "race_enabled", "weather_graphics", "updated_at")
VALUES (gen_random_uuid(), 'Practice libre (12h)', 'Conduite libre toute la journée, sans Qualifying ni Race — comportement par défaut.', true, 720, false, false, ARRAY['3_clear'], CURRENT_TIMESTAMP);
