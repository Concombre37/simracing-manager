import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from 'pino';
import { config } from './config';
import { LaunchDedicatedServerPayload } from '@simracing/shared';

export class ServerLauncher {
  private currentProcess: ChildProcess | null = null;
  private currentServerId: string | null = null;

  constructor(private readonly logger: Logger) {}

  async launch(payload: LaunchDedicatedServerPayload): Promise<string> {
    this.logger.info({ serverId: payload.serverId }, 'Launching dedicated server');

    const acPath =
      config.AC_PATH ??
      path.join(process.env.ProgramFiles ?? '', 'Steam', 'steamapps', 'common', 'assettocorsa');
    const serverExe = path.join(acPath, 'server', 'acServer.exe');

    const serverDir = path.join(
      process.env.USERPROFILE ?? '',
      'Documents',
      'Assetto Corsa',
      'servers',
      payload.serverId,
    );
    await fs.mkdir(serverDir, { recursive: true });

    const cfgDir = path.join(serverDir, 'cfg');
    await fs.mkdir(cfgDir, { recursive: true });

    const cfgPath = path.join(cfgDir, 'server_cfg.ini');
    const entryListPath = path.join(cfgDir, 'entry_list.ini');
    const logPath = path.join(serverDir, 'server.log');

    await this.writeServerConfig(cfgDir, payload);

    this.currentProcess = spawn(serverExe, ['-c', cfgPath, '-e', entryListPath], {
      cwd: serverDir,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.currentServerId = payload.serverId;

    this.pipeToLog(this.currentProcess, logPath);

    this.currentProcess.on('error', (err) => {
      this.logger.error({ err, serverId: payload.serverId }, 'Server process error');
    });

    this.currentProcess.on('exit', (code) => {
      this.logger.info({ code, serverId: payload.serverId }, 'Server process exited');
      this.currentProcess = null;
      this.currentServerId = null;
    });

    return serverDir;
  }

  async stop(serverId: string): Promise<void> {
    if (this.currentServerId !== serverId) {
      this.logger.warn({ serverId }, 'No matching server process to stop');
      return;
    }

    this.logger.info({ serverId }, 'Stopping dedicated server');
    if (this.currentProcess && !this.currentProcess.killed) {
      this.currentProcess.kill('SIGTERM');
    }
    if (process.platform === 'win32') {
      spawn('taskkill', ['/F', '/IM', 'acServer.exe'], { stdio: 'ignore' });
    }
    this.currentProcess = null;
    this.currentServerId = null;
  }

  private pipeToLog(child: ChildProcess, logPath: string): void {
    const writeLog = async (data: Buffer) => {
      try {
        await fs.appendFile(logPath, data.toString(), 'utf-8');
      } catch {
        // ignore
      }
    };
    child.stdout?.on('data', writeLog);
    child.stderr?.on('data', writeLog);
    child.on('exit', (code) => {
      void fs.appendFile(logPath, `[serverLauncher] Process exited with code ${code}\n`, 'utf-8');
    });
  }

  private async writeServerConfig(
    cfgDir: string,
    payload: LaunchDedicatedServerPayload,
  ): Promise<void> {
    const serverCfgPath = path.join(cfgDir, 'server_cfg.ini');
    const entryListPath = path.join(cfgDir, 'entry_list.ini');

    const carIds = payload.cars.length > 0 ? payload.cars : ['ks_mazda_mx5_cup'];

    const serverCfg = [
      '[SERVER]',
      `NAME=${payload.name}`,
      `CARS=${carIds.join(';')}`,
      `CONFIG_TRACK=${payload.trackLayout ?? ''}`,
      `TRACK=${payload.track}`,
      `SUN_ANGLE=-48`,
      `PASSWORD=${payload.password ?? ''}`,
      `ADMIN_PASSWORD=${payload.rconPassword ?? 'admin'}`,
      `UDP_PORT=9600`,
      `TCP_PORT=9600`,
      `HTTP_PORT=8081`,
      `MAX_CLIENTS=${payload.maxClients}`,
      'PICKUP_MODE_ENABLED=1',
      'LOOP_MODE=1',
      'SLEEP_TIME=1',
      'ALLOWED_TYRES_OUT=2',
      'QUALIFY_MAX_WAIT_PERC=120',
      'RACE_OVER_TIME=60',
      'RESULT_SCREEN_TIME=20',
      'START_RULE=2',
      'NUM_THREADS=2',
      'REGISTER_TO_LOBBY=1',
      'MINIMUM_SECURITY_LEVEL=1',
      '',
      '[PRACTICE]',
      'NAME=Practice',
      'TIME=60',
      'IS_OPEN=1',
      '',
      '[QUALIFY]',
      'NAME=Qualify',
      'TIME=30',
      'IS_OPEN=1',
      '',
      '[RACE]',
      'NAME=Race',
      'LAPS=5',
      'WAIT_FOR_OTHERS=1',
      'IS_OPEN=1',
      '',
      '[DYNAMIC_TRACK]',
      'SESSION_START=89',
      'RANDOMNESS=2',
      'SESSION_TRANSFER=89',
      'LAP_GAIN=50',
      '',
      '[WEATHER_0]',
      'GRAPHICS=3_clear',
      'BASE_TEMPERATURE_AMBIENT=20',
      'BASE_TEMPERATURE_ROAD=7',
      'VARIATION_AMBIENT=1',
      'VARIATION_ROAD=1',
      '',
    ].join('\n');

    let entryList = '';
    for (let i = 0; i < payload.maxClients; i++) {
      entryList += `[CAR_${i}]\nMODEL=${carIds[i % carIds.length]}\nSKIN=random\nSPECTATOR_MODE=0\nDRIVERNAME=\nTEAM=\nGUID=\nBALLAST=0\n`;
    }

    await fs.writeFile(serverCfgPath, serverCfg, 'utf-8');
    await fs.writeFile(entryListPath, entryList, 'utf-8');

    this.logger.info({ cfgDir }, 'Server config written');
  }
}
