import { StationRole } from '@simracing/shared';
import { BulkActionsService } from './bulk-actions.service';

describe('BulkActionsService', () => {
  const stationsService = {
    findOne: jest.fn(),
  };
  const agentGateway = {
    emitBlankingHide: jest.fn(),
    emitBlankingShow: jest.fn(),
    emitUpdateAgent: jest.fn(),
    emitContentSync: jest.fn(),
  };
  const powerManagementService = {
    wake: jest.fn(),
    shutdown: jest.fn(),
    restart: jest.fn(),
  };

  const service = new BulkActionsService(
    stationsService as never,
    agentGateway as never,
    powerManagementService as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('refuse une action groupée visant un poste administrateur', async () => {
    stationsService.findOne.mockResolvedValue({
      id: 'admin-id',
      stationId: 'admin-pc',
      name: 'Poste admin',
      role: StationRole.ADMIN,
    });

    const result = await service.wake(['admin-id']);

    expect(result.succeeded).toEqual([]);
    expect(result.failed[0]).toMatchObject({ stationId: 'admin-id' });
    expect(result.failed[0].error).toContain('administrateur');
    expect(powerManagementService.wake).not.toHaveBeenCalled();
  });

  it('laisse passer une action groupée visant un POD', async () => {
    stationsService.findOne.mockResolvedValue({
      id: 'pod-id',
      stationId: 'pod-2',
      name: 'POD 2',
      role: StationRole.SIMULATOR,
    });
    powerManagementService.wake.mockResolvedValue({});

    const result = await service.wake(['pod-id']);

    expect(result).toEqual({ succeeded: ['pod-id'], failed: [] });
    expect(powerManagementService.wake).toHaveBeenCalledWith('pod-id');
  });
});
