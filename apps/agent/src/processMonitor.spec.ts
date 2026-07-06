import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';
import { ProcessMonitor } from './processMonitor';

vi.mock('child_process', async (importOriginal) => {
  const mod = (await importOriginal()) as typeof import('child_process');
  const nodeUtil = await import('util');

  const execFileMock = vi.fn(
    (
      file: string,
      args: string[],
      cb: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      cb(null, '', '');
      return {} as unknown;
    },
  );
  // execFile has custom util.promisify.custom behavior in real Node
  // (resolves {stdout, stderr} instead of the generic single-value
  // convention) — a plain vi.fn() mock loses that, so it must be
  // reattached here or `promisify(execFile)` in processMonitor.ts
  // silently returns the wrong shape.
  Object.defineProperty(execFileMock, nodeUtil.promisify.custom, {
    value: (file: string, args: string[]) =>
      new Promise((resolve, reject) => {
        execFileMock(file, args, (err, stdout, stderr) => {
          if (err) reject(err);
          else resolve({ stdout, stderr });
        });
      }),
  });

  return {
    ...mod,
    execFile: execFileMock,
  };
});

function mockTasklistOutput(csvLine: string) {
  vi.mocked(execFile).mockImplementation(((file: string, args: string[], cb: any) => {
    if (file === 'tasklist') {
      cb(null, csvLine, '');
    } else if (file === 'taskkill') {
      cb(null, '', '');
    }
    return {} as any;
  }) as any);
}

describe('ProcessMonitor', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as import('pino').Logger;

  let monitor: ProcessMonitor;
  let originalPlatform: PropertyDescriptor;

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    monitor = new ProcessMonitor(mockLogger);
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform);
    vi.restoreAllMocks();
  });

  it('returns false when acs.exe is not in the process list', async () => {
    mockTasklistOutput('INFO: No tasks are running which match the specified criteria.');
    expect(await monitor.isAcRunning()).toBe(false);
  });

  it('returns true when acs.exe is running and responding', async () => {
    mockTasklistOutput(
      '"acs.exe","1234","Console","1","123,456 K","Running","USER","0:00:01","N/A"',
    );
    expect(await monitor.isAcRunning()).toBe(true);
  });

  it('returns false (not just "running") when acs.exe exists but is not responding', async () => {
    mockTasklistOutput(
      '"acs.exe","1234","Console","1","123,456 K","Not Responding","USER","0:00:01","N/A"',
    );
    expect(await monitor.isAcRunning()).toBe(false);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('does not force-kill on the first not-responding observation', async () => {
    mockTasklistOutput(
      '"acs.exe","1234","Console","1","123,456 K","Not Responding","USER","0:00:01","N/A"',
    );
    await monitor.isAcRunning();
    const killCalls = vi.mocked(execFile).mock.calls.filter(([file]) => file === 'taskkill');
    expect(killCalls).toHaveLength(0);
  });

  it('force-kills acs.exe once it has been unresponsive past the safety threshold', async () => {
    vi.useFakeTimers();
    mockTasklistOutput(
      '"acs.exe","1234","Console","1","123,456 K","Not Responding","USER","0:00:01","N/A"',
    );
    await monitor.isAcRunning();
    vi.advanceTimersByTime(5 * 60 * 1000 + 1000);
    await monitor.isAcRunning();

    const killCalls = vi.mocked(execFile).mock.calls.filter(([file]) => file === 'taskkill');
    expect(killCalls.length).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it('resets the not-responding streak once acs.exe responds again', async () => {
    mockTasklistOutput(
      '"acs.exe","1234","Console","1","123,456 K","Not Responding","USER","0:00:01","N/A"',
    );
    await monitor.isAcRunning();

    mockTasklistOutput(
      '"acs.exe","1234","Console","1","123,456 K","Running","USER","0:00:01","N/A"',
    );
    expect(await monitor.isAcRunning()).toBe(true);

    mockTasklistOutput(
      '"acs.exe","1234","Console","1","123,456 K","Not Responding","USER","0:00:01","N/A"',
    );
    await monitor.isAcRunning();
    const killCalls = vi.mocked(execFile).mock.calls.filter(([file]) => file === 'taskkill');
    expect(killCalls).toHaveLength(0);
  });
});
