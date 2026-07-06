import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { AcSharedMemoryChecker } from './acSharedMemory';

vi.mock('child_process', async (importOriginal) => {
  const mod = (await importOriginal()) as typeof import('child_process');
  return {
    ...mod,
    spawn: vi.fn(),
  };
});

function createFakeProcess() {
  const proc = new EventEmitter() as ReturnType<typeof spawn>;
  proc.stdout = new EventEmitter() as never;
  proc.stderr = new EventEmitter() as never;
  proc.kill = vi.fn();
  return proc;
}

function respondWith(json: Record<string, unknown>) {
  const proc = createFakeProcess();
  vi.mocked(spawn).mockReturnValue(proc);
  queueMicrotask(() => {
    (proc.stdout as unknown as EventEmitter).emit('data', Buffer.from(JSON.stringify(json)));
    proc.emit('close', 0);
  });
  return proc;
}

describe('AcSharedMemoryChecker', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as import('pino').Logger;

  let checker: AcSharedMemoryChecker;
  let originalPlatform: PropertyDescriptor;

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    checker = new AcSharedMemoryChecker(mockLogger);
    (checker as unknown as { scriptPath: string }).scriptPath = 'C:\\fake\\check.ps1';
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform);
    vi.restoreAllMocks();
  });

  it('reports loaded when all three mappings exist and packetId is fresh', async () => {
    respondWith({ acpmf_physics: true, acpmf_graphics: true, acpmf_static: true, fresh: true });
    expect(await checker.isAcLoaded()).toBe(true);
  });

  it('does not report loaded when mappings exist but packetId is frozen (stale)', async () => {
    respondWith({ acpmf_physics: true, acpmf_graphics: true, acpmf_static: true, fresh: false });
    expect(await checker.isAcLoaded()).toBe(false);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('reports not loaded when a mapping is missing entirely', async () => {
    respondWith({ acpmf_physics: false, acpmf_graphics: false, acpmf_static: false, fresh: false });
    expect(await checker.isAcLoaded()).toBe(false);
  });
});
