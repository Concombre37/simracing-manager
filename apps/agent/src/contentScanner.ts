import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Logger } from 'pino';
import { config } from './config';
import { ContentCache, maxMtime } from './contentCache';

const execFileAsync = promisify(execFile);

export interface Car {
  acId: string;
  name: string;
  brand?: string;
  category?: string;
  preview?: string;
}

export interface TrackLayout {
  name: string;
  preview?: string;
}

export interface Track {
  acId: string;
  name: string;
  layouts: TrackLayout[];
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

const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;

async function compressImageBuffer(
  buffer: Buffer,
  logger: Logger,
  filePath: string,
): Promise<{ mime: string; data: string } | undefined> {
  // Jimp fails inside the packaged executable with "Invalid host defined options".
  // Fall back to sending the raw image so previews always reach the backend.
  logger.debug({ filePath }, 'Skipping Jimp compression, sending raw preview');
  return undefined;
}

async function convertDdsToPng(ddsPath: string, logger: Logger): Promise<Buffer | undefined> {
  if (process.platform !== 'win32') return undefined;
  const tmpPng = path.join(os.tmpdir(), `simracing-preview-${Date.now()}.png`);
  try {
    await execFileAsync('magick', ['convert', ddsPath, tmpPng], { timeout: 10000 });
    const buffer = await fs.readFile(tmpPng);
    await fs.unlink(tmpPng).catch(() => {});
    return Buffer.from(buffer);
  } catch (err) {
    logger.debug(
      { err: err instanceof Error ? err.message : String(err), ddsPath },
      'ImageMagick DDS conversion failed',
    );
    await fs.unlink(tmpPng).catch(() => {});
    return undefined;
  }
}

async function readImageAsBase64(filePath: string, logger: Logger): Promise<string | undefined> {
  try {
    await fs.access(filePath);
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return undefined;

    const ext = path.extname(filePath).toLowerCase();
    let buffer: Buffer<ArrayBufferLike> = Buffer.from(await fs.readFile(filePath));
    const originalMime =
      ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';

    if (ext === '.dds') {
      const converted = await convertDdsToPng(filePath, logger);
      if (!converted) {
        logger.warn({ filePath }, 'DDS preview could not be converted to PNG');
        return undefined;
      }
      buffer = converted;
    }

    const compressed = await compressImageBuffer(buffer, logger, filePath);
    if (compressed) {
      const dataUrl = `data:${compressed.mime};base64,${compressed.data}`;
      if (Buffer.byteLength(dataUrl, 'utf8') <= MAX_PREVIEW_BYTES) {
        return dataUrl;
      }
      logger.warn(
        { filePath, sizeBytes: Buffer.byteLength(dataUrl, 'utf8') },
        'Compressed preview still exceeds size limit',
      );
    }

    if (stat.size <= MAX_PREVIEW_BYTES) {
      return `data:${originalMime};base64,${buffer.toString('base64')}`;
    }

    logger.warn(
      { filePath, sizeBytes: stat.size },
      'Preview file exceeds size limit and could not be compressed',
    );
    return undefined;
  } catch (err) {
    logger.debug(
      { err: err instanceof Error ? err.message : String(err), filePath },
      'Failed to read preview file',
    );
    return undefined;
  }
}

async function findFirstImage(
  baseDir: string,
  names: string[],
  logger: Logger,
): Promise<string | undefined> {
  for (const name of names) {
    const preview = await readImageAsBase64(path.join(baseDir, name), logger);
    if (preview) return preview;
  }
  return undefined;
}

const PREVIEW_NAMES = ['preview.png', 'preview.jpg', 'preview.jpeg', 'preview.dds'];

async function findCarPreview(
  logger: Logger,
  carDir: string,
  acId: string,
): Promise<string | undefined> {
  const rootPreview = await findFirstImage(carDir, PREVIEW_NAMES, logger);
  if (rootPreview) return rootPreview;

  const uiPreview = await findFirstImage(path.join(carDir, 'ui'), PREVIEW_NAMES, logger);
  if (uiPreview) return uiPreview;

  const skinsDir = path.join(carDir, 'skins');
  try {
    const skins = await fs.readdir(skinsDir);
    for (const skin of skins) {
      const skinPreview = await findFirstImage(path.join(skinsDir, skin), PREVIEW_NAMES, logger);
      if (skinPreview) return skinPreview;
    }
  } catch {
    // ignore
  }

  logger.warn(
    {
      acId,
      tried: [
        path.join(carDir, 'preview.*'),
        path.join(carDir, 'ui', 'preview.*'),
        path.join(skinsDir, '*', 'preview.*'),
      ],
    },
    'No car preview found',
  );
  return undefined;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retries a directory listing a few times before giving up — a transient
 * failure here (antivirus scan mid-read, a network/USB drive hiccup, a
 * removable Steam library not fully mounted yet) must never be allowed to
 * masquerade as "this car/track folder is genuinely empty", since that
 * silently wipes out real content on the next upload. */
async function readDirWithRetry(
  logger: Logger,
  dir: string,
  attempts = 3,
  delayMs = 500,
): Promise<string[]> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fs.readdir(dir);
    } catch (err) {
      lastErr = err;
      if (attempt < attempts) {
        await sleep(delayMs);
      }
    }
  }
  logger.error(
    { dir, attempts, err: lastErr instanceof Error ? lastErr.message : String(lastErr) },
    'Failed to list directory after retries',
  );
  return [];
}

