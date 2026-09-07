import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  root: `${process.cwd()}/.tmp-auto-drive-test`,
  bridge: {
    autoStart: vi.fn(async () => undefined),
    setAutoDriveFlag: vi.fn(async () => undefined),
    clearAutoDriveFlag: vi.fn(async () => undefined),
    clearCommand: vi.fn(async () => undefined),
    setClientName: vi.fn(async () => undefined),
    setSessionId: vi.fn(async () => undefined),
  },
}));

vi.mock('./config', () => ({
  config: {
    DOCUMENTS_PATH: `${testState.root}/documents`,
    LAUNCH_MODE: 'ac',
    SCREEN_MODE: 'single',
    ASSIST_PRESET: 'pro',
  },
}));

vi.mock('./luaBridge', () => ({
  LuaBridge: vi.fn(() => testState.bridge),
}));

vi.mock('./acPathResolver', () => ({
  resolveAcInstallPath: vi.fn(async () => `${testState.root}/assettocorsa`),
}));

vi.mock('child_process', async (importOriginal) => {
  const original = (await importOriginal()) as typeof import('child_process');
  return {
    ...original,
    spawn: vi.fn(() => {
      const process = new EventEmitter() as EventEmitter & { unref: () => void };
      process.unref = vi.fn();
      queueMicrotask(() => process.emit('exit', 0));
      return process;
    }),
  };
});

import { AcLauncher } from './acLauncher';

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as import('pino').Logger;

describe('AcLauncher mandatory auto-Drive', () => {
  beforeAll(async () => {
    await fs.mkdir(path.join(testState.root, 'assettocorsa'), { recursive: true });
    await fs.writeFile(path.join(testState.root, 'assettocorsa', 'acs.exe'), 'test');
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await fs.rm(testState.root, { recursive: true, force: true });
  });

  it('arms persistent auto-Drive for a normal launch before requesting Drive', async () => {
    const launcher = new AcLauncher(logger);

    await launcher.launch({
      stationId: 'pod01',
      sessionId: 'session-1',
      config: { carId: 'car', trackId: 'track' },
    });

    expect(testState.bridge.setAutoDriveFlag).toHaveBeenCalledTimes(1);
    expect(testState.bridge.autoStart).toHaveBeenCalledTimes(1);
    expect(testState.bridge.setAutoDriveFlag.mock.invocationCallOrder[0]).toBeLessThan(
      testState.bridge.autoStart.mock.invocationCallOrder[0],
    );
  });

  it('arms persistent auto-Drive for every dedicated-server race format', async () => {
    const formats = ['Practice libre (12h)', 'Qualifications', 'Course'];

    for (const [index, serverName] of formats.entries()) {
      const launcher = new AcLauncher(logger);
      await launcher.joinServer({
        host: '10.0.0.10',
        port: 9600 + index,
        httpPort: 8081 + index,
        carAcId: 'car',
        track: 'track',
        serverName,
      });
    }

    expect(testState.bridge.setAutoDriveFlag).toHaveBeenCalledTimes(formats.length);
    expect(testState.bridge.autoStart).toHaveBeenCalledTimes(formats.length);
  });

  it('clears the persistent auto-Drive request when Assetto Corsa stops', async () => {
    const launcher = new AcLauncher(logger);

    await launcher.stop();

    expect(testState.bridge.clearCommand).toHaveBeenCalledTimes(1);
    expect(testState.bridge.clearAutoDriveFlag).toHaveBeenCalledTimes(1);
  });
});
