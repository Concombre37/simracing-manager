import { describe, expect, it } from 'vitest';
import { collectModInventory } from './mods';
import type { Station } from './stations';

function station(
  stationId: string,
  role: Station['role'],
  content: Record<string, unknown> | null,
): Station {
  return {
    id: stationId,
    stationId,
    name: stationId,
    role,
    apiKeyHash: null,
    version: null,
    localIp: null,
    macAddress: null,
    lastSeenAt: null,
    status: 'offline',
    blankingActive: true,
    config: null,
    content,
    createdAt: '',
    updatedAt: '',
  };
}

describe('collectModInventory', () => {
  it('includes admin inventories and excludes spectator inventories', () => {
    const inventory = collectModInventory([
      station('pod1', 'simulator', { cars: [{ acId: 'car_a', name: 'Car A' }] }),
      station('concombre', 'admin', {
        cars: [{ acId: 'car_a', name: 'Car A' }, { acId: 'car_b' }],
      }),
      station('spectator', 'spectator', { cars: [{ acId: 'car_c', name: 'Car C' }] }),
    ]);

    expect(inventory.map((item) => item.acId)).toEqual(['car_a', 'car_b']);
    expect(inventory.find((item) => item.acId === 'car_a')?.stations).toEqual([
      { stationId: 'pod1', name: 'pod1', role: 'simulator', present: true },
      { stationId: 'concombre', name: 'concombre', role: 'admin', present: true },
    ]);
  });
});
