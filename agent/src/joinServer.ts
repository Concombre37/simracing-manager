import fs from 'fs-extra';
import path from 'path';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { config } from './config';

const execAsync = promisify(exec);

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

function findSteamExe(): string | null {
  if (process.platform !== 'win32') {
    return null;
  }
  const candidates = [
    path.join('C:', 'Program Files (x86)', 'Steam', 'steam.exe'),
    path.join('C:', 'Program Files', 'Steam', 'steam.exe'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

async function isSteamRunning(): Promise<boolean> {
  if (process.platform !== 'win32') {
    try {
      await execAsync('pgrep -x steam');
      return true;
    } catch {
      return false;
    }
  }
  try {
    const { stdout } = await execAsync('powershell.exe -NoProfile -Command "Get-Process steam -ErrorAction SilentlyContinue | Select-Object -First 1"');
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function ensureSteamRunning(logPath: string): Promise<void> {
  if (await isSteamRunning()) {
    console.log('[joinServer] Steam est déjà en cours d\'exécution');
    return;
  }
  const steamExe = findSteamExe();
  if (!steamExe) {
    console.warn('[joinServer] Steam.exe non trouvé, impossible de le démarrer automatiquement');
    return;
  }
  console.log(`[joinServer] Démarrage de Steam : ${steamExe}`);
  try {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] Démarrage de Steam : ${steamExe}\n`);
  } catch {}
  const child = spawn(steamExe, [], {
    cwd: path.dirname(steamExe),
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
  // Attendre que Steam s'initialise avant de lancer Content Manager.
  await new Promise((resolve) => setTimeout(resolve, 8000));
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

  // Par défaut, laisse Content Manager utiliser Steam. Si Steam n'est pas
  // disponible/intégré, activer CM_ALLOW_WITHOUT_STEAM_ID=1 dans le .env.
  if (config.cmAllowWithoutSteamId) {
    params.set('allowWithoutSteamId', '1');
  }

  // Les serveurs SimCenter tournent en LAN sans REGISTER_TO_LOBBY. Le protocole
  // "race/online" (lobby) provoque un "handshake failed" car CM tente de
  // contacter le serveur via le lobby. Le protocole "race/online/join" est
  // prévu pour les serveurs LAN / invitation directe.
  return `acmanager://race/online/join?${params.toString()}`;
}

export async function joinServer(cfg: JoinServerConfig): Promise<void> {
  const raceIniPath = path.join(config.documentsPath, 'Assetto Corsa', 'cfg', 'race.ini');
  const logPath = path.join(config.documentsPath, 'Assetto Corsa', 'logs', 'spawn.log');
  await fs.ensureDir(path.dirname(raceIniPath));
  await fs.ensureDir(path.dirname(logPath));
  await fs.writeFile(raceIniPath, buildRaceIni(cfg), 'utf-8');

  const isWindows = process.platform === 'win32';
  const cmExe = findContentManagerExe();

  if (config.launchMode === 'cm' && cmExe) {
    // Steam est requis pour le handshake AC. On s'assure qu'il est lancé
    // avant de demander à Content Manager de rejoindre le serveur, sauf si
    // l'admin a explicitement désactivé l'utilisation de Steam.
    if (!config.cmAllowWithoutSteamId) {
      await ensureSteamRunning(logPath);
    }

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
