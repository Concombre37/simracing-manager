import { networkInterfaces } from 'os';

export interface NetworkInfo {
  ip: string | null;
  mac: string | null;
  broadcast: string | null;
}

function findPrimaryInterface(): NetworkInfo {
  const interfaces = networkInterfaces();
  for (const [, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        const parts = addr.address.split('.');
        const broadcast = parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.255` : null;
        return {
          ip: addr.address,
          mac: addr.mac || null,
          broadcast,
        };
      }
    }
  }
  return { ip: null, mac: null, broadcast: null };
}

export function getLocalIp(): string | null {
  return findPrimaryInterface().ip;
}

export function getMacAddress(): string | null {
  return findPrimaryInterface().mac;
}

export function getBroadcastAddress(): string | null {
  return findPrimaryInterface().broadcast;
}
