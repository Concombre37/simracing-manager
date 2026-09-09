import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  acPath: '',
}));

vi.mock('./acPathResolver', () => ({
  resolveAcInstallPath: vi.fn(async () => testState.acPath),
  getAcCandidatePaths: vi.fn(async () => [testState.acPath]),
}));

import { ContentScanner } from './contentScanner';

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as import('pino').Logger;

const roots: string[] = [];

async function createTrack(root: string, layoutNames: string[]): Promise<void> {
  const trackDir = path.join(root, 'content', 'tracks', 'spa');
  await fs.mkdir(path.join(trackDir, 'ui'), { recursive: true });
  await fs.writeFile(path.join(trackDir, 'ui_track.json'), JSON.stringify({ name: 'Spa' }));
  await fs.writeFile(path.join(trackDir, 'preview.png'), 'preview');
  await fs.writeFile(path.join(trackDir, 'outline.png'), 'outline');
  for (const layout of layoutNames) {
    const layoutDir = path.join(trackDir, 'ui', layout);
    await fs.mkdir(layoutDir, { recursive: true });
    await fs.writeFile(path.join(layoutDir, 'ui_track.json'), JSON.stringify({ name: layout }));
    await fs.writeFile(path.join(layoutDir, 'preview.png'), 'preview');
    await fs.writeFile(path.join(layoutDir, 'outline.png'), 'outline');
  }
}

describe('ContentScanner track layout cache invalidation', () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it('rescans layouts added after the first scan instead of keeping an empty cache', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'simracing-content-'));
    roots.push(root);
    testState.acPath = root;
    await fs.mkdir(path.join(root, 'content', 'cars', 'test_car'), { recursive: true });
    await fs.writeFile(path.join(root, 'content', 'cars', 'test_car', 'preview.png'), 'preview');
    await createTrack(root, []);

    const cachePath = path.join(root, 'content-cache.json');
    const scanner = new ContentScanner(logger, cachePath);
    const first = await scanner.scan();
    expect(first.tracks[0]?.layouts).toHaveLength(0);

    await createTrack(root, ['2024']);
    const second = await scanner.scan();
    expect(second.tracks[0]?.layouts.map((layout) => layout.name)).toEqual(['2024']);
  });
});
