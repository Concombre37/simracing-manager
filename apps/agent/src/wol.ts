import { promisify } from 'util';
import { Logger } from 'pino';
import wol from 'wake_on_lan';
import { getBroadcastAddress } from './network';

const wake = promisify(wol.wake);

export async function sendWakeOnLan(macAddress: string, logger: Logger): Promise<void> {
  const normalized = macAddress.toLowerCase().replace(/-/g, ':');
  const broadcast = getBroadcastAddress() ?? '255.255.255.255';

  logger.info({ macAddress: normalized, broadcast }, 'Sending Wake-on-LAN magic packet');

  try {
    await wake(normalized, { address: broadcast, num_packets: 3 });
    logger.info({ macAddress: normalized }, 'Wake-on-LAN packet sent');
  } catch (err) {
    logger.error({ err, macAddress: normalized }, 'Failed to send Wake-on-LAN packet');
    throw err;
  }
}