/**
 * A multi-layout AC track's per-layout ui_track.json/preview normally lives
 * under `<track>/ui/<layout>/`, not `<track>/<layout>/` (that sibling folder
 * holds the layout's 3D data, referenced by models_<layout>.ini, not its UI
 * assets) — this was the actual reason some circuits had no photo at all:
 * the old lookup only ever checked the (wrong, for this convention)
 * `<track>/<layout>/` path. Checked in this order since some community
 * track packages do use the flatter convention.
 */
async function findLayoutPreview(
  logger: Logger,
  trackDir: string,
  layout: string,
): Promise<string | undefined> {
  const candidateDirs = [
    path.join(trackDir, 'ui', layout),
    path.join(trackDir, layout, 'ui'),
    path.join(trackDir, layout),
  ];
  for (const dir of candidateDirs) {
    const preview = await findFirstImage(dir, PREVIEW_NAMES, logger);
    if (preview) return preview;
  }
  return undefined;
}

/**
 * Layout names, checking both the standard AC convention
 * (`<track>/ui/<layout>/ui_track.json`) and the flatter one some community
 * tracks use (`<track>/<layout>/ui_track.json`) — a track can be picked up
 * by either without being listed twice.
 */
async function discoverLayoutNames(trackDir: string): Promise<string[]> {
  const ignoredLayoutDirs = new Set(['ui', 'data', 'ai', 'models', 'skins', 'sfx', 'textures']);
  const names = new Set<string>();

  const uiDir = path.join(trackDir, 'ui');
  const uiSubEntries = await fs.readdir(uiDir).catch(() => []);
  for (const sub of uiSubEntries) {
    const subDir = path.join(uiDir, sub);
    const subStat = await fs.stat(subDir).catch(() => null);
    if (!subStat?.isDirectory()) continue;
    if (await pathExists(path.join(subDir, 'ui_track.json'))) {
      names.add(sub);
    }
  }

  const rootSubEntries = await fs.readdir(trackDir).catch(() => []);
  for (const sub of rootSubEntries) {
    if (ignoredLayoutDirs.has(sub.toLowerCase())) continue;
    const subDir = path.join(trackDir, sub);
    const subStat = await fs.stat(subDir).catch(() => null);
    if (!subStat?.isDirectory()) continue;
    if (await pathExists(path.join(subDir, 'ui_track.json'))) {
      names.add(sub);
    }
  }

  return [...names];
}

async function findTrackPreview(
  logger: Logger,
  trackDir: string,
  layouts: TrackLayout[],
  acId: string,
): Promise<string | undefined> {
  const rootPreview = await findFirstImage(trackDir, PREVIEW_NAMES, logger);
  if (rootPreview) return rootPreview;

  const uiPreview = await findFirstImage(path.join(trackDir, 'ui'), PREVIEW_NAMES, logger);
  if (uiPreview) return uiPreview;

  const layoutPreview = layouts.find((l) => l.preview)?.preview;
  if (layoutPreview) return layoutPreview;

  logger.warn(
    {
      acId,
      tried: [
        path.join(trackDir, 'preview.*'),
        path.join(trackDir, 'ui', 'preview.*'),
        ...layouts.map((l) => path.join(trackDir, 'ui', l.name, 'preview.*')),
      ],
    },
    'No track preview found',
  );
  return undefined;
}

export class ContentScanner {
  private readonly cache: ContentCache;
  private lastScanWarning: string | undefined;
  private hadPreviousCars = false;
  private hadPreviousTracks = false;

