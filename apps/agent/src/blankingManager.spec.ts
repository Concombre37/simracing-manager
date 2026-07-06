import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { readFileSync, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';
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

function lastSpawnArgs(): {
  file: string;
  playlistPath?: string;
  slideIntervalMs?: string;
  resultsHtmlPath?: string;
} {
  const calls = vi.mocked(spawn).mock.calls;
  const lastCall = calls[calls.length - 1];
  const args = lastCall[1] as string[];
  const fileIndex = args.indexOf('-File');
  const file = fileIndex >= 0 ? args[fileIndex + 1] : '';
  const playlistIndex = args.indexOf('-PlaylistPath');
  const playlistPath = playlistIndex >= 0 ? args[playlistIndex + 1] : undefined;
  const intervalIndex = args.indexOf('-SlideIntervalMs');
  const slideIntervalMs = intervalIndex >= 0 ? args[intervalIndex + 1] : undefined;
  const resultsIndex = args.indexOf('-ResultsHtmlPath');
  const resultsHtmlPath = resultsIndex >= 0 ? args[resultsIndex + 1] : undefined;
  return { file, playlistPath, slideIntervalMs, resultsHtmlPath };
}

function readPlaylistFile(playlistPath?: string): unknown {
  if (!playlistPath) return undefined;
  try {
    return JSON.parse(readFileSync(playlistPath, 'utf-8'));
  } catch {
    return undefined;
  }
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
    vi.mocked(spawn).mockImplementation(() => createFakeProcess() as never);
    manager = new BlankingManager(mockLogger);
    const tmpDir = os.tmpdir();
    // Matches the tmp dir generateResultsHtml() computes internally
    // (process.env.TEMP || '/tmp', joined with 'simracing-manager'), which
    // init() would normally create — skipped here since tests set
    // scriptPath/playlistPath directly instead of calling init().
    mkdirSync(path.join(process.env.TEMP || '/tmp', 'simracing-manager'), { recursive: true });
    (manager as unknown as { scriptPath: string }).scriptPath = path.join(tmpDir, 'blanking.ps1');
    (manager as unknown as { playlistPath: string }).playlistPath = path.join(
      tmpDir,
      'blanking-playlist.json',
    );
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

  it('hides blanking 5s after car ready telemetry arrives and AC is running', () => {
    vi.useFakeTimers();
    manager.setAuto();
    manager.setAcRunning(true);
    manager.onTelemetry(makeSnapshot({ speedKmh: 120, rpm: 6000, gear: 4 }));
    expect(manager.isBlankingActive()).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(manager.isBlankingActive()).toBe(false);
    vi.useRealTimers();
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

  it('keeps blanking active if car ready state is lost before 5s', () => {
    vi.useFakeTimers();
    manager.setAuto();
    manager.setAcRunning(true);
    manager.onTelemetry(makeSnapshot({ speedKmh: 120 }));
    expect(manager.isBlankingActive()).toBe(true);
    vi.advanceTimersByTime(3000);
    manager.onTelemetry(makeSnapshot({ isInMainMenu: true, speedKmh: 0 }));
    expect(manager.isBlankingActive()).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(manager.isBlankingActive()).toBe(true);
    vi.useRealTimers();
  });

  it('restores blanking when car ready state is lost after confirmation', () => {
    vi.useFakeTimers();
    manager.setAuto();
    manager.setAcRunning(true);
    manager.onTelemetry(makeSnapshot({ speedKmh: 120 }));
    vi.advanceTimersByTime(5000);
    expect(manager.isBlankingActive()).toBe(false);
    manager.onTelemetry(makeSnapshot({ isInMainMenu: true, speedKmh: 0 }));
    expect(manager.isBlankingActive()).toBe(true);
    vi.useRealTimers();
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

  it('switches to hide override when blanking process is closed manually', () => {
    manager.setAuto();
    manager.setAcRunning(false);
    expect(manager.isBlankingActive()).toBe(true);
    const calls = vi.mocked(spawn).mock.calls;
    const proc = vi.mocked(spawn).mock.results[calls.length - 1].value as ReturnType<
      typeof createFakeProcess
    >;
    proc.emit('exit', 0);
    expect((manager as unknown as { override: string }).override).toBe('hide');
    expect(manager.isBlankingActive()).toBe(false);
  });

  it('keeps blanking during a session even when AC shared memory is loaded', () => {
    manager.setAuto();
    manager.setPodInGame(true);
    manager.setAcRunning(true);
    manager.setAcLoaded(true);
    expect(manager.isBlankingActive()).toBe(true);
  });

  it('hides blanking during a session only after ready is confirmed for 5s', () => {
    vi.useFakeTimers();
    manager.setAuto();
    manager.setPodInGame(true);
    manager.setAcRunning(true);
    manager.setAcLoaded(true);
    manager.onTelemetry(makeSnapshot({ speedKmh: 80, rpm: 4000, gear: 3 }));
    expect(manager.isBlankingActive()).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(manager.isBlankingActive()).toBe(false);
    vi.useRealTimers();
  });

  it('requires a fresh ready confirmation when a new session starts', () => {
    vi.useFakeTimers();
    manager.setAuto();
    manager.setAcRunning(true);
    manager.onTelemetry(makeSnapshot({ speedKmh: 120 }));
    vi.advanceTimersByTime(5000);
    expect(manager.isBlankingActive()).toBe(false);

    // A new session launches: blanking must come back until the game is
    // confirmed again, even though the previous ready state was confirmed.
    manager.setPodInGame(true);
    expect(manager.isBlankingActive()).toBe(true);

    manager.onTelemetry(makeSnapshot({ speedKmh: 50 }));
    vi.advanceTimersByTime(5000);
    expect(manager.isBlankingActive()).toBe(false);
    vi.useRealTimers();
  });

  it('keeps blanking during a session when telemetry reports the main menu', () => {
    vi.useFakeTimers();
    manager.setAuto();
    manager.setPodInGame(true);
    manager.setAcRunning(true);
    manager.setAcLoaded(true);
    manager.onTelemetry(makeSnapshot({ isInMainMenu: true, speedKmh: 0 }));
    vi.advanceTimersByTime(10000);
    expect(manager.isBlankingActive()).toBe(true);
    vi.useRealTimers();
  });

  it('falls back to legacy behavior when the session ends', () => {
    manager.setAuto();
    manager.setPodInGame(true);
    manager.setAcLoaded(true);
    expect(manager.isBlankingActive()).toBe(true);
    manager.setPodInGame(false);
    expect(manager.isBlankingActive()).toBe(false);
  });

  it('passes an empty playlist when no media is configured', () => {
    manager.setAuto();
    manager.setAcRunning(false);
    expect(manager.isBlankingActive()).toBe(true);
    const { playlistPath } = lastSpawnArgs();
    expect(playlistPath).toBeDefined();
    const parsed = readPlaylistFile(playlistPath);
    expect(parsed).toEqual([]);
  });

  it('restarts blanking with updated playlist when media paths change', () => {
    manager.setAuto();
    manager.setAcRunning(false);
    expect(manager.isBlankingActive()).toBe(true);
    const initialSpawnCount = vi.mocked(spawn).mock.calls.length;

    manager.setMediaPaths(['C:\\media\\slide1.jpg', 'C:\\media\\intro.mp4']);

    // The manager should have spawned a new PowerShell process with the updated playlist.
    const { playlistPath } = lastSpawnArgs();
    const parsed = readPlaylistFile(playlistPath);
    expect(parsed).toEqual([
      { path: 'C:\\media\\slide1.jpg', type: 'image' },
      { path: 'C:\\media\\intro.mp4', type: 'video' },
    ]);
    expect(vi.mocked(spawn).mock.calls.length).toBeGreaterThan(initialSpawnCount);
  });

  it('shows the results screen even when the plain blanking window is already up', () => {
    // Simulates the POD being back in the paddock (blanking auto-shown)
    // right before the agent has finished reading race_out.json.
    manager.setAuto();
    manager.setAcRunning(false);
    expect(manager.isBlankingActive()).toBe(true);
    const initialSpawnCount = vi.mocked(spawn).mock.calls.length;

    manager.showResults({ clientName: 'Alice', carAcId: 'ks_porsche_911', bestLapMs: 95123 });

    // Without a forced restart, startBlanking() no-ops because a process is
    // already running, and the results screen never actually appears.
    expect(vi.mocked(spawn).mock.calls.length).toBeGreaterThan(initialSpawnCount);
    const { resultsHtmlPath } = lastSpawnArgs();
    expect(resultsHtmlPath).toBeDefined();
  });

  it('returns to normal blanking after showing results even if the window was still up', () => {
    manager.setAuto();
    manager.setAcRunning(false);
    manager.showResults({ clientName: 'Alice', carAcId: 'ks_porsche_911', bestLapMs: 95123 });
    expect(manager.isBlankingActive()).toBe(true);
    const spawnCountWithResults = vi.mocked(spawn).mock.calls.length;

    manager.setAuto();

    expect(vi.mocked(spawn).mock.calls.length).toBeGreaterThan(spawnCountWithResults);
    const { resultsHtmlPath } = lastSpawnArgs();
    expect(resultsHtmlPath).toBeUndefined();
  });
});
