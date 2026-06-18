import { promises as fs, readFileSync } from 'fs';
import path from 'path';
import { Logger } from 'pino';
import { config } from './config';

function getSteamLibraries(): string[] {
  const libs: string[] = [];
  const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  for (const letter of letters) {
    libs.push(`${letter}:\\Steam`);
    libs.push(`${letter}:\\Program Files (x86)\\Steam`);
    libs.push(`${letter}:\\Program Files\\Steam`);
  }

  const vdf = path.join('C:', 'Program Files (x86)', 'Steam', 'steamapps', 'libraryfolders.vdf');
  try {
    const data = readFileSync(vdf, 'utf-8');
    const matches = data.match(/"path"\s+"(.+?)"/g);
    if (matches) {
      for (const m of matches) {
        const p = m.replace(/\\"/g, '"').match(/"path"\s+"(.+?)"/);
        if (p && p[1] && !libs.includes(p[1])) libs.push(p[1]);
      }
    }
  } catch {
    // ignore
  }

  return libs;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function findContentManagerExe(logger?: Logger): Promise<string | undefined> {
  const tried: string[] = [];

  const check = async (filePath: string): Promise<string | undefined> => {
    tried.push(filePath);
    if (await pathExists(filePath)) return filePath;
    return undefined;
  };

  // Explicitly configured folder or file.
  if (config.CM_PATH) {
    const direct = config.CM_PATH.toLowerCase().endsWith('.exe')
      ? config.CM_PATH
      : path.join(config.CM_PATH, 'Content Manager.exe');
    const found = await check(direct);
    if (found) {
      logger?.debug({ cmExe: found }, 'Found Content Manager from CM_PATH');
      return found;
    }
  }

  // Common install locations.
  const defaultPaths = [
    path.join(process.env.LOCALAPPDATA ?? '', 'AcTools Content Manager', 'Content Manager.exe'),
    path.join(process.env.PROGRAMFILES ?? '', 'AcTools Content Manager', 'Content Manager.exe'),
    path.join(
      process.env['PROGRAMFILES(X86)'] ?? '',
      'AcTools Content Manager',
      'Content Manager.exe',
    ),
  ];

  for (const p of defaultPaths) {
    const found = await check(p);
    if (found) {
      logger?.debug({ cmExe: found }, 'Found Content Manager in default path');
      return found;
    }
  }

  // Steam libraries / Assetto Corsa folder.
  const libraries = getSteamLibraries();
  for (const lib of libraries) {
    const dir = path.join(lib, 'steamapps', 'common', 'Assetto Corsa');
    if (!(await pathExists(dir))) continue;
    try {
      const entries = await fs.readdir(dir);
      const foundEntry = entries.find(
        (e) => /^Content Manager(\.exe|\s.*\.exe)$/i.test(e) || /^ContentManager\.exe$/i.test(e),
      );
      if (foundEntry) {
        const full = path.join(dir, foundEntry);
        tried.push(full);
        logger?.debug({ cmExe: full }, 'Found Content Manager in AC folder');
        return full;
      }
    } catch {
      // ignore
    }
  }

  logger?.warn({ tried }, 'Content Manager not found in any known location');
  return undefined;
}

export function normalizeCmPath(input: string): string {
  const trimmed = input.trim().replace(/^["']|["']$/g, '');
  if (trimmed.toLowerCase().endsWith('.exe')) return trimmed;
  return path.join(trimmed, 'Content Manager.exe');
}
