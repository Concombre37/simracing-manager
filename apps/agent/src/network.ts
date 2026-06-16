import { networkInterfaces } from 'os';

export function getLocalIp(): string | null {
  const interfaces = networkInterfaces();
  for (const [, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }
  return null;
}
