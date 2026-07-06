import pino from 'pino';
import { acquireSingleInstance } from './singleInstance';
import { ensureAutoStart } from './autoStart';
import { LogFileStream } from './logFileStream';

// pino-pretty uses worker threads that may fail inside a pkg executable.
// Use a simple pretty-like formatter when packaged.
// pkg adds this property when running from the packaged executable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isPackaged = Boolean((process as any).pkg);

const logger = isPackaged
  ? pino(
      {
        timestamp: pino.stdTimeFunctions.isoTime,
        formatters: {
          level: (label) => ({ level: label.toUpperCase() }),
        },
        hooks: {
          logMethod(inputArgs, method) {
            const [msg, ...rest] = inputArgs;
            if (typeof msg === 'string') {
              return method.apply(this, [msg, ...rest]);
            }
            return method.apply(this, inputArgs);
          },
        },
      },
      new LogFileStream(),
    )
  : pino({
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    });

// Keep the console window open on Windows so users can read errors.
function pauseBeforeExit(code: number): void {
  if (process.platform !== 'win32') {
    process.exit(code);
    return;
  }

  try {
    if (process.stdout.isTTY) {
      process.stdout.write('\nAppuyez sur Entrée pour fermer...');
    }
    if (process.stdin.isTTY) {
      process.stdin.resume();
      process.stdin.once('data', () => {
        process.exit(code);
      });
      return;
    }
  } catch {
    // ignore TTY errors
  }
  process.exit(code);
}

async function main(): Promise<void> {
  // Lazy import so config errors are caught below.
  const { config, envPath } = await import('./config');
  const { SimRacingAgent } = await import('./agent');

  const scopedLogger = logger.child({
    version: config.VERSION,
    stationId: config.STATION_ID,
  });

  scopedLogger.info(`SimRacing Manager Agent v${config.VERSION} starting`);
  scopedLogger.info({ envPath, acPath: config.AC_PATH ?? null }, 'Loaded configuration from .env');
  const releaseLock = await acquireSingleInstance(scopedLogger);
  await ensureAutoStart(scopedLogger);
  const agent = new SimRacingAgent(scopedLogger);

  // Best-effort cleanup on a graceful shutdown (Ctrl+C, service stop) so the
  // blanking window doesn't orphan itself; killOrphanedProcess() on the next
  // startup is the real safety net for crashes/forceful kills this can't catch.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    scopedLogger.info({ signal }, 'Shutting down agent');
    void agent
      .stop()
      .catch(() => undefined)
      .finally(() => {
        releaseLock();
        process.exit(0);
      });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await agent.start();
  } finally {
    releaseLock();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error("[FATAL] Impossible de démarrer l'agent :", message);
  if (err instanceof Error && err.stack) {
    // eslint-disable-next-line no-console
    console.error(err.stack);
  }
  try {
    logger.fatal({ err }, 'Agent startup failed');
  } catch {
    // ignore logger errors during shutdown
  }
  pauseBeforeExit(1);
});
