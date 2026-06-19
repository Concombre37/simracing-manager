import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { Logger } from 'pino';
import { BlankingMediaFile } from '@simracing/shared';
import { config } from './config';
import { BlankingManager } from './blankingManager';

const MEDIA_DIR = path.join(process.env.TEMP || '/tmp', 'simracing-manager', 'blanking-media');

export class BlankingMediaSync {
  constructor(
    private readonly logger: Logger,
    private readonly blankingManager: BlankingManager,
  ) {}

  async sync(stationId: string, apiKey?: string): Promise<void> {
    try {
      const token = apiKey ?? config.API_KEY;
      if (!token) {
        this.logger.warn('No API key available, skipping blanking media sync');
        return;
      }

      this.logger.info('Syncing blanking media');
      const { data: mediaList } = await axios.get<BlankingMediaFile[]>(
        `${config.SERVER_URL}/api/stations/${stationId}/blanking-media`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      await fs.mkdir(MEDIA_DIR, { recursive: true });

      const localFiles = await this.listLocalFiles();
      const remoteIds = new Set<string>();
      const keptPaths: string[] = [];

      for (const media of mediaList) {
        remoteIds.add(media.id);
        const ext = path.extname(media.filename) || this.mimeToExt(media.mimeType);
        const localPath = path.join(MEDIA_DIR, `${media.id}${ext}`);
        keptPaths.push(localPath);

        if (!localFiles.has(`${media.id}${ext}`)) {
          await this.downloadMedia(media, localPath, token);
        }
      }

      // Remove local files no longer in the remote list
      for (const localFile of localFiles) {
        const localPath = path.join(MEDIA_DIR, localFile);
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

      this.blankingManager.setMediaPaths(keptPaths);
      this.logger.info({ count: keptPaths.length }, 'Blanking media sync complete');
    } catch (err) {
      this.logger.error({ err }, 'Failed to sync blanking media');
    }
  }

  private async listLocalFiles(): Promise<Set<string>> {
    try {
      const entries = await fs.readdir(MEDIA_DIR, { withFileTypes: true });
      return new Set(entries.filter((e) => e.isFile()).map((e) => e.name));
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
