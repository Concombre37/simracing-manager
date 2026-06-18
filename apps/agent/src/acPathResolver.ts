import { promises as fs } from 'fs';
import path from 'path';
import { config } from './config';

function getCandidatePaths(): string[] {
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

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveAcPath(): Promise<string | undefined> {
  for (const candidate of getCandidatePaths()) {
    if (await pathExists(path.join(candidate, 'content', 'cars'))) {
      return candidate;
    }
  }
  return undefined;
}