  constructor(
    private readonly logger: Logger,
    cachePath?: string,
  ) {
    const baseDir = path.dirname(process.execPath);
    this.cache = new ContentCache(cachePath ?? path.join(baseDir, 'content-cache.json'), logger);
  }

  /** Set whenever the latest scan() found dramatically fewer cars/tracks
   * than the previous successful scan — a signal worth surfacing loudly
   * (e.g. via sendLog to the backend) since a scan that "succeeds" with
   * near-zero content is functionally the same failure as one that errors
   * out, just silent about it otherwise. Cleared at the start of scan(). */
  getLastScanWarning(): string | undefined {
    return this.lastScanWarning;
  }

  /** Whether the local cache remembered real content from a prior
   * successful scan, as of the most recent scan() call — lets the caller
   * (agent.ts) decide whether an empty/anomalous result is safe to upload
   * (a genuinely fresh station has nothing to protect) or must be withheld
   * to avoid overwriting good content already on the backend with a
   * transient bad scan. */
  hadKnownGoodContent(): boolean {
    return this.hadPreviousCars || this.hadPreviousTracks;
  }

  async scan(): Promise<AcContent> {
    const content: AcContent = { cars: [], tracks: [] };
    this.lastScanWarning = undefined;
    await this.cache.load();
    const previousCarCount = this.cache.carCount();
    const previousTrackCount = this.cache.trackCount();
    this.hadPreviousCars = previousCarCount > 0;
    this.hadPreviousTracks = previousTrackCount > 0;

    const acPath = await this.resolveAcPath();
    if (!acPath) {
      const tried = await this.getCandidatePaths();
      this.lastScanWarning =
        'Assetto Corsa directory not found — no cars/tracks to send. Set AC_PATH in .env if the game is installed elsewhere.';
      this.logger.warn(
        { tried },
        'Assetto Corsa directory not found. Set AC_PATH in .env if the game is installed elsewhere.',
      );
      return content;
    }

    this.cache.setAcPath(acPath);
    this.logger.info({ acPath }, 'Scanning Assetto Corsa content');

    const carsDir = path.join(acPath, 'content', 'cars');
    if (await this.pathExists(carsDir)) {
      const entries = await readDirWithRetry(this.logger, carsDir);
      for (const entry of entries) {
        const carDir = path.join(carsDir, entry);
        const stat = await fs.stat(carDir).catch(() => null);
        if (!stat?.isDirectory()) continue;

        // The standard AC convention nests this under a `ui` folder — a
        // flat `ui_car.json` at the car root (previously the only path
        // checked) essentially never matches real content, silently
        // falling back to the raw acId as the display name for every car
        // (e.g. "ks_ferrari_488_gt3_2020" instead of "Ferrari 488 GT3
        // Evo 2020") without ever surfacing an error, since a missing
        // name/brand/category isn't treated as a failure.
        const uiPathNested = path.join(carDir, 'ui', 'ui_car.json');
        const uiPathRoot = path.join(carDir, 'ui_car.json');
        const previewPaths = await this.getCarPreviewPaths(carDir);
        const updatedAt = await maxMtime(uiPathNested, uiPathRoot, ...previewPaths);
        const cached = this.cache.getCar(entry);

        if (cached && cached.updatedAt === updatedAt && cached.preview !== undefined) {
          content.cars.push({
            acId: cached.acId,
            name: cached.name,
            brand: cached.brand,
            category: cached.category,
            preview: cached.preview,
          });
          continue;
        }

        let uiJson = await readJsonSafe<{
          name?: string;
          brand?: string;
          class?: string;
        }>(uiPathNested);
        if (!uiJson) {
          uiJson = await readJsonSafe(uiPathRoot);
        }
        const car: Car = {
          acId: entry,
          name: uiJson?.name || entry,
          brand: uiJson?.brand,
          category: uiJson?.class,
          preview: await findCarPreview(this.logger, carDir, entry),
        };
        this.cache.setCar({ ...car, updatedAt });
        content.cars.push(car);
      }
    } else {
      this.logger.warn({ carsDir }, 'Cars directory not found');
    }

    const tracksDir = path.join(acPath, 'content', 'tracks');
    if (await this.pathExists(tracksDir)) {
      const entries = await readDirWithRetry(this.logger, tracksDir);
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

        if (cached && cached.updatedAt === updatedAt && cached.preview !== undefined) {
          content.tracks.push({
            acId: cached.acId,
            name: cached.name,
            layouts: cached.layouts,
            preview: cached.preview,
          });
          continue;
        }

        let uiJson = await readJsonSafe<{ name?: string }>(uiPath);
        if (!uiJson) {
          uiJson = await readJsonSafe<{ name?: string }>(
            path.join(trackDir, 'ui', 'ui_track.json'),
          );
        }

        const layoutNames = await discoverLayoutNames(trackDir);
        const layouts: TrackLayout[] = await Promise.all(
          layoutNames.map(async (name) => ({
            name,
            preview: await findLayoutPreview(this.logger, trackDir, name),
          })),
        );

        const track: Track = {
          acId: entry,
          name: uiJson?.name || entry,
          layouts,
          preview: await findTrackPreview(this.logger, trackDir, layouts, entry),
        };
        track.name = track.name
          .replace(/\s+-\s*layout\s*$/i, '')
          .replace(/-layout\s*$/i, '')
          .replace(/\s+layout\s*$/i, '')
          .trim();
        this.cache.setTrack({ ...track, updatedAt });
        content.tracks.push(track);
      }
    } else {
      this.logger.warn({ tracksDir }, 'Tracks directory not found');
    }

