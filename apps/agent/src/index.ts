import pino from 'pino';
import { config } from './config';
import { SimRacingAgent } from './agent';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

const agent = new SimRacingAgent(logger);

async function main(): Promise<void> {
  logger.info({ stationId: config.STATION_ID }, 'SimRacing Manager Agent v2.0.0 starting');
  await agent.start();
}

void main();

process.on('SIGINT', async () => {
  logger.info('Shutting down agent');
  await agent.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down agent');
  await agent.stop();
  process.exit(0);
});
