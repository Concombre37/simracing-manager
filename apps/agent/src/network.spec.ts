import { networkInterfaces } from 'os';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateBroadcastAddress, getBroadcastAddress } from './network';

vi.mock('os', () => ({ networkInterfaces: vi.fn() }));

beforeEach(() => {
  vi.mocked(networkInterfaces).mockReturnValue({
    'Hyper-V': [
      {
        address: '172.20.0.1',
        netmask: '255.255.240.0',
        family: 'IPv4',
        mac: '00:00:00:00:00:01',
        internal: false,
        cidr: '172.20.0.1/20',
      },
    ],
    Ethernet: [
      {
        address: '192.168.1.63',
        netmask: '255.255.255.0',
        family: 'IPv4',
        mac: '00:00:00:00:00:02',
        internal: false,
        cidr: '192.168.1.63/24',
      },
    ],
  });
});

describe('calculateBroadcastAddress', () => {
  it('calcule un broadcast /24', () => {
    expect(calculateBroadcastAddress('192.168.1.63', '255.255.255.0')).toBe('192.168.1.255');
  });

  it('respecte les sous-réseaux qui ne sont pas en /24', () => {
    expect(calculateBroadcastAddress('10.42.18.9', '255.255.240.0')).toBe('10.42.31.255');
  });

  it('rejette une adresse IPv4 invalide', () => {
    expect(calculateBroadcastAddress('192.168.1.999', '255.255.255.0')).toBeNull();
  });

  it("choisit l'interface qui mène réellement au POD cible", () => {
    expect(getBroadcastAddress('192.168.1.64')).toBe('192.168.1.255');
  });

  it("ne réutilise pas le broadcast d'une interface sans rapport", () => {
    expect(getBroadcastAddress('10.0.0.12')).toBeNull();
  });
});
