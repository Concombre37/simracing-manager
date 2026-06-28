import axios from 'axios';
import { Logger } from 'pino';

export async function waitForServerReachable(
  serverUrl: string,
  logger: Logger,
  timeoutMs = 10000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await axios.get(serverUrl, { timeout: 2000, validateStatus: () => true });
      return true;
    } catch (err) {
      logger.debug({ err: (err as Error).message }, 'Server not reachable yet, retrying...');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  return false;
}
