import { promisify } from 'util';
import { Logger } from 'pino';
import wol from 'wake_on_lan';
import { getBroadcastAddresses } from './network';

const wake = promisify(wol.wake);

export async function sendWakeOnLan(
  macAddress: string,
  logger: Logger,
  targetIp?: string,
): Promise<void> {
  const normalized = macAddress.toLowerCase().replace(/-/g, ':');
  // Toujours en broadcast dirigé du sous-réseau, jamais en unicast vers
  // targetIp (gardé seulement pour le log ci-dessous) : un magic packet
  // envoyé en unicast IP vers une machine éteinte dépend de la résolution
  // ARP, qui échoue dès que le cache ARP du relais expire (la cible ne
  // répond jamais, étant éteinte) — le paquet est alors silencieusement
  // perdu par la pile réseau de l'OS, sans erreur remontée à l'application.
  // Le broadcast ne dépend d'aucune résolution ARP et atteint directement
  // la carte réseau de la cible au niveau liaison ; seule la carte dont le
  // magic packet contient la bonne MAC réagit, donc rien de plus n'est
  // réveillé par erreur.
  const addresses = getBroadcastAddresses(targetIp);

  logger.info({ macAddress: normalized, addresses, targetIp }, 'Sending Wake-on-LAN magic packet');

  const errors: Error[] = [];

  // Try standard port 9, then port 7, on every candidate interface. A
  // successful send on one interface is enough; the remaining attempts are
  // still useful when Windows has multiple active NICs and one route is
  // temporarily unavailable.
  let sent = false;
  for (const address of addresses) {
    for (const port of [9, 7]) {
      try {
        await wake(normalized, {
          address,
          port,
          num_packets: 5,
          interval: 100,
        });
        sent = true;
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
  }

  if (!sent) {
    throw new Error(
      `Failed to send Wake-on-LAN packets to ${addresses.join(', ')}: ${errors.map((e) => e.message).join('; ')}`,
    );
  }
}
