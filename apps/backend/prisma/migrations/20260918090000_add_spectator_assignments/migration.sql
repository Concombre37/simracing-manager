CREATE TABLE "spectator_assignments" (
    "id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "server_id" UUID NOT NULL,
    "car_ac_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "spectator_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "spectator_assignments_station_id_key" ON "spectator_assignments"("station_id");
CREATE INDEX "spectator_assignments_server_id_idx" ON "spectator_assignments"("server_id");

ALTER TABLE "spectator_assignments" ADD CONSTRAINT "spectator_assignments_station_id_fkey"
  FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "spectator_assignments" ADD CONSTRAINT "spectator_assignments_server_id_fkey"
  FOREIGN KEY ("server_id") REFERENCES "dedicated_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
