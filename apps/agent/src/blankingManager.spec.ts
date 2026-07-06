import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { readFileSync, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';
import { BlankingManager } from './blankingManager';

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

  it('hides blanking after the grace period when AC shared memory is loaded', () => {
    vi.useFakeTimers();
    manager.setAuto();
    manager.setAcLoaded(true);
    expect(manager.isBlankingActive()).toBe(true);
    vi.advanceTimersByTime(10000);
    expect(manager.isBlankingActive()).toBe(false);
    vi.useRealTimers();
  });

  it('hides blanking after the default 10s grace period once AC is running', () => {
    // Matches the proven approach from the previous production launcher
    // (plain process presence, no telemetry-based "car ready" confirmation)
    // plus a configurable grace period so it doesn't vanish the instant
    // acs.exe appears while AC is still loading.
    vi.useFakeTimers();
    manager.setAuto();
    manager.setAcRunning(true);
    expect(manager.isBlankingActive()).toBe(true);
    vi.advanceTimersByTime(10000);
    expect(manager.isBlankingActive()).toBe(false);
    vi.useRealTimers();
  });

  it('cancels the pending hide if AC stops running before the delay elapses', () => {
    vi.useFakeTimers();
    manager.setAuto();
    manager.setAcRunning(true);
    vi.advanceTimersByTime(5000);
    manager.setAcRunning(false);
    vi.advanceTimersByTime(10000);
    expect(manager.isBlankingActive()).toBe(true);
    vi.useRealTimers();
  });

  it('uses a configurable delay set via setHideDelaySeconds()', () => {
    vi.useFakeTimers();
    manager.setHideDelaySeconds(3);
    manager.setAuto();
    manager.setAcRunning(true);
    vi.advanceTimersByTime(2999);
    expect(manager.isBlankingActive()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(manager.isBlankingActive()).toBe(false);
    vi.useRealTimers();
  });

  it('shows blanking again once AC stops running and shared memory unmaps', () => {
    vi.useFakeTimers();
    manager.setAuto();
    manager.setAcRunning(true);
    vi.advanceTimersByTime(10000);
    expect(manager.isBlankingActive()).toBe(false);
    manager.setAcRunning(false);
    expect(manager.isBlankingActive()).toBe(true);
    vi.useRealTimers();
  });

  it('manual hide overrides auto and keeps screen off', () => {
    manager.hide();
    expect(manager.isBlankingActive()).toBe(false);
    manager.setAcRunning(true);
    manager.setAcLoaded(true);
    expect(manager.isBlankingActive()).toBe(false);
  });

  it('manual show overrides auto and keeps screen on', () => {
    manager.show();
    expect(manager.isBlankingActive()).toBe(true);
    manager.setAcLoaded(true);
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

  it('podInGame no longer changes the hide decision, only resets a stale override', () => {
    // Auto blanking behaves identically whether or not a session is
    // "in game" — the only thing setPodInGame(true) still does is clear a
    // stale manual override so a new session always starts from auto.
    vi.useFakeTimers();
    manager.setAuto();
    manager.setPodInGame(true);
    manager.setAcRunning(false);
    expect(manager.isBlankingActive()).toBe(true);
    manager.setAcRunning(true);
    vi.advanceTimersByTime(10000);
    expect(manager.isBlankingActive()).toBe(false);
    vi.useRealTimers();
  });

  it('setPodInGame(true) alone clears a stale manual override', () => {
    // A manual override left over from maintenance (Escape, "Masquer
    // écran") must not require a separate setAuto() call from the caller.
    manager.hide();
    expect(manager.isBlankingActive()).toBe(false);

    manager.setPodInGame(true);

    expect(manager.isBlankingActive()).toBe(true);
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

  it('updates results in place without restarting when already showing results', () => {
    // The immediate "pending" display and the final one a few seconds later
    // must not restart the window in between — that's a visible flicker.
    // blanking.ps1 reloads the rewritten HTML file on its own poll timer.
    manager.setAuto();
    manager.setAcRunning(false);
    manager.showResults({ clientName: 'Alice', carAcId: 'ks_porsche_911', pending: true });
    expect(manager.isBlankingActive()).toBe(true);
    const spawnCountAfterFirstShow = vi.mocked(spawn).mock.calls.length;

    manager.showResults({ clientName: 'Alice', carAcId: 'ks_porsche_911', bestLapMs: 95123 });

    expect(vi.mocked(spawn).mock.calls.length).toBe(spawnCountAfterFirstShow);
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

  it('renders a second tile for the best invalid (cut) lap when present', () => {
    manager.setAuto();
    manager.setAcRunning(false);
    manager.showResults({
      clientName: 'Alice',
      carAcId: 'ks_porsche_911',
      bestLapMs: 95123,
      bestInvalidLapMs: 92456,
    });
    const { resultsHtmlPath } = lastSpawnArgs();
    const html = readFileSync(resultsHtmlPath!, 'utf-8');
    expect(html).toContain('Meilleur tour vérifié');
    expect(html).toContain('non valide (cut)');
  });

  it('omits the invalid-lap tile when there is no invalid lap to report', () => {
    manager.setAuto();
    manager.setAcRunning(false);
    manager.showResults({
      clientName: 'Alice',
      carAcId: 'ks_porsche_911',
      bestLapMs: 95123,
    });
    const { resultsHtmlPath } = lastSpawnArgs();
    const html = readFileSync(resultsHtmlPath!, 'utf-8');
    expect(html).not.toContain('non valide (cut)');
  });

  it('reveals the game only once the grace period elapses, not when AC is first detected', () => {
    // The kiosk manager brings the game window to the foreground on this
    // callback. Firing it early would visually cover blanking well before
    // its own configurable delay elapses.
    vi.useFakeTimers();
    const onGameRevealed = vi.fn();
    const m = new BlankingManager(mockLogger, onGameRevealed);
    (m as unknown as { scriptPath: string }).scriptPath = path.join(os.tmpdir(), 'blanking.ps1');
    (m as unknown as { playlistPath: string }).playlistPath = path.join(
      os.tmpdir(),
      'blanking-playlist.json',
    );
    m.setAuto();
    m.setAcRunning(true);
    expect(onGameRevealed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(9999);
    expect(onGameRevealed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onGameRevealed).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('reveals the game immediately on a manual hide override', () => {
    const onGameRevealed = vi.fn();
    const m = new BlankingManager(mockLogger, onGameRevealed);
    (m as unknown as { scriptPath: string }).scriptPath = path.join(os.tmpdir(), 'blanking.ps1');
    (m as unknown as { playlistPath: string }).playlistPath = path.join(
      os.tmpdir(),
      'blanking-playlist.json',
    );
    m.hide();
    expect(onGameRevealed).toHaveBeenCalledTimes(1);
  });

  it('shutdown() force-kills an active blanking process', () => {
    // Guards against orphaned windows piling up across agent restarts
    // (self-update, crash): shutdown() must actually tear the process down
    // rather than just flip internal state.
    manager.setAuto();
    manager.setAcRunning(false);
    expect(manager.isBlankingActive()).toBe(true);

    manager.shutdown();

    expect(manager.isBlankingActive()).toBe(false);
  });
});
