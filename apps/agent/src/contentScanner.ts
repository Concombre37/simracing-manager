import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from 'pino';
import { config } from './config';

export interface Car {
  acId: string;
  name: string;
  brand?: string;
  category?: string;
}

export interface Track {
  acId: string;
  name: string;
  layouts: string[];
}

export interface AcContent {
  cars: Car[];
  tracks: Track[];
}

async function readJsonSafe<T>(filePath: string): Promise<T | undefined> {
  try {
    await fs.access(filePath);
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data) as T;
  } catch {
    return undefined;
  }
}

export class ContentScanner {
  constructor(private readonly logger: Logger) {}

  async scan(): Promise<AcContent> {
    const content: AcContent = { cars: [], tracks: [] };

    const acPath = await this.resolveAcPath();
    if (!acPath) {
      this.logger.warn(
        { tried: this.getCandidatePaths() },
        'Assetto Corsa directory not found. Set AC_PATH in .env if the game is installed elsewhere.',
      );
      return content;
    }

    this.logger.info({ acPath }, 'Scanning Assetto Corsa content');

    const carsDir = path.join(acPath, 'content', 'cars');
    if (await this.pathExists(carsDir)) {
      const entries = await fs.readdir(carsDir);
      for (const entry of entries) {
        const carDir = path.join(carsDir, entry);
        const stat = await fs.stat(carDir).catch(() => null);
        if (!stat?.isDirectory()) continue;

        const uiJson = await readJsonSafe<{
          name?: string;
          brand?: string;
          class?: string;
        }>(path.join(carDir, 'ui_car.json'));

        content.cars.push({
          acId: entry,
          name: uiJson?.name || entry,
          brand: uiJson?.brand,
          category: uiJson?.class,
        });
      }
    } else {
      this.logger.warn({ carsDir }, 'Cars directory not found');
    }

    const tracksDir = path.join(acPath, 'content', 'tracks');
    if (await this.pathExists(tracksDir)) {
      const entries = await fs.readdir(tracksDir);
      for (const entry of entries) {
        const trackDir = path.join(tracksDir, entry);
        const stat = await fs.stat(trackDir).catch(() => null);
        if (!stat?.isDirectory()) continue;

        const uiJson = await readJsonSafe<{ name?: string }>(path.join(trackDir, 'ui_track.json'));

        const layouts: string[] = [];
        const subEntries = await fs.readdir(trackDir).catch(() => []);
        for (const sub of subEntries) {
          const subDir = path.join(trackDir, sub);
          const subStat = await fs.stat(subDir).catch(() => null);
          if (!subStat?.isDirectory()) continue;
          if (await this.pathExists(path.join(subDir, 'ui_track.json'))) {
            layouts.push(sub);
          }
        }

        content.tracks.push({
          acId: entry,
          name: uiJson?.name || entry,
          layouts,
        });
      }
    } else {
      this.logger.warn({ tracksDir }, 'Tracks directory not found');
    }

    this.logger.info(
      { cars: content.cars.length, tracks: content.tracks.length, acPath },
      'Assetto Corsa content scanned',
    );
    return content;
  }

  private getCandidatePaths(): string[] {
    const candidates: string[] = [];
    if (config.AC_PATH) {
      candidates.push(config.AC_PATH);
    }
    if (process.platform === 'win32') {
      const programFiles = process.env.ProgramFiles;
      const programFilesX86 = process.env['ProgramFiles(x86)'];
      const prefixes = [
        programFiles,
        programFilesX86,
        'C:\\Program Files',
        'C:\\Program Files (x86)',
        'C:\\Steam',
      ].filter((p): p is string => !!p);
      const seen = new Set<string>();
      for (const prefix of prefixes) {
        const candidate = path.join(prefix, 'Steam', 'steamapps', 'common', 'assettocorsa');
        if (!seen.has(candidate)) {
          seen.add(candidate);
          candidates.push(candidate);
        }
      }
    }
    return candidates;
  }

  private async resolveAcPath(): Promise<string | undefined> {
    if (config.AC_PATH) {
      if (await this.pathExists(path.join(config.AC_PATH, 'content', 'cars'))) {
        return config.AC_PATH;
      }
      this.logger.warn(
        { acPath: config.AC_PATH },
        'Configured AC_PATH does not contain content/cars',
      );
    }

    for (const candidate of this.getCandidatePaths()) {
      if (await this.pathExists(path.join(candidate, 'content', 'cars'))) {
        return candidate;
      }
    }

    return undefined;
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
