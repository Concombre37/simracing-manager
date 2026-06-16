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

    const acPath =
      config.AC_PATH ??
      path.join(process.env.ProgramFiles ?? '', 'Steam', 'steamapps', 'common', 'assettocorsa');

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
    }

    this.logger.info(
      { cars: content.cars.length, tracks: content.tracks.length },
      'Assetto Corsa content scanned',
    );
    return content;
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
