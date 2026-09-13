import { PowerManagementService } from './power-management.service';
import { StationStatus } from '@simracing/shared';

describe('PowerManagementService', () => {
  it('uses an online admin as relay when its heartbeat IP is on another NIC', async () => {
    const prisma = {
      station: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'pod-db-id',
            stationId: 'pod2',
            macAddress: 'AA-BB-CC-DD-EE-FF',
            localIp: '192.168.10.101',
          })
          .mockResolvedValueOnce(undefined),
        findMany: jest.fn().mockResolvedValue([
          {
            stationId: 'win-serv',
            localIp: '192.168.1.20',
            role: 'admin',
            status: StationStatus.ONLINE,
          },
        ]),
      },
    };
    const agentGateway = { emitWakeOnLan: jest.fn().mockResolvedValue(undefined) };
    const service = new PowerManagementService(prisma as never, agentGateway as never);

    const result = await service.wake('pod-db-id');

    expect(result.relayStationId).toBe('win-serv');
    expect(agentGateway.emitWakeOnLan).toHaveBeenCalledWith('win-serv', {
      targetMac: 'AA-BB-CC-DD-EE-FF',
      targetIp: '192.168.10.101',
    });
  });
});
