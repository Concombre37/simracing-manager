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

  it('does NOT start the hide-delay countdown from acRunning alone (process detected, AC still loading)', () => {
    // acRunning fires the instant acs.exe appears in the process list, well
    // before the driver is actually in Drive — must not by itself start the
    // countdown that removes blanking (found in production, v2.2.104: the
    // launching screen was disappearing while AC was still loading the
    // track/menu underneath). Only acLoaded (shared memory mapped AND
    // fresh) reflects a genuinely live, spawned session.
    vi.useFakeTimers();
    manager.setAuto();
    manager.setAcRunning(true);
    expect(manager.isBlankingActive()).toBe(true);
    vi.advanceTimersByTime(30000);
    expect(manager.isBlankingActive()).toBe(true);
    vi.useRealTimers();
  });

  it('cancels the pending hide if AC shared memory unloads before the delay elapses', () => {
    vi.useFakeTimers();
    manager.setAuto();
    manager.setAcLoaded(true);
    vi.advanceTimersByTime(5000);
    manager.setAcLoaded(false);
    vi.advanceTimersByTime(10000);
    expect(manager.isBlankingActive()).toBe(true);
    vi.useRealTimers();
  });

  it('uses a configurable delay set via setHideDelaySeconds()', () => {
    vi.useFakeTimers();
    manager.setHideDelaySeconds(3);
    manager.setAuto();
    manager.setAcLoaded(true);
    vi.advanceTimersByTime(2999);
    expect(manager.isBlankingActive()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(manager.isBlankingActive()).toBe(false);
    vi.useRealTimers();
  });

  it('falls back to hiding once acRunning has been true for AC_LOADED_SAFETY_FALLBACK_MS without acLoaded ever confirming', () => {
    // Safety net only — protects against blanking getting stuck forever if
    // shared memory genuinely never comes up (crash, unexpected AC version).
    vi.useFakeTimers();
    manager.setAuto();
    manager.setAcRunning(true);
    expect(manager.isBlankingActive()).toBe(true);
    vi.advanceTimersByTime(91000);
    // Safety fallback triggers evaluate() to schedule the hide-delay
    // countdown once the 90s ceiling is crossed; the default 10s delay
    // then still applies on top of it. evaluate() only re-runs reactively,
    // so re-poke setAcRunning(true) here the same way the real ~2s
    // heartbeat loop does every tick regardless of whether the value changed.
    manager.setAcRunning(true);
    vi.advanceTimersByTime(10000);
    expect(manager.isBlankingActive()).toBe(false);
    vi.useRealTimers();
  });

  it('shows blanking again once AC shared memory unmaps', () => {
    vi.useFakeTimers();
    manager.setAuto();
    manager.setAcLoaded(true);
    vi.advanceTimersByTime(10000);
    expect(manager.isBlankingActive()).toBe(false);
    manager.setAcLoaded(false);
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

  it('switches to hide override when blanking process is closed manually after running a while', () => {
    // The window has no title bar, so Escape is the only way to close it —
    // realistically that can't happen within the "just crashed" window
    // (EARLY_EXIT_THRESHOLD_MS), which is why the timer is advanced first.
    vi.useFakeTimers();
    manager.setAuto();
    manager.setAcRunning(false);
    expect(manager.isBlankingActive()).toBe(true);
    vi.advanceTimersByTime(5000);
    const calls = vi.mocked(spawn).mock.calls;
    const proc = vi.mocked(spawn).mock.results[calls.length - 1].value as ReturnType<
      typeof createFakeProcess
    >;
    proc.emit('exit', 0);
    expect((manager as unknown as { override: string }).override).toBe('hide');
    expect(manager.isBlankingActive()).toBe(false);
    vi.useRealTimers();
  });

  it('restarts blanking instead of revealing the game when it exits unexpectedly right after starting', () => {
    // A single WPF/PowerShell hiccup right after spawn must not permanently
    // defeat the configured grace period for the rest of the session.
    manager.setAuto();
    manager.setAcRunning(false);
    expect(manager.isBlankingActive()).toBe(true);
    const spawnCountBefore = vi.mocked(spawn).mock.calls.length;

    const proc = vi.mocked(spawn).mock.results[spawnCountBefore - 1].value as ReturnType<
      typeof createFakeProcess
    >;
    proc.emit('exit', 1);

    expect((manager as unknown as { override: string }).override).toBe('auto');
    expect(manager.isBlankingActive()).toBe(true);
    expect(vi.mocked(spawn).mock.calls.length).toBeGreaterThan(spawnCountBefore);
  });

  it('ignores a stale exit event from a process already superseded by a restart', () => {
    // restartIfActive() (called by showResults()/setAuto() when dropping a
    // results screen) kills the old window and spawns a replacement in the
    // same synchronous pass, but in production the OS only delivers the old
    // process' 'exit' event later, asynchronously — after the new one is
    // already tracked and showing. Simulate that ordering by making the old
    // process' kill() NOT auto-emit 'exit' (unlike the default fake
    // process), so we can fire it manually once the replacement is already
    // in place.
    manager.setAuto();
    manager.setAcRunning(false);
    manager.showResults({ clientName: 'Alice', carAcId: 'ks_porsche_911', bestLapMs: 95123 });
    expect(manager.isBlankingActive()).toBe(true);

    const oldProc = vi.mocked(spawn).mock.results[vi.mocked(spawn).mock.results.length - 1]
      .value as ReturnType<typeof createFakeProcess>;
    oldProc.kill = vi.fn(() => {
      oldProc.killed = true;
      return true; // no synchronous 'exit' — simulates the OS not having delivered it yet
    });

    manager.setAuto(); // dropping the results screen triggers restartIfActive(): kills oldProc, spawns a new one

    const newProc = vi.mocked(spawn).mock.results[vi.mocked(spawn).mock.results.length - 1]
      .value as ReturnType<typeof createFakeProcess>;
    expect(newProc).not.toBe(oldProc);

    // The old process' exit notification finally arrives, after the fact.
    oldProc.emit('exit', 0);

    // The current (new) window must still be considered active and stoppable
    // — a stale exit must not null out the reference to it.
    expect(manager.isBlankingActive()).toBe(true);
    manager.hide();
    expect(newProc.kill).toHaveBeenCalled();
  });

  it('gives up and switches to hide override after too many consecutive early crashes', () => {
    manager.setAuto();
    manager.setAcRunning(false);
    expect(manager.isBlankingActive()).toBe(true);

    for (let i = 0; i < 4; i++) {
      const calls = vi.mocked(spawn).mock.calls;
      const proc = vi.mocked(spawn).mock.results[calls.length - 1].value as ReturnType<
        typeof createFakeProcess
      >;
      proc.emit('exit', 1);
    }

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
    manager.setAcLoaded(false);
    expect(manager.isBlankingActive()).toBe(true);
    manager.setAcLoaded(true);
    vi.advanceTimersByTime(10000);
    expect(manager.isBlankingActive()).toBe(false);
    vi.useRealTimers();
  });

  it('does not restart the window on session launch when already showing the plain waiting screen', () => {
    // setPodInGame(true) fires right as a session launches, while blanking
    // has typically been up (plain waiting screen) since the agent started.
    // Killing and respawning the window here — as used to happen
    // unconditionally — produced a brief but visible flicker at exactly
    // that moment, with no actual content change to justify it.
    manager.setAuto();
    manager.setAcRunning(false);
    expect(manager.isBlankingActive()).toBe(true);
    const spawnCountBefore = vi.mocked(spawn).mock.calls.length;

    manager.setPodInGame(true);

    expect(vi.mocked(spawn).mock.calls.length).toBe(spawnCountBefore);
    expect(manager.isBlankingActive()).toBe(true);
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

  it('shows the launching screen even when the plain blanking window is already up', () => {
    // Called right as a session launch command comes in, before the game
    // process is even spawned — the plain waiting screen may already be up
    // since the agent started.
    manager.setAuto();
    manager.setAcRunning(false);
    expect(manager.isBlankingActive()).toBe(true);
    const initialSpawnCount = vi.mocked(spawn).mock.calls.length;

    manager.showLaunching({ clientName: 'Alice', carAcId: 'ks_porsche_911', track: 'ks_monza' });

    expect(vi.mocked(spawn).mock.calls.length).toBeGreaterThan(initialSpawnCount);
    const { resultsHtmlPath } = lastSpawnArgs();
    expect(resultsHtmlPath).toBeDefined();
    const html = readFileSync(resultsHtmlPath!, 'utf-8');
    expect(html).toContain('Alice');
    expect(html).toContain('ks_monza');
  });

  it('crossfades between multiple launching background images with a pure-CSS keyframe loop', () => {
    manager.setAuto();
    manager.setAcRunning(false);
    manager.setLaunchingMediaPaths([
      'C:\\media\\launch1.jpg',
      'C:\\media\\launch2.jpg',
      'C:\\media\\launch3.jpg',
    ]);

    manager.showLaunching({ clientName: 'Alice', carAcId: 'ks_porsche_911', track: 'ks_monza' });

    const { resultsHtmlPath } = lastSpawnArgs();
    const html = readFileSync(resultsHtmlPath!, 'utf-8');
    expect(html.match(/scene-bg-layer/g)?.length).toBeGreaterThanOrEqual(3);
    expect(html).toContain('scene-bg-layer slideshow');
    expect(html).toContain('@keyframes scene-bg-slideshow');
    expect(html).not.toContain('<script>');
    expect(html).toContain('animation-delay:0ms');
    expect(html).toContain('animation-delay:4000ms');
    expect(html).toContain('animation-delay:8000ms');
    expect(html).toContain('launch1.jpg');
    expect(html).toContain('launch2.jpg');
    expect(html).toContain('launch3.jpg');
    // The keyframe loop must fade back IN at 100% (opacity: 1), not just
    // fade out to opacity: 0 — otherwise the outgoing photo dissolves to
    // black and the next one pops in with no overlap (a hard cut, not a
    // crossfade). See renderSlideshowStyles()'s doc comment.
    expect(html).toContain('100% { opacity: 1; }');
    expect(html).not.toContain('100% { opacity: 0; }');
    // No 3D-transform GPU-promotion hack — tried and reverted, see
    // renderSlideshowStyles()'s doc comment (no track record in this exact
    // WPF WebBrowser/IE11 combination, and old Trident builds are known to
    // sometimes stop animating other properties entirely on 3D-transformed
    // elements instead of just being faster).
    expect(html).not.toContain('translateZ');
    // The animation must fully own opacity on rotating layers — a leftover
    // `transition: opacity` from the single-image (.active) rule fights the
    // keyframe animation for the same property in IE11.
    expect(html).toMatch(/\.scene-bg-layer\.slideshow\s*\{[^}]*transition:\s*none;/);
  });

  it('does not emit a rotation keyframe for a single launching background image', () => {
    manager.setAuto();
    manager.setAcRunning(false);
    manager.setLaunchingMediaPaths(['C:\\media\\launch1.jpg']);

    manager.showLaunching({ clientName: 'Alice', carAcId: 'ks_porsche_911', track: 'ks_monza' });

    const { resultsHtmlPath } = lastSpawnArgs();
    const html = readFileSync(resultsHtmlPath!, 'utf-8');
    expect(html).toContain('scene-bg-layer active');
    expect(html).not.toContain('scene-bg-layer slideshow');
    expect(html).not.toContain('@keyframes scene-bg-slideshow');
    expect(html).not.toContain('<script>');
  });

  it('updates the launching screen in place without restarting when already showing it', () => {
    manager.setAuto();
    manager.setAcRunning(false);
    manager.showLaunching({ clientName: 'Alice', carAcId: 'ks_porsche_911', track: 'ks_monza' });
    const spawnCountAfterFirstShow = vi.mocked(spawn).mock.calls.length;

    manager.showLaunching({ clientName: 'Bob', carAcId: 'ks_ferrari_488', track: 'ks_spa' });

    expect(vi.mocked(spawn).mock.calls.length).toBe(spawnCountAfterFirstShow);
  });

  it('gives each new launching screen a fresh, never-before-seen file path', () => {
    // The WebBrowser control's IE11 engine keeps a persistent disk cache
    // keyed by URL that survives across the process restarts this window
    // goes through between sessions — Navigate()-ing to a filename it has
    // already visited before could silently serve the old cached document
    // instead of the freshly written one, making any HTML/CSS change here
    // invisible in practice regardless of how correct it is. Two separate
    // launches (a real restart in between, not the in-place update covered
    // by the previous test) must never reuse the same path.
    manager.setAuto();
    manager.setAcRunning(false);
    manager.showLaunching({ clientName: 'Alice', carAcId: 'ks_porsche_911', track: 'ks_monza' });
    const firstPath = lastSpawnArgs().resultsHtmlPath;
    expect(firstPath).toBeDefined();

    manager.hide();
    manager.setAuto();
    manager.showLaunching({ clientName: 'Bob', carAcId: 'ks_ferrari_488', track: 'ks_spa' });
    const secondPath = lastSpawnArgs().resultsHtmlPath;

    expect(secondPath).toBeDefined();
    expect(secondPath).not.toBe(firstPath);
  });

  it('does not tear down the launching screen when setPodInGame(true) fires once launch succeeds', () => {
    // This is the exact transition that used to cause a visible flicker:
    // setPodInGame(true) fires right after the game process is spawned,
    // while the launching screen shown just before must stay up untouched
    // until the grace-period reveal.
    manager.setAuto();
    manager.setAcRunning(false);
    manager.showLaunching({ clientName: 'Alice', carAcId: 'ks_porsche_911', track: 'ks_monza' });
    const spawnCountAfterLaunching = vi.mocked(spawn).mock.calls.length;

    manager.setPodInGame(true);

    expect(vi.mocked(spawn).mock.calls.length).toBe(spawnCountAfterLaunching);
    const { resultsHtmlPath } = lastSpawnArgs();
    expect(resultsHtmlPath).toBeDefined();
    expect(readFileSync(resultsHtmlPath!, 'utf-8')).toContain('Alice');
  });

  it('drops the launching screen and returns to the plain waiting screen via setAuto() (e.g. a failed launch)', () => {
    manager.setAuto();
    manager.setAcRunning(false);
    manager.showLaunching({ clientName: 'Alice', carAcId: 'ks_porsche_911', track: 'ks_monza' });
    expect(manager.isBlankingActive()).toBe(true);

    manager.setAuto();

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
    expect(html).toContain('Meilleur tour');
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
    m.setAcLoaded(true);
    expect(onGameRevealed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(9999);
    expect(onGameRevealed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onGameRevealed).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('reveals the game immediately on a manual hide override during a session', () => {
    const onGameRevealed = vi.fn();
    const m = new BlankingManager(mockLogger, onGameRevealed);
    (m as unknown as { scriptPath: string }).scriptPath = path.join(os.tmpdir(), 'blanking.ps1');
    (m as unknown as { playlistPath: string }).playlistPath = path.join(
      os.tmpdir(),
      'blanking-playlist.json',
    );
    m.setAcRunning(true);
    m.hide();
    expect(onGameRevealed).toHaveBeenCalledTimes(1);
  });

  it('fires onSessionRevealed exactly once per session, not on every reveal', () => {
    const onSessionRevealed = vi.fn();
    const m = new BlankingManager(mockLogger, vi.fn(), onSessionRevealed);
    (m as unknown as { scriptPath: string }).scriptPath = path.join(os.tmpdir(), 'blanking.ps1');
    (m as unknown as { playlistPath: string }).playlistPath = path.join(
      os.tmpdir(),
      'blanking-playlist.json',
    );

    // A new session starts, game reveals — fires once.
    m.setPodInGame(true);
    m.setAcRunning(true);
    m.hide();
    expect(onSessionRevealed).toHaveBeenCalledTimes(1);

    // Same session, another manual hide/reveal cycle — must not fire again.
    m.setAuto();
    m.hide();
    expect(onSessionRevealed).toHaveBeenCalledTimes(1);

    // A brand new session starts and reveals — fires again.
    m.setPodInGame(false);
    m.setPodInGame(true);
    m.hide();
    expect(onSessionRevealed).toHaveBeenCalledTimes(2);
  });

  it('does not reveal/sweep on a manual hide override while idle (no session running or loading)', () => {
    // A manual "hide" override is also used for maintenance when nothing is
    // running at all — minimizing whatever the operator has open in that
    // case would be pure disruption with no game to actually reveal.
    const onGameRevealed = vi.fn();
    const m = new BlankingManager(mockLogger, onGameRevealed);
    (m as unknown as { scriptPath: string }).scriptPath = path.join(os.tmpdir(), 'blanking.ps1');
    (m as unknown as { playlistPath: string }).playlistPath = path.join(
      os.tmpdir(),
      'blanking-playlist.json',
    );
    m.hide();
    expect(onGameRevealed).not.toHaveBeenCalled();
    expect(m.isBlankingActive()).toBe(false);
  });

  it('never reveals/sweeps on an admin (hosting-only) station', () => {
    // Admin stations never run the AC client themselves (acRunning/acLoaded
    // should never go true there), but this is enforced explicitly rather
    // than relying on that indirectly.
    const onGameRevealed = vi.fn();
    const m = new BlankingManager(mockLogger, onGameRevealed);
    (m as unknown as { scriptPath: string }).scriptPath = path.join(os.tmpdir(), 'blanking.ps1');
    (m as unknown as { playlistPath: string }).playlistPath = path.join(
      os.tmpdir(),
      'blanking-playlist.json',
    );
    m.setEnabled(false);
    m.hide();
    expect(onGameRevealed).not.toHaveBeenCalled();
  });

  it('does not re-show blanking over a live session on a single transient acRunning/acLoaded glitch', () => {
    // Reported live: blanking popped back up mid-race even though the game
    // was genuinely still running — acRunning/acLoaded are re-polled from
    // scratch every ~2s (tasklist.exe / shared memory) and can misreport a
    // single tick with no real change in the game. Once the game has
    // actually been confirmed on screen this session, a lone "not
    // detected" poll must not slam blanking back up over the live race.
    vi.useFakeTimers();
    const onGameRevealed = vi.fn();
    const m = new BlankingManager(mockLogger, onGameRevealed);
    (m as unknown as { scriptPath: string }).scriptPath = path.join(os.tmpdir(), 'blanking.ps1');
    (m as unknown as { playlistPath: string }).playlistPath = path.join(
      os.tmpdir(),
      'blanking-playlist.json',
    );
    m.setAuto();
    m.setPodInGame(true);
    m.setAcLoaded(true);
    vi.advanceTimersByTime(10000);
    expect(m.isBlankingActive()).toBe(false);
    expect(onGameRevealed).toHaveBeenCalledTimes(1);

    // A single glitchy poll (both sources say "not there" for one tick).
    m.setAcLoaded(false);
    m.setAcRunning(false);
    expect(m.isBlankingActive()).toBe(false);

    // The game is detected again on the very next poll — never actually gone.
    m.setAcLoaded(true);
    expect(m.isBlankingActive()).toBe(false);
    expect(onGameRevealed).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('does re-show blanking mid-session once AC is missing for several consecutive polls in a row', () => {
    // The debounce above must not turn into "blanking can never come back
    // during a session" — a genuine crash/close still needs to be covered,
    // just not on the very first noisy reading.
    vi.useFakeTimers();
    const onGameRevealed = vi.fn();
    const m = new BlankingManager(mockLogger, onGameRevealed);
    (m as unknown as { scriptPath: string }).scriptPath = path.join(os.tmpdir(), 'blanking.ps1');
    (m as unknown as { playlistPath: string }).playlistPath = path.join(
      os.tmpdir(),
      'blanking-playlist.json',
    );
    m.setAuto();
    m.setPodInGame(true);
    m.setAcLoaded(true);
    vi.advanceTimersByTime(10000);
    expect(m.isBlankingActive()).toBe(false);

    m.setAcLoaded(false);
    expect(m.isBlankingActive()).toBe(false);
    m.setAcRunning(false);
    expect(m.isBlankingActive()).toBe(false);
    m.setAcRunning(false);
    expect(m.isBlankingActive()).toBe(true);
    vi.useRealTimers();
  });

  it('shows blanking on the very first poll at session start, before the game has ever been revealed', () => {
    // The debounce must only kick in once the game has actually been shown
    // this session — nothing to protect before that, and blanking is
    // exactly what's supposed to cover the "still loading" gap.
    manager.setAuto();
    manager.setPodInGame(true);
    expect(manager.isBlankingActive()).toBe(true);
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