    await this.cache.save();

    // A scan that "succeeds" but silently returns far less content than
    // last time (AC_PATH now pointing at an empty/wrong folder, a Steam
    // library that went offline, a botched mod cleanup...) is functionally
    // the same failure as one that errors out — it just never surfaces as
    // one, since the payload sent to the backend is still well-formed.
    // Flag it loudly instead of only ever showing up as "car X is missing"
    // days later.
    const REGRESSION_RATIO = 0.5;
    const carsRegressed =
      previousCarCount >= 10 && content.cars.length < previousCarCount * REGRESSION_RATIO;
    const tracksRegressed =
      previousTrackCount >= 5 && content.tracks.length < previousTrackCount * REGRESSION_RATIO;
    // AC being found at all (acPath resolved, content/cars or content/tracks
    // exists) but the scan still coming back with zero of either is never a
    // legitimate outcome for a real install — every AC install ships with a
    // base roster of cars and tracks. Flag this unconditionally, even for a
    // brand-new station with no prior scan to regress from (previousCarCount
    // === 0), instead of only catching drops from a previously-known count.
    const carsImpossiblyEmpty = content.cars.length === 0;
    const tracksImpossiblyEmpty = content.tracks.length === 0;

    if (carsRegressed || tracksRegressed || carsImpossiblyEmpty || tracksImpossiblyEmpty) {
      const reasons: string[] = [];
      if (carsImpossiblyEmpty) reasons.push('0 cars found despite Assetto Corsa being detected');
      if (tracksImpossiblyEmpty)
        reasons.push('0 tracks found despite Assetto Corsa being detected');
      if (carsRegressed && !carsImpossiblyEmpty)
        reasons.push(`cars dropped ${previousCarCount} -> ${content.cars.length}`);
      if (tracksRegressed && !tracksImpossiblyEmpty)
        reasons.push(`tracks dropped ${previousTrackCount} -> ${content.tracks.length}`);

      this.lastScanWarning = `Content scan anomaly at ${acPath}: ${reasons.join('; ')}`;
      this.logger.error(
        {
          previousCarCount,
          carCount: content.cars.length,
          previousTrackCount,
          trackCount: content.tracks.length,
          acPath,
          reasons,
        },
        'Content scan anomaly detected',
      );
    }

    const carsWithoutPreview = content.cars.filter((c) => !c.preview).map((c) => c.acId);
    const tracksWithoutPreview = content.tracks.filter((t) => !t.preview).map((t) => t.acId);

