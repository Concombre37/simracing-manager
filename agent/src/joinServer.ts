import fs from 'fs-extra';
import path from 'path';
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
          const p = m.replace(/\\\"/g, '"').match(/\"path\"\s+\"(.+?)\"/);
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

function buildRaceIni(cfg: JoinServerConfig): string {
  const password = cfg.password || '';
  const skin = cfg.skin || 'random';
  const car = cfg.carAcId;
  return `[HEADER]
VERSION=1
TYPE=RACE

[RACE]
CARS=1
MODEL=${car}
MODEL_CONFIG=
SKIN=${skin}
TRACK=rand
CONFIG_TRACK=rand
PENALTIES=0
RACE_LAPS=0

[CAR_0]
MODEL=${car}
MODEL_CONFIG=
SKIN=${skin}
DRIVERNAME=
TEAM=
GUID=
SPAWN_POINT=1

[REMOTE]
ACTIVE=1
SERVER_IP=${cfg.serverIp}
SERVER_PORT=${cfg.serverPort}
SERVER_HTTP_PORT=${cfg.serverHttpPort || 8081}
SERVER_NAME=${cfg.serverName || 'Serveur SimCenter'}
PASSWORD=${password}
REQUESTED_CAR=${car}
NAME=
TEAM=
GUID=
__CM_EXTENDED=0

[AUTOSPAWN]
ACTIVE=1

[SESSION_0]
NAME=Practice
TYPE=1
DURATION_MINUTES=0
SPAWN_SET=PIT
`;
}

function buildCmUri(cfg: JoinServerConfig): string {
  const params = new URLSearchParams();
  params.set('ip', cfg.serverIp);
  params.set('port', String(cfg.serverPort));
  params.set('httpPort', String(cfg.serverHttpPort || 8081));
  params.set('car', cfg.carAcId);
  if (cfg.skin && cfg.skin !== 'random') {
    params.set('skin', cfg.skin);
  }
  if (cfg.password) params.set('plainPassword', cfg.password);
  // Permet de lancer sans Steam ID (si Steam n'est pas intégré)
  params.set('allowWithoutSteamId', '1');
  return `acmanager://race/online?${params.toString()}`;
}

export async function joinServer(cfg: JoinServerConfig): Promise<void> {
  const raceIniPath = path.join(config.documentsPath, 'Assetto Corsa', 'cfg', 'race.ini');
  const logPath = path.join(config.documentsPath, 'Assetto Corsa', 'logs', 'spawn.log');
  await fs.ensureDir(path.dirname(raceIniPath));
  await fs.ensureDir(path.dirname(logPath));
  await fs.writeFile(raceIniPath, buildRaceIni(cfg), 'utf-8');

  const isWindows = process.platform === 'win32';
  const cmExe = findContentManagerExe();

  if (cmExe) {
    // Lancement via le protocole interne de Content Manager.
    const uri = buildCmUri(cfg);
    console.log(`[joinServer] Lancement via Content Manager : ${uri}`);
    try {
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] CM URI: ${uri}\n`);
    } catch {}

    const cmDir = path.dirname(cmExe);
    if (isWindows) {
      // Lancement direct de Content Manager.exe avec l'URI en argument et le bon
      // répertoire de travail. rundll32 utilisait System32 comme cwd ce qui pouvait
      // provoquer des erreurs de chargement de DLLs (0xc000007b) lorsque CM
      // démarre ensuite acs.exe.
      const child = spawn(cmExe, [uri], {
        cwd: cmDir,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      child.unref();
    } else {
      const child = spawn('xdg-open', [uri], { detached: true, stdio: 'ignore' });
      child.unref();
    }
    return;
  }

  // Fallback : AssettoCorsa.exe ou acs.exe avec /spawn
  let exe = findExecutable('AssettoCorsa.exe') || findExecutable('acs.exe');
  if (!exe) {
    throw new Error(`Impossible de trouver AssettoCorsa.exe, acs.exe ou Content Manager pour lancer AC`);
  }

  const workingDir = path.dirname(exe);
  if (isWindows) {
    const psCmd = `Start-Process -FilePath '${exe.replace(/'/g, "''")}' -ArgumentList '/spawn' -WorkingDirectory '${workingDir.replace(/'/g, "''")}' -WindowStyle Normal`;
    const child = spawn('powershell.exe', ['-NoProfile', '-Command', psCmd], {
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: false,
    });

    let stderr = '';
    child.stderr?.on('data', (data) => { stderr += data.toString(); });
    child.on('exit', (code) => {
      try {
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] PowerShell exit code: ${code}\nstderr: ${stderr}\n`);
      } catch {}
    });
    child.unref();
  } else {
    const child = spawn(exe, ['/spawn'], { detached: true, stdio: 'ignore', cwd: workingDir });
    child.unref();
  }

  console.log(`[joinServer] Lancement de ${exe} /spawn pour rejoindre ${cfg.serverIp}:${cfg.serverPort}`);
}
