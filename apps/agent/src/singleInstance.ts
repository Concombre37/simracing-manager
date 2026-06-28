import net from 'net';
import { Logger } from 'pino';

const LOCK_PORT = 33291;
const PING = 'simracing-agent-ping';
const PONG = 'simracing-agent-pong';

export async function acquireSingleInstance(logger: Logger): Promise<() => void> {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      socket.on('data', (data) => {
        if (data.toString().trim() === PING) {
          socket.write(PONG);
        }
      });
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        verifyExistingAgent(logger)
          .then((exists) => {
            if (exists) {
              logger.warn('Another SimRacing Manager Agent instance is already running. Exiting.');
              process.exit(0);
            } else {
              logger.warn(
                { lockPort: LOCK_PORT },
                'Lock port is in use by another application. Proceeding without single-instance lock.',
              );
              resolve(() => {});
            }
          })
          .catch(reject);
        return;
      }
      reject(err);
    });

    server.listen(LOCK_PORT, () => {
      logger.debug({ lockPort: LOCK_PORT }, 'Single-instance lock acquired');
      resolve(() => server.close());
    });
  });
}

async function verifyExistingAgent(logger: Logger): Promise<boolean> {
  return new Promise((resolve) => {
    const client = net.createConnection({ port: LOCK_PORT, timeout: 2000 }, () => {
      client.write(PING);
    });

    let response = '';
    client.on('data', (data) => {
      response += data.toString();
      if (response.includes(PONG)) {
        client.end();
        resolve(true);
      }
    });

    client.on('error', (err) => {
      logger.debug({ err: err.message }, 'Failed to contact existing lock holder');
      resolve(false);
    });

    client.on('timeout', () => {
      client.end();
      resolve(false);
    });

    client.on('end', () => {
      resolve(response.includes(PONG));
    });
  });
}
