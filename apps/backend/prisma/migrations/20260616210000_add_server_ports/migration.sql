-- AlterTable
ALTER TABLE "dedicated_servers" ADD COLUMN     "udp_port" INTEGER,
ADD COLUMN     "tcp_port" INTEGER,
ADD COLUMN     "http_port" INTEGER;
