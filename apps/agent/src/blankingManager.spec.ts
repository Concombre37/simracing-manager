import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { BlankingManager } from './blankingManager';
import type { TelemetrySnapshot } from '@simracing/shared';

vi.mock('child_process', async (importOriginal) => {
  const mod = (await importOriginal()) as typeof import('child_process');
  return {
    ...mod,
    spawn: vi.fn(),
  };
});

function createFakeProcess() {
  const proc = new EventEmitter() as ReturnType<typeof spawn>;
  proc.pid = 12345;
  proc.killed = false;
  proc.kill = vi.fn((signal?: string) => {
    proc.killed = true;
    proc.emit('exit', 0, signal);
    return true;
  });
  proc.stdin = null as unknown as typeof proc.stdin;
  proc.stdout = null as unknown as typeof proc.stdout;
  proc.stderr = null as unknown as typeof proc.stderr;
  proc.stdio = [] as unknown as typeof proc.stdio;
  return proc;
}

function makeSnapshot(overrides: Partial<TelemetrySnapshot> = {}): TelemetrySnapshot {
  return {
    stationId: 'pod-01',
    timestamp: Date.now(),
    speedKmh: 0,
    rpm: 0,
    gear: 0,
    throttle: 0,
    brake: 0,
    steering: 0,
    isInMainMenu: false,
    isSessionStarted: true,
    ...overrides,
  };
}

function lastSpawnArgs(): { file: string; playlistJson?: string; slideIntervalMs?: string } {
  const calls = vi.mocked(spawn).mock.calls;
  const lastCall = calls[calls.length - 1];
  const args = lastCall[1] as string[];
  const fileIndex = args.indexOf('-File');
  const file = fileIndex >= 0 ? args[fileIndex + 1] : '';
  const playlistIndex = args.indexOf('-PlaylistJson');
  const playlistJson = playlistIndex >= 0 ? args[playlistIndex + 1] : undefined;
  const intervalIndex = args.indexOf('-SlideIntervalMs');
  const slideIntervalMs = intervalIndex >= 0 ? args[intervalIndex + 1] : undefined;
  return { file, playlistJson, slideIntervalMs };
}

describe('BlankingManager', () => {
  let manager: BlankingManager;
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => mockLogger),
  } as unknown as import('pino').Logger;

  beforeEach(() => {
    vi.mocked(spawn).mockReturnValue(createFakeProcess() as never);
    manager = new BlankingManager(mockLogger);
    (manager as unknown as { scriptPath: string }).scriptPath = 'C:\\temp\\blanking.ps1';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows blanking in auto mode when AC is not loaded and not running', () => {
    manager.setAuto();
    manager.setAcRunning(false);
    manager.setAcLoaded(false);
    expect(manager.isBlankingActive()).toBe(true);
  });

  it('hides blanking when AC shared memory is loaded', () => {
    manager.setAuto();
    manager.setAcLoaded(true);
    expect(manager.isBlankingActive()).toBe(false);
  });

  it('hides blanking when driving telemetry arrives and AC is running (legacy fallback)', () => {
    manager.setAuto();
    manager.setAcRunning(true);
    manager.onTelemetry(makeSnapshot({ speedKmh: 120, rpm: 6000, gear: 4 }));
    expect(manager.isBlankingActive()).toBe(false);
  });

  it('keeps blanking when in main menu even if car data exists', () => {
    manager.setAuto();
    manager.setAcRunning(true);
    manager.onTelemetry(makeSnapshot({ isInMainMenu: true, speedKmh: 0, rpm: 900 }));
    expect(manager.isBlankingActive()).toBe(true);
  });

  it('keeps blanking when session not started', () => {
    manager.setAuto();
    manager.setAcRunning(true);
    manager.onTelemetry(makeSnapshot({ isSessionStarted: false, speedKmh: 0, rpm: 0 }));
    expect(manager.isBlankingActive()).toBe(true);
  });

  it('shows blanking when AC is not running even with driving telemetry', () => {
    manager.setAuto();
    manager.setAcRunning(false);
    manager.onTelemetry(makeSnapshot({ speedKmh: 120 }));
    expect(manager.isBlankingActive()).toBe(true);
  });

  it('manual hide overrides auto and keeps screen off', () => {
    manager.hide();
    expect(manager.isBlankingActive()).toBe(false);
    manager.setAcRunning(true);
    manager.setAcLoaded(true);
    manager.onTelemetry(makeSnapshot({ speedKmh: 120 }));
    expect(manager.isBlankingActive()).toBe(false);
  });

  it('manual show overrides auto and keeps screen on', () => {
    manager.show();
    expect(manager.isBlankingActive()).toBe(true);
    manager.setAcLoaded(true);
    manager.onTelemetry(makeSnapshot({ speedKmh: 120 }));
    expect(manager.isBlankingActive()).toBe(true);
  });

  it('passes an empty playlist when no media is configured', () => {
    manager.setAuto();
    manager.setAcRunning(false);
    expect(manager.isBlankingActive()).toBe(true);
    const { playlistJson } = lastSpawnArgs();
    expect(playlistJson).toBeDefined();
    const parsed = JSON.parse(playlistJson!);
    expect(parsed).toEqual([]);
  });

  it('restarts blanking with updated playlist when media paths change', () => {
    manager.setAuto();
    manager.setAcRunning(false);
    expect(manager.isBlankingActive()).toBe(true);
    const initialSpawnCount = vi.mocked(spawn).mock.calls.length;

    manager.setMediaPaths(['C:\\media\\slide1.jpg', 'C:\\media\\intro.mp4']);

    // The manager should have spawned a new PowerShell process with the updated playlist.
    const { playlistJson } = lastSpawnArgs();
    const parsed = JSON.parse(playlistJson!);
    expect(parsed).toEqual([
      { path: 'C:\\media\\slide1.jpg', type: 'image' },
      { path: 'C:\\media\\intro.mp4', type: 'video' },
    ]);
    expect(vi.mocked(spawn).mock.calls.length).toBeGreaterThan(initialSpawnCount);
  });
});
