import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { Logger } from 'pino';
import { BlankingMediaCategory, BlankingMediaFile } from '@simracing/shared';
import { config } from './config';
import { BlankingManager } from './blankingManager';

const MEDIA_ROOT_DIR = path.join(process.env.TEMP || '/tmp', 'simracing-manager', 'blanking-media');

const CATEGORIES: BlankingMediaCategory[] = ['idle', 'launching', 'results'];
/** "launching" and "results" are shared by every pod (same launch photos,
 * same results logo everywhere) — fetched from the global endpoint instead
 * of a per-station one. Only "idle" still differs per pod. */
const GLOBAL_CATEGORIES: BlankingMediaCategory[] = ['launching', 'results'];

export class BlankingMediaSync {
  constructor(
    private readonly logger: Logger,
    private readonly blankingManager: BlankingManager,
  ) {}

  async sync(stationId: string, apiKey?: string): Promise<void> {
    const token = apiKey ?? config.API_KEY;
    if (!token) {
      this.logger.warn('No API key available, skipping blanking media sync');
      return;
    }

    for (const category of CATEGORIES) {
      try {
        const keptPaths = await this.syncCategory(stationId, category, token);
        this.applyPaths(category, keptPaths);
      } catch (err) {
        this.logger.error({ err, category }, 'Failed to sync blanking media');
      }
    }
  }

  private async syncCategory(
    stationId: string,
    category: BlankingMediaCategory,
    token: string,
  ): Promise<string[]> {
    this.logger.info({ category }, 'Syncing blanking media');
    const url = GLOBAL_CATEGORIES.includes(category)
      ? `${config.SERVER_URL}/api/blanking-media/global`
      : `${config.SERVER_URL}/api/stations/${stationId}/blanking-media`;
    const { data: mediaList } = await axios.get<BlankingMediaFile[]>(url, {
      headers: { Authorization: `Bearer ${token}` },
      params: { category },
    });

    const dir = path.join(MEDIA_ROOT_DIR, category);
    await fs.mkdir(dir, { recursive: true });

    const localFiles = await this.listLocalFiles(dir);
    // Tracks each cached file's server `updatedAt` so a same-id re-upload
    // (e.g. an image replaced in place, or resized server-side) is detected
    // and re-downloaded — without this, a file existing on disk under its
    // id was treated as "already synced" forever, no matter how stale its
    // content actually was.
    const manifest = await this.readManifest(dir);
    const nextManifest: Record<string, string> = {};
    const remoteIds = new Set<string>();
    const keptPaths: string[] = [];

    for (const media of mediaList) {
      remoteIds.add(media.id);
      const ext = path.extname(media.filename) || this.mimeToExt(media.mimeType);
      const filename = `${media.id}${ext}`;
      const localPath = path.join(dir, filename);
      keptPaths.push(localPath);

      const updatedAt = String(media.updatedAt);
      const stale = !localFiles.has(filename) || manifest[media.id] !== updatedAt;
      if (stale) {
        await this.downloadMedia(media, localPath, token);
      }
      nextManifest[media.id] = updatedAt;
    }

    // Remove local files no longer in the remote list
    for (const localFile of localFiles) {
      const localPath = path.join(dir, localFile);
      const fileId = path.basename(localFile, path.extname(localFile));
      if (!remoteIds.has(fileId)) {
        try {
          await fs.unlink(localPath);
          this.logger.debug({ localPath }, 'Removed stale blanking media');
        } catch (err) {
          this.logger.debug({ err, localPath }, 'Failed to remove stale blanking media');
        }
      }
    }

    await this.writeManifest(dir, nextManifest);

    this.logger.info({ category, count: keptPaths.length }, 'Blanking media sync complete');
    return keptPaths;
  }

  private manifestPath(dir: string): string {
    return path.join(dir, '.manifest.json');
  }

  private async readManifest(dir: string): Promise<Record<string, string>> {
    try {
      const raw = await fs.readFile(this.manifestPath(dir), 'utf-8');
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return {};
    }
  }

  private async writeManifest(dir: string, manifest: Record<string, string>): Promise<void> {
    try {
      await fs.writeFile(this.manifestPath(dir), JSON.stringify(manifest));
    } catch (err) {
      this.logger.debug({ err, dir }, 'Failed to write blanking media manifest');
    }
  }

  private applyPaths(category: BlankingMediaCategory, paths: string[]): void {
    switch (category) {
      case 'idle':
        this.blankingManager.setMediaPaths(paths);
        break;
      case 'launching':
        this.blankingManager.setLaunchingMediaPaths(paths);
        break;
      case 'results':
        this.blankingManager.setResultsLogoPath(paths[0] ?? null);
        break;
    }
  }

  private async listLocalFiles(dir: string): Promise<Set<string>> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      // Excludes the manifest itself — it isn't a media file keyed by a
      // remote id, so leaving it in would make the stale-file cleanup below
      // delete it again on every single sync right after writeManifest()
      // wrote it.
      return new Set(
        entries.filter((e) => e.isFile() && e.name !== '.manifest.json').map((e) => e.name),
      );
    } catch {
      return new Set();
    }
  }

  private async downloadMedia(
    media: BlankingMediaFile,
    localPath: string,
    apiKey?: string,
  ): Promise<void> {
    this.logger.info({ mediaId: media.id, filename: media.filename }, 'Downloading blanking media');
    const response = await axios.get(
      `${config.SERVER_URL}/api/blanking-media/${media.id}/download`,
      {
        headers: { Authorization: `Bearer ${apiKey ?? config.API_KEY}` },
        responseType: 'arraybuffer',
      },
    );
    await fs.writeFile(localPath, Buffer.from(response.data));
  }

  private mimeToExt(mimeType: string): string {
    switch (mimeType) {
      case 'image/png':
        return '.png';
      case 'image/jpeg':
      case 'image/jpg':
        return '.jpg';
      case 'image/webp':
        return '.webp';
      case 'video/mp4':
        return '.mp4';
      case 'video/webm':
        return '.webm';
      default:
        return '';
    }
  }
}
