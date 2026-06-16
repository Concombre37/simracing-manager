import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from 'pino';
import { config } from './config';
import { ContentCache, maxMtime } from './contentCache';

export interface Car {
  acId: string;
  name: string;
  brand?: string;
  category?: string;
  preview?: string;
}

export interface Track {
  acId: string;
  name: string;
  layouts: string[];
  preview?: string;
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

const MAX_PREVIEW_BYTES = 60 * 1024;

async function readImageAsBase64(filePath: string): Promise<string | undefined> {
  try {
    await fs.access(filePath);
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size > MAX_PREVIEW_BYTES) return undefined;
    const buffer = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime =
      ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    return undefined;
  }
}

async function findCarPreview(carDir: string): Promise<string | undefined> {
  const rootPreview = await readImageAsBase64(path.join(carDir, 'preview.png'));
  if (rootPreview) return rootPreview;

  const skinsDir = path.join(carDir, 'skins');
  try {
    const skins = await fs.readdir(skinsDir);
    for (const skin of skins) {
      const skinPreview = await readImageAsBase64(path.join(skinsDir, skin, 'preview.png'));
      if (skinPreview) return skinPreview;
    }
  } catch {
    // ignore
  }
  return undefined;
}

async function findTrackPreview(trackDir: string): Promise<string | undefined> {
  for (const name of ['preview.png', 'preview.jpg', 'preview.jpeg']) {
    const preview = await readImageAsBase64(path.join(trackDir, name));
    if (preview) return preview;
  }
  return undefined;
}

export class ContentScanner {
  private readonly cache: ContentCache;

  constructor(
    private readonly logger: Logger,
    cachePath?: string,
  ) {
    const baseDir = path.dirname(process.execPath);
    this.cache = new ContentCache(cachePath ?? path.join(baseDir, 'content-cache.json'), logger);
  }

  async scan(): Promise<AcContent> {
    const content: AcContent = { cars: [], tracks: [] };
    await this.cache.load();

    const acPath = await this.resolveAcPath();
    if (!acPath) {
      this.logger.warn(
        { tried: this.getCandidatePaths() },
        'Assetto Corsa directory not found. Set AC_PATH in .env if the game is installed elsewhere.',
      );
      return content;
    }

    this.cache.setAcPath(acPath);
    this.logger.info({ acPath }, 'Scanning Assetto Corsa content');

    const carsDir = path.join(acPath, 'content', 'cars');
    if (await this.pathExists(carsDir)) {
      const entries = await fs.readdir(carsDir);
      for (const entry of entries) {
        const carDir = path.join(carsDir, entry);
        const stat = await fs.stat(carDir).catch(() => null);
        if (!stat?.isDirectory()) continue;

        const uiPath = path.join(carDir, 'ui_car.json');
        const previewPaths = await this.getCarPreviewPaths(carDir);
        const updatedAt = await maxMtime(uiPath, ...previewPaths);
        const cached = this.cache.getCar(entry);

        if (cached && cached.updatedAt === updatedAt) {
          content.cars.push({
            acId: cached.acId,
            name: cached.name,
            brand: cached.brand,
            category: cached.category,
            preview: cached.preview,
          });
          continue;
        }

        const uiJson = await readJsonSafe<{
          name?: string;
          brand?: string;
          class?: string;
        }>(uiPath);
        const car: Car = {
          acId: entry,
          name: uiJson?.name || entry,
          brand: uiJson?.brand,
          category: uiJson?.class,
          preview: await findCarPreview(carDir),
        };
        this.cache.setCar({ ...car, updatedAt });
        content.cars.push(car);
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

        const uiPath = path.join(trackDir, 'ui_track.json');
        const previewPaths = ['preview.png', 'preview.jpg', 'preview.jpeg'].map((n) =>
          path.join(trackDir, n),
        );
        const updatedAt = await maxMtime(uiPath, ...previewPaths);
        const cached = this.cache.getTrack(entry);

        if (cached && cached.updatedAt === updatedAt) {
          content.tracks.push({
            acId: cached.acId,
            name: cached.name,
            layouts: cached.layouts,
            preview: cached.preview,
          });
          continue;
        }

        const uiJson = await readJsonSafe<{ name?: string }>(uiPath);

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

        const track: Track = {
          acId: entry,
          name: uiJson?.name || entry,
          layouts,
          preview: await findTrackPreview(trackDir),
        };
        this.cache.setTrack({ ...track, updatedAt });
        content.tracks.push(track);
      }
    } else {
      this.logger.warn({ tracksDir }, 'Tracks directory not found');
    }

    await this.cache.save();
    this.logger.info(
      { cars: content.cars.length, tracks: content.tracks.length, acPath },
      'Assetto Corsa content scanned',
    );
    return content;
  }

  private async getCarPreviewPaths(carDir: string): Promise<string[]> {
    const paths: string[] = [path.join(carDir, 'preview.png')];
    const skinsDir = path.join(carDir, 'skins');
    try {
      const skins = await fs.readdir(skinsDir);
      for (const skin of skins) {
        paths.push(path.join(skinsDir, skin, 'preview.png'));
      }
    } catch {
      // ignore
    }
    return paths;
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
