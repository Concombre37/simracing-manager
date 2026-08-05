import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Logger } from 'pino';
import { config } from './config';

const execFileAsync = promisify(execFile);

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Reads Steam's own install path out of the Windows registry — checks
 * both the per-user key (written by the standard installer) and the
 * machine-wide 32-bit-view key (used by some all-users installs), since
 * either can be the one actually populated depending on how Steam was
 * originally set up on a given PC. */
async function getSteamInstallPathFromRegistry(logger: Logger): Promise<string | undefined> {
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
      logger.debug(
        { key, valueName, err: err instanceof Error ? err.message : String(err) },
        'Steam registry key not found',
      );
    }
  }
  return undefined;
}

/** Parses the `"path"  "..."` entries out of Steam's libraryfolders.vdf.
 * This is a minimal regex extraction rather than a full VDF parser — the
 * file's only content we need is these path values, and a full parser
 * would be a lot of code for a format we don't otherwise touch. */
async function readSteamLibraryFolders(steamDir: string): Promise<string[]> {
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

/**
 * Every plausible Assetto Corsa install directory this agent knows how to
 * find, most-likely-correct first: a configured AC_PATH, then Steam's own
 * registered install location (registry — always accurate regardless of
 * where the user pointed the Steam installer), then a handful of guessed
 * default locations, and finally every additional Steam library folder
 * declared next to each Steam install found (covers AC installed on a
 * secondary drive, extremely common for large game libraries).
 *
 * This is the single source of truth for "where might AC be" — content
 * scanning, dedicated server launching, the game client launcher, and the
 * one-time startup resolution that seeds config.AC_PATH all need the exact
 * same answer. They used to each guess independently (the game-client
 * launcher didn't even guess, just one hardcoded fallback path), which is
 * how a perfectly valid AC install on a secondary Steam library could scan
 * its content successfully while every other feature that needs AC still
 * failed to find it — confirmed live: content sync found 214 cars on
 * `D:\SteamLibrary\...` while the dedicated server launcher, using its own
 * stale copy of this logic, failed with "Assetto Corsa non trouvé" for the
 * exact same install.
 */
export async function getAcCandidatePaths(logger: Logger): Promise<string[]> {
  const candidates: string[] = [];
  if (config.AC_PATH) {
    candidates.push(config.AC_PATH);
  }
  if (process.platform !== 'win32') {
    return candidates;
  }

  const steamDirs = new Set<string>();

  const registrySteamDir = await getSteamInstallPathFromRegistry(logger);
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
    for (const library of await readSteamLibraryFolders(steamDir)) {
      addCandidate(library);
    }
  }

  return candidates;
}

/**
 * Resolves the Assetto Corsa install directory by trying every candidate
 * from `getAcCandidatePaths()` in order, returning the first one that
 * actually contains `markerRelativePath`. Different callers care about
 * different parts of the install being present — the content scanner
 * needs `content/cars`, the dedicated server launcher needs
 * `server/acServer.exe`, the game client launcher needs `acs.exe` — so a
 * single shared "is this candidate valid" check isn't possible; the marker
 * is the caller's responsibility.
 */
export async function resolveAcInstallPath(
  logger: Logger,
  markerRelativePath: string,
): Promise<string | undefined> {
  for (const candidate of await getAcCandidatePaths(logger)) {
    if (await pathExists(path.join(candidate, markerRelativePath))) {
      return candidate;
    }
  }
  return undefined;
}
