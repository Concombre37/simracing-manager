import fs from 'fs/promises';
import path from 'path';
import { Logger } from 'pino';
import { config } from './config';

export class RaceResultReader {
  constructor(private readonly logger: Logger) {}

  async readLatest(since?: number): Promise<Record<string, unknown> | null> {
    const filePath = this.getFilePath();
    try {
      const stats = await fs.stat(filePath);
      if (since && stats.mtimeMs < since) {
        this.logger.debug(
          { mtimeMs: stats.mtimeMs, since },
          'race_out.json is older than session start, ignoring',
        );
        return null;
      }
      const content = await fs.readFile(filePath, 'utf-8');
      if (!content.trim()) return null;
      const parsed = JSON.parse(content) as Record<string, unknown>;
      this.logger.info({ filePath, size: content.length }, 'Read Assetto Corsa race results');
      return parsed;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        this.logger.debug({ err }, 'Failed to read race_out.json');
      }
      return null;
    }
  }

  private getFilePath(): string {
    const documentsPath =
      config.DOCUMENTS_PATH ?? path.join(process.env.USERPROFILE ?? '', 'Documents');
    return path.join(documentsPath, 'Assetto Corsa', 'out', 'race_out.json');
  }
}
