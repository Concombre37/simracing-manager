import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { config } from './config';

export interface JoinServerConfig {
  serverIp: string;
  serverPort: number;
  serverHttpPort?: number;
  serverName?: string;
  carAcId: string;
  password?: string;
  skin?: string;
}

function getSteamLibraries(): string[] {
  const libs: string[] = [];
  const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  for (const letter of letters) {
    libs.push(`${letter}:\\Steam`);
    libs.push(`${letter}:\\Program Files (x86)\\Steam`);
    libs.push(`${letter}:\\Program Files\\Steam`);
  }
  try {
    const vdf = path.join('C:', 'Program Files (x86)', 'Steam', 'steamapps', 'libraryfolders.vdf');
    if (fs.existsSync(vdf)) {
      const content = fs.readFileSync(vdf, 'utf-8');
      const matches = content.match(/\"path\"\s+\"(.+?)\"/g);
      if (matches) {
        for (const m of matches) {
          const p = m.replace(/\\"/g, '"').match(/\"path\"\s+\"(.+?)\"/);
          if (p && p[1] && !libs.includes(p[1])) libs.push(p[1]);
        }
      }
    }
  } catch {}
  return libs;
}

function findExecutable(name: string): string | null {
  if (process.platform !== 'win32') return null;

  const libraries = getSteamLibraries();
  for (const lib of libraries) {
    const exe = path.join(lib, 'steamapps', 'common', 'assettocorsa', name);
    if (fs.existsSync(exe)) return exe;
  }

  const defaultPath = path.join('C:', 'Program Files (x86)', 'Steam', 'steamapps', 'common', 'assettocorsa', name);
  if (fs.existsSync(defaultPath)) return defaultPath;

  return null;
}

function findContentManagerExe(): string | null {
  if (process.platform !== 'win32') return null;

  const cmPath = config.cmPath;
  const cmExe = path.join(cmPath, config.cmExecutable || 'Content Manager.exe');
  if (fs.existsSync(cmExe)) return cmExe;

  const libraries = getSteamLibraries();
  for (const lib of libraries) {
    const dir = path.join(lib, 'steamapps', 'common', 'Assetto Corsa');
    if (fs.existsSync(dir)) {
      try {
        const entries = fs.readdirSync(dir);
        const found = entries.find((e) => /^Content Manager\s*.+\.exe$/i.test(e));
        if (found) return path.join(dir, found);
      } catch {}
    }
  }

  return null;
}

export async function joinServer(cfg: JoinServerConfig): Promise<void> {
  const raceIniPath = path.join(config.documentsPath, 'Assetto Corsa', 'cfg', 'race.ini');
  await fs.ensureDir(path.dirname(raceIniPath));

  const raceIni = `[HEADER]
VERSION=1
TYPE=RACE

[REMOTE]
ACTIVE=1
SERVER_IP=${cfg.serverIp}
SERVER_PORT=${cfg.serverPort}
SERVER_HTTP_PORT=${cfg.serverHttpPort || 8081}
SERVER_NAME=${cfg.serverName || 'Serveur SimCenter'}
PASSWORD=${cfg.password || ''}
REQUESTED_CAR=${cfg.carAcId}
TEAM=
GUID=
__CM_EXTENDED=0

MODEL=${cfg.carAcId}
MODEL_CONFIG=
SKIN=${cfg.skin || 'random'}
PENALTIES=0
RACE_LAPS=0
`;

  await fs.writeFile(raceIniPath, raceIni, 'utf-8');

  // Méthode fiable : acs.exe /spawn lit race.ini et rejoint le serveur.
  let exe = findExecutable('acs.exe');
  let args: string[] = ['/spawn'];

  if (!exe) {
    exe = findContentManagerExe();
    args = [];
  }

  if (!exe) {
    throw new Error(`Impossible de trouver acs.exe ou Content Manager pour lancer AC`);
  }

  const child = spawn(exe, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();

  console.log(`[joinServer] Lancement de ${exe} ${args.join(' ')} pour rejoindre ${cfg.serverIp}:${cfg.serverPort}`);
}
