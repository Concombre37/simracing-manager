import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentGateway } from '../agent/agent.gateway';
import { StationStatus } from '@simracing/shared';

@Injectable()
export class PowerManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentGateway: AgentGateway,
  ) {}

  async wake(stationId: string): Promise<{
    relayStationId: string;
    targetMac: string;
    targetIp: string | null;
  }> {
    const target = await this.prisma.station.findUnique({
      where: { id: stationId },
    });
    if (!target) {
      throw new NotFoundException('Station not found');
    }

    if (!target.macAddress) {
      throw new BadRequestException(
        `Station ${target.stationId} has no MAC address. Ensure its agent is online and up to date.`,
      );
    }

    const targetSubnet = this.getSubnet(target.localIp);
    if (!targetSubnet) {
      throw new BadRequestException(
        `Station ${target.stationId} has no local IP, cannot determine subnet for Wake-on-LAN.`,
      );
    }

    const relay = await this.findRelay(target.id, targetSubnet);
    if (!relay) {
      throw new BadRequestException(
        'No online station found on the same subnet to relay the Wake-on-LAN packet.',
      );
    }

    await this.agentGateway.emitWakeOnLan(relay.stationId, {
      targetMac: target.macAddress,
      targetIp: target.localIp ?? undefined,
    });

    return {
      relayStationId: relay.stationId,
      targetMac: target.macAddress,
      targetIp: target.localIp,
    };
  }

  async shutdown(stationId: string): Promise<{ success: boolean }> {
    const station = await this.prisma.station.findUnique({
      where: { id: stationId },
    });
    if (!station) {
      throw new NotFoundException('Station not found');
    }

    await this.agentGateway.emitShutdown(station.stationId);
    return { success: true };
  }

  private async findRelay(
    targetId: string,
    targetSubnet: string,
  ): Promise<{ stationId: string } | null> {
    const candidates = await this.prisma.station.findMany({
      where: {
        id: { not: targetId },
        status: { in: [StationStatus.ONLINE, StationStatus.IN_GAME] },
        localIp: { not: null },
      },
      select: { stationId: true, localIp: true },
    });

    for (const candidate of candidates) {
      if (
        candidate.localIp &&
        this.getSubnet(candidate.localIp) === targetSubnet
      ) {
        return { stationId: candidate.stationId };
      }
    }

    return null;
  }

  private getSubnet(ip: string | null): string | null {
    if (!ip) return null;
    const parts = ip.split('.');
    if (parts.length !== 4) return null;
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
  }
}
