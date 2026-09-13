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
        'No online relay station found. Keep an admin agent connected on the network used by the PODs.',
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

  async restart(stationId: string): Promise<{ success: boolean }> {
    const station = await this.prisma.station.findUnique({
      where: { id: stationId },
    });
    if (!station) {
      throw new NotFoundException('Station not found');
    }

    await this.agentGateway.emitRestart(station.stationId);
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
      },
      select: { stationId: true, localIp: true, role: true },
    });

    // Prefer the old exact-subnet match. If the relay is a dual-homed admin
    // host, its heartbeat may expose the IP of its first NIC even though the
    // second NIC is physically connected to the POD network. The agent itself
    // can select the matching interface from targetIp, so an online admin is a
    // safe fallback when the single-IP heartbeat cannot prove the subnet.
    let adminFallback: { stationId: string } | null = null;
    for (const candidate of candidates) {
      if (
        candidate.localIp &&
        this.getSubnet(candidate.localIp) === targetSubnet
      ) {
        return { stationId: candidate.stationId };
      }
      if (candidate.role === 'admin' && !adminFallback) {
        adminFallback = { stationId: candidate.stationId };
      }
    }

    return adminFallback;
  }

  private getSubnet(ip: string | null): string | null {
    if (!ip) return null;
    const parts = ip.split('.');
    if (parts.length !== 4) return null;
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
  }
}
