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
  track?: string;
  trackLayout?: string;
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
  const skin = cfg.skin || '';
  const car = cfg.carAcId;
  const track = cfg.track || 'ks_nordschleife';
  const trackLayout = cfg.trackLayout || '';
  return `[HEADER]
VERSION=2
TYPE=RACE

[RACE]
CARS=1
AI_LEVEL=100
MODEL=${car}
MODEL_CONFIG=
SKIN=${skin}
TRACK=${track}
CONFIG_TRACK=${trackLayout}
PENALTIES=0
RACE_LAPS=0
DRIFT_MODE=0
FIXED_SETUP=0
JUMP_START_PENALTY=0

[CAR_0]
MODEL=${car}
MODEL_CONFIG=
SKIN=${skin}
DRIVERNAME=
TEAM=
GUID=
SETUP=
BALLAST=0
RESTRICTOR=0
SPECTATOR_MODE=0
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

[TEMPERATURE]
AMBIENT=20
ROAD=20

[WEATHER]
NAME=3_clear

[WIND]
DIRECTION_DEG=0
SPEED_KMH_MIN=0
SPEED_KMH_MAX=0

[LIGHTING]
SUN_ANGLE=-48
TIME_MULT=1
CLOUD_SPEED=0.2
`;
}

function buildCmOnlineJoinUri(cfg: JoinServerConfig): string {
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

  // Protocole LAN : ouvre la page d'information du serveur local.
  return `acmanager://race/online/join?${params.toString()}`;
}

function buildCmOnlineUri(cfg: JoinServerConfig): string {
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

  // Protocole en ligne / lobby : tente de rejoindre directement le serveur.
  // Fonctionne si le serveur est joignable a cette IP ou enregistre au lobby.
  return `acmanager://race/online?${params.toString()}`;
}

function buildCmConfigUri(cfg: JoinServerConfig): string {
  // Passe un race.ini complet a Content Manager via le protocole race/config.
  // Cela permet de lancer directement AC avec la voiture choisie, sans passer
  // par la page d'information serveur.
  const raceIni = buildRaceIni(cfg);
  const encoded = Buffer.from(raceIni, 'utf-8').toString('base64');
  const params = new URLSearchParams({ config: encoded });
  return `acmanager://race/config?${params.toString()}`;
}

function buildCmUri(cfg: JoinServerConfig): string {
  switch (config.cmUriMode) {
    case 'config':
      return buildCmConfigUri(cfg);
    case 'join':
      return buildCmOnlineJoinUri(cfg);
    case 'online':
    default:
      return buildCmOnlineUri(cfg);
  }
}

function scheduleDriveKeyPress(logPath: string): void {
  const psPath = path.join(config.documentsPath, 'Assetto Corsa', 'logs', 'press_drive_key.ps1');
  const psContent = `function Write-Log($msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
  Add-Content -Path "${logPath}" -Value $line -ErrorAction SilentlyContinue
}

# Methode 1 : UI Automation pour cliquer sur le bouton Drive/Join de CM
function Click-DriveButton {
  try {
    Add-Type -AssemblyName UIAutomationClient -ErrorAction Stop
    $ui = [System.Windows.Automation.AutomationElement]
    $desktop = $ui::RootElement
    $cond = [System.Windows.Automation.ControlTypeCondition]::FromControlType([System.Windows.Automation.ControlType]::Button)
    $timeout = 120
    for ($i = 0; $i -lt $timeout; $i++) {
      $buttons = $desktop.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
      for ($j = 0; $j -lt $buttons.Count; $j++) {
        $b = $buttons[$j]
        $name = $b.Current.Name
        if ($name -eq "Drive" -or $name -eq "JOIN" -or $name -eq "Join") {
          Write-Log "Bouton trouve : '$name', attente 5 secondes avant clic"
          Start-Sleep -Seconds 5
          $pattern = $b.GetCurrentPattern([System.Windows.Automation.PatternIdentifiers]::InvokePattern)
          $pattern.Invoke()
          Write-Log "Bouton '$name' clique"
          return $true
        }
      }
      Start-Sleep -Seconds 1
    }
  } catch {
    Write-Log "UI Automation indisponible ou erreur : $_"
  }
  return $false
}

# Methode 2 : clic souris au centre de l'ecran + appui clavier
function Click-And-Press-OnAc {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinAPI {
  [DllImport("user32.dll")]
  public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
  Add-Type -AssemblyName System.Windows.Forms
  Write-Log "Attente de la fenetre Assetto Corsa..."
  $hwnd = 0
  $timeout = 90
  for ($i = 0; $i -lt $timeout; $i++) {
    $hwnd = [WinAPI]::FindWindow($null, "Assetto Corsa")
    if ($hwnd -ne 0) { break }
    Start-Sleep -Seconds 1
  }
  if ($hwnd -eq 0) {
    Write-Log "Fenetre Assetto Corsa non trouvee"
    return
  }
  Write-Log "Fenetre AC trouvee, attente 25 secondes de chargement..."
  Start-Sleep -Seconds 25
  [WinAPI]::ShowWindow($hwnd, 1) | Out-Null
  [WinAPI]::SetForegroundWindow($hwnd) | Out-Null
  Start-Sleep -Milliseconds 500

  $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $cx = [int]($screen.Width / 2)
  $cy = [int]($screen.Height / 2)
  Write-Log "Clic au centre de l'ecran : $cx,$cy"
  [WinAPI]::SetCursorPos($cx, $cy) | Out-Null
  Start-Sleep -Milliseconds 200
  [WinAPI]::mouse_event(0x0002, 0, 0, 0, 0) # LEFT DOWN
  Start-Sleep -Milliseconds 150
  [WinAPI]::mouse_event(0x0004, 0, 0, 0, 0) # LEFT UP
  Start-Sleep -Seconds 2

  $VK_SPACE = 0x20
  Write-Log "Envoi Espace (keybd_event)"
  for ($j = 0; $j -lt 5; $j++) {
    [WinAPI]::keybd_event($VK_SPACE, 0, 0, 0)
    Start-Sleep -Milliseconds 150
    [WinAPI]::keybd_event($VK_SPACE, 0, 2, 0)
    Start-Sleep -Seconds 2
  }
  Write-Log "Sequence clavier/souris envoyee"
}

Write-Log "Demarrage de l'automatisation Drive..."
if (-not (Click-DriveButton)) {
  Click-And-Press-OnAc
}
`;
  try {
    fs.writeFileSync(psPath, psContent, 'utf-8');
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  } catch (err: any) {
    console.warn('[joinServer] Impossible de planifier l appui touche:', err.message);
  }
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

      // AC affiche parfois un ecran "appuyez sur une touche pour conduire" apres
      // le chargement. On lance un script PowerShell qui attend la fenetre AC et
      // envoie un appui sur Espace pour passer cet ecran automatiquement.
      scheduleDriveKeyPress(logPath);
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
