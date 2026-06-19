import { promises as fs } from 'fs';
import { Logger } from 'pino';
import type { Car, Track } from './contentScanner';

interface CachedCar extends Car {
  updatedAt: number;
}

interface CachedTrack extends Track {
  updatedAt: number;
}

const CACHE_VERSION = 5;

interface CacheData {
  version?: number;
  acPath?: string;
  cars: CachedCar[];
  tracks: CachedTrack[];
}

export class ContentCache {
  private data: CacheData = { cars: [], tracks: [] };
  private carMap = new Map<string, CachedCar>();
  private trackMap = new Map<string, CachedTrack>();

  constructor(
    private readonly filePath: string,
    private readonly logger: Logger,
  ) {}

  async load(): Promise<void> {
    try {
      await fs.access(this.filePath);
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as CacheData;
      if (parsed.version !== CACHE_VERSION) {
        this.logger.info(
          { cachedVersion: parsed.version, currentVersion: CACHE_VERSION },
          'Content cache version mismatch, invalidating cache',
        );
        this.data = { cars: [], tracks: [] };
      } else {
        this.data = {
          acPath: parsed.acPath,
          cars: Array.isArray(parsed.cars) ? parsed.cars : [],
          tracks: Array.isArray(parsed.tracks) ? parsed.tracks : [],
        };
      }
      this.rebuildMaps();
      this.logger.info(
        { cars: this.data.cars.length, tracks: this.data.tracks.length },
        'Content cache loaded',
      );
    } catch {
      this.data = { cars: [], tracks: [] };
      this.rebuildMaps();
    }
  }

  async save(): Promise<void> {
    try {
      await fs.writeFile(
        this.filePath,
        JSON.stringify({ ...this.data, version: CACHE_VERSION }),
        'utf-8',
      );
    } catch (err) {
      this.logger.warn({ err }, 'Failed to save content cache');
    }
  }

  getCar(acId: string): CachedCar | undefined {
    return this.carMap.get(acId);
  }

  setCar(car: CachedCar): void {
    const existing = this.carMap.get(car.acId);
    if (existing) {
      Object.assign(existing, car);
    } else {
      this.data.cars.push(car);
      this.carMap.set(car.acId, car);
    }
  }

  getTrack(acId: string): CachedTrack | undefined {
    return this.trackMap.get(acId);
  }

  setTrack(track: CachedTrack): void {
    const existing = this.trackMap.get(track.acId);
    if (existing) {
      Object.assign(existing, track);
    } else {
      this.data.tracks.push(track);
      this.trackMap.set(track.acId, track);
    }
  }

  setAcPath(acPath: string): void {
    this.data.acPath = acPath;
  }

  private rebuildMaps(): void {
    this.carMap = new Map(this.data.cars.map((c) => [c.acId, c]));
    this.trackMap = new Map(this.data.tracks.map((t) => [t.acId, t]));
  }
}

export async function maxMtime(...filePaths: string[]): Promise<number> {
  let max = 0;
  for (const filePath of filePaths) {
    try {
      const stat = await fs.stat(filePath);
      if (stat.isFile() && stat.mtimeMs > max) {
        max = stat.mtimeMs;
      }
    } catch {
      // ignore missing files
    }
  }
  return max;
}