    this.logger.info(
      {
        cars: content.cars.length,
        tracks: content.tracks.length,
        carsWithPreview: content.cars.length - carsWithoutPreview.length,
        tracksWithPreview: content.tracks.length - tracksWithoutPreview.length,
        carsWithoutPreview: carsWithoutPreview.slice(0, 10),
        tracksWithoutPreview: tracksWithoutPreview.slice(0, 10),
        acPath,
      },
      'Assetto Corsa content scanned',
    );
    return content;
  }

  private async getCarPreviewPaths(carDir: string): Promise<string[]> {
    const paths: string[] = [
      ...PREVIEW_NAMES.map((n) => path.join(carDir, n)),
      ...PREVIEW_NAMES.map((n) => path.join(carDir, 'ui', n)),
    ];
    const skinsDir = path.join(carDir, 'skins');
    try {
      const skins = await fs.readdir(skinsDir);
      for (const skin of skins) {
        for (const name of PREVIEW_NAMES) {
          paths.push(path.join(skinsDir, skin, name));
        }
      }
    } catch {
      // ignore
    }
    return paths;
  }

  private async getCandidatePaths(): Promise<string[]> {
    const candidates: string[] = [];
    if (config.AC_PATH) {
      candidates.push(config.AC_PATH);
    }
    if (process.platform !== 'win32') {
      return candidates;
    }

    const steamDirs = new Set<string>();

    // The registry is the one place Steam itself always records where it
    // was installed — a guessed list of folder names can never cover every
    // possible custom install location (a user can point Steam's installer
    // anywhere), but this registry key is written by Steam on every install
    // regardless of where that is.
    const registrySteamDir = await this.getSteamInstallPathFromRegistry();
    if (registrySteamDir) {
      steamDirs.add(registrySteamDir);
    }

    const programFiles = process.env.ProgramFiles;
    const programFilesX86 = process.env['ProgramFiles(x86)'];
    const steamPrefixes = [
      programFiles,
      programFilesX86,
      'C:\\Program Files',
      'C:\\Program Files (x86)',
      'C:\\Steam',
    ].filter((p): p is string => !!p);

    for (const prefix of steamPrefixes) {
      steamDirs.add(path.join(prefix, 'Steam'));
    }

    const seen = new Set<string>();
    const addCandidate = (base: string) => {
      const candidate = path.join(base, 'steamapps', 'common', 'assettocorsa');
      if (!seen.has(candidate)) {
        seen.add(candidate);
        candidates.push(candidate);
      }
    };

    for (const steamDir of steamDirs) {
      addCandidate(steamDir);
      // A Steam install only covers the *primary* library — a game
      // installed to a secondary library on another drive (extremely
      // common: users move large game libraries off the OS drive) lives
      // outside `<Steam>\steamapps\common`, so a perfectly valid,
      // correctly-installed-via-Steam copy of AC was silently invisible
      // to this scan. Every additional library Steam knows about is
      // declared in steamapps/libraryfolders.vdf next to the Steam
      // install itself — read it and probe each one too.
      for (const library of await this.readSteamLibraryFolders(steamDir)) {
        addCandidate(library);
      }
    }

    return candidates;
  }

  /** Reads Steam's own install path out of the Windows registry — checks
   * both the per-user key (written by the standard installer) and the
   * machine-wide 32-bit-view key (used by some all-users installs), since
   * either can be the one actually populated depending on how Steam was
   * originally set up on a given PC. */
  private async getSteamInstallPathFromRegistry(): Promise<string | undefined> {
    const queries: [string, string][] = [
      ['HKCU\\SOFTWARE\\Valve\\Steam', 'SteamPath'],
      ['HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'],
      ['HKLM\\SOFTWARE\\Valve\\Steam', 'InstallPath'],
    ];
    for (const [key, valueName] of queries) {
      try {
        const { stdout } = await execFileAsync('reg', ['query', key, '/v', valueName], {
          timeout: 5000,
        });
        const match = stdout.match(new RegExp(`${valueName}\\s+REG_SZ\\s+(.+)`));
        const value = match?.[1]?.trim();
        if (value) {
          return value;
        }
      } catch (err) {
        this.logger.debug(
          { key, valueName, err: err instanceof Error ? err.message : String(err) },
          'Steam registry key not found',
        );
      }
    }
    return undefined;
  }

  /** Parses the `"path"  "..."` entries out of Steam's libraryfolders.vdf.
   * This is a minimal regex extraction rather than a full VDF parser —
   * the file's only content we need is these path values, and a full
   * parser would be a lot of code for a format we don't otherwise touch. */
  private async readSteamLibraryFolders(steamDir: string): Promise<string[]> {
    const vdfPath = path.join(steamDir, 'steamapps', 'libraryfolders.vdf');
    try {
      const raw = await fs.readFile(vdfPath, 'utf-8');
      const paths: string[] = [];
      const regex = /"path"\s*"((?:[^"\\]|\\.)*)"/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(raw))) {
        paths.push(match[1].replace(/\\\\/g, '\\'));
      }
      return paths;
    } catch {
      return [];
    }
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

    for (const candidate of await this.getCandidatePaths()) {
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
