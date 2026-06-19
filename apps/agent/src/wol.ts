import { promisify } from 'util';
import { Logger } from 'pino';
import wol from 'wake_on_lan';
import { getBroadcastAddress } from './network';

const wake = promisify(wol.wake);

export async function sendWakeOnLan(
  macAddress: string,
  logger: Logger,
  targetIp?: string,
): Promise<void> {
  const normalized = macAddress.toLowerCase().replace(/-/g, ':');
  const broadcast = getBroadcastAddress() ?? '255.255.255.255';
  const address = targetIp || broadcast;

  logger.info(
    { macAddress: normalized, address, broadcast, targetIp },
    'Sending Wake-on-LAN magic packet',
  );

  const errors: Error[] = [];

  // Try standard port 9, then port 7, with multiple packets.
  for (const port of [9, 7]) {
    try {
      await wake(normalized, {
        address,
        port,
        num_packets: 5,
        interval: 100,
      });
      logger.info({ macAddress: normalized, address, port }, 'Wake-on-LAN packet sent');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.warn(
        { err: error, macAddress: normalized, address, port },
        'Wake-on-LAN packet failed',
      );
      errors.push(error);
    }
  }

  if (errors.length === 2) {
    throw new Error(
      `Failed to send Wake-on-LAN packets to ${address}: ${errors.map((e) => e.message).join('; ')}`,
    );
  }
}
