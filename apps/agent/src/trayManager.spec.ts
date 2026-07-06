import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { TrayManager, TrayCallbacks } from './trayManager';
import { agentLogRingBuffer } from './logRingBuffer';
import { config } from './config';

describe('TrayManager', () => {
  let originalPlatform: PropertyDescriptor;
  let originalTrayIcon: boolean;
  let tmpRoot: string;
  let flagDir: string;
  let manager: TrayManager;
  let callbacks: TrayCallbacks;

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    originalTrayIcon = config.TRAY_ICON;
    (config as unknown as { TRAY_ICON: boolean }).TRAY_ICON = true;

    tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'tray-manager-test-'));
    flagDir = path.join(tmpRoot, 'tray');
    mkdirSync(flagDir, { recursive: true });

    callbacks = {
      onToggleBlanking: vi.fn(),
      onSyncContent: vi.fn(),
      onCheckUpdate: vi.fn(),
      onRestartAgent: vi.fn(),
      onQuit: vi.fn(),
    };
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as import('pino').Logger;

    manager = new TrayManager(mockLogger, callbacks);
    (manager as unknown as { flagDir: string; tmpDir: string }).flagDir = flagDir;
    (manager as unknown as { flagDir: string; tmpDir: string }).tmpDir = tmpRoot;
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform);
    (config as unknown as { TRAY_ICON: boolean }).TRAY_ICON = originalTrayIcon;
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('dispatches the matching callback and removes the flag file for each known flag', async () => {
    const cases: [string, keyof TrayCallbacks][] = [
      ['quit.flag', 'onQuit'],
      ['toggle-blanking.flag', 'onToggleBlanking'],
      ['sync-content.flag', 'onSyncContent'],
      ['check-update.flag', 'onCheckUpdate'],
      ['restart-agent.flag', 'onRestartAgent'],
    ];

    for (const [fileName, callbackName] of cases) {
      const flagPath = path.join(flagDir, fileName);
      writeFileSync(flagPath, '', 'utf-8');

      await (manager as unknown as { checkFlags: () => Promise<void> }).checkFlags();

      expect(callbacks[callbackName]).toHaveBeenCalledTimes(1);
      expect(existsSync(flagPath)).toBe(false);
    }
  });

  it('does not call any callback when no flag files are present', async () => {
    await (manager as unknown as { checkFlags: () => Promise<void> }).checkFlags();
    for (const fn of Object.values(callbacks)) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it('updateStatus() writes station status plus recent log lines to console-status.json', () => {
    agentLogRingBuffer.push('[12:00:00] INFO marker-line-for-test');

    manager.updateStatus({
      stationId: 'poste-1',
      stationName: 'Poste 1',
      version: '9.9.9',
      connected: true,
      acRunning: false,
      blankingActive: true,
    });

    const written = JSON.parse(readFileSync(path.join(tmpRoot, 'console-status.json'), 'utf-8'));
    expect(written.stationId).toBe('poste-1');
    expect(written.connected).toBe(true);
    expect(written.blankingActive).toBe(true);
    expect(written.logs).toContain('[12:00:00] INFO marker-line-for-test');
    expect(typeof written.updatedAt).toBe('number');
  });

  it('updateStatus() is a no-op when TRAY_ICON is disabled', () => {
    (config as unknown as { TRAY_ICON: boolean }).TRAY_ICON = false;
    manager.updateStatus({
      stationId: 'poste-1',
      stationName: 'Poste 1',
      version: '9.9.9',
      connected: true,
      acRunning: false,
      blankingActive: true,
    });
    expect(existsSync(path.join(tmpRoot, 'console-status.json'))).toBe(false);
  });
});
