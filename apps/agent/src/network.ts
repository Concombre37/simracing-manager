import { networkInterfaces } from 'os';

export interface NetworkInfo {
  ip: string | null;
  mac: string | null;
  broadcast: string | null;
}

function ipv4ToUint32(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  const octets = parts.map(Number);
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }

  return octets.reduce((value, octet) => ((value << 8) | octet) >>> 0, 0);
}

function uint32ToIpv4(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');
}

/** Calcule le broadcast réel de l'interface. Les installations ne sont pas
 * nécessairement en /24 (et Windows peut exposer des interfaces VPN/Hyper-V). */
export function calculateBroadcastAddress(ip: string, netmask: string): string | null {
  const ipValue = ipv4ToUint32(ip);
  const maskValue = ipv4ToUint32(netmask);
  if (ipValue === null || maskValue === null) return null;

  return uint32ToIpv4((ipValue | ~maskValue) >>> 0);
}

function findPrimaryInterface(targetIp?: string): NetworkInfo {
  const interfaces = networkInterfaces();
  const targetValue = targetIp ? ipv4ToUint32(targetIp) : null;
  const candidates = Object.values(interfaces)
    .flatMap((addrs) => addrs ?? [])
    .filter((addr) => addr.family === 'IPv4' && !addr.internal)
    .map((addr) => {
      const ipValue = ipv4ToUint32(addr.address);
      const maskValue = ipv4ToUint32(addr.netmask);
      const matchesTarget =
        targetValue !== null &&
        ipValue !== null &&
        maskValue !== null &&
        (targetValue & maskValue) === (ipValue & maskValue);
      const prefixLength = maskValue === null ? 0 : countSetBits(maskValue);

      return {
        info: {
          ip: addr.address,
          mac: addr.mac || null,
          broadcast: calculateBroadcastAddress(addr.address, addr.netmask),
        },
        matchesTarget,
        prefixLength,
      };
    });

  // Si une cible est fournie, ne jamais retomber sur le broadcast dirigé
  // d'une interface sans rapport. Le caller utilisera alors 255.255.255.255.
  if (targetIp) {
    if (targetValue === null) return { ip: null, mac: null, broadcast: null };
    const matches = candidates.filter((candidate) => candidate.matchesTarget);
    matches.sort((a, b) => b.prefixLength - a.prefixLength);
    return matches[0]?.info ?? { ip: null, mac: null, broadcast: null };
  }

  // Sans cible (heartbeat), conserver l'interface primaire historique.
  return candidates[0]?.info ?? { ip: null, mac: null, broadcast: null };
}

function countSetBits(value: number): number {
  let count = 0;
  let remaining = value >>> 0;
  while (remaining) {
    count += remaining & 1;
    remaining >>>= 1;
  }
  return count;
}

export function getLocalIp(): string | null {
  return findPrimaryInterface().ip;
}

export function getMacAddress(): string | null {
  return findPrimaryInterface().mac;
}

export function getBroadcastAddress(targetIp?: string): string | null {
  return findPrimaryInterface(targetIp).broadcast;
}
