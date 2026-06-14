import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export interface AcServerInfo {
  pid: number;
  name: string;
  track?: string;
  trackLayout?: string;
  cars: string[];
  maxClients?: number;
  playerCount: number;
  hasPassword?: boolean;
  serverDir: string;
  executablePath: string;
}

interface ProcessInfo {
  pid: number;
  commandLine?: string;
  executablePath?: string;
}

const AC_SERVER_EXE_NAMES = ['acServer.exe', 'ACServer.exe', 'acserver.exe'];

export async function findAcServerProcesses(): Promise<ProcessInfo[]> {
  // 1. Recherche par nom exact
  for (const exeName of AC_SERVER_EXE_NAMES) {
    const processes = await findProcessesByName(exeName);
    if (processes.length > 0) {
      console.log(`[acServer] ${processes.length} processus trouvé(s) avec le nom ${exeName}`);
      return processes;
    }
  }

  // 2. Fallback : scan tous les processus et cherche ceux liés à Assetto Corsa serveur
  console.log('[acServer] Aucun nom exact trouvé, scan étendu de tous les processus...');
  const allProcesses = await findAllProcesses();
  const candidates = allProcesses.filter(
    (p) =>
      (p.executablePath && /acserver|ac_server|assettocorsa[\\/]server/i.test(p.executablePath)) ||
      (p.commandLine && /acserver|ac_server|server_cfg\.ini|entry_list\.ini/i.test(p.commandLine))
  );

  if (candidates.length > 0) {
    console.log(`[acServer] ${candidates.length} candidat(s) trouvé(s) par scan étendu`);
    return candidates;
  }

  console.log('[acServer] Aucun processus acServer.exe détecté');
  return [];
}

async function findAllProcesses(): Promise<ProcessInfo[]> {
  const psCmd =
    'powershell -Command "Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine,ExecutablePath,Name | ConvertTo-Csv -NoTypeInformation"';
  try {
    const { stdout } = await execAsync(psCmd, { timeout: 15000 });
    return parseProcessCsv(stdout);
  } catch (err) {
    console.error('[acServer] Échec du scan étendu:', err);
    return [];
  }
}

async function findProcessesByName(exeName: string): Promise<ProcessInfo[]> {
  const psCmd =
    `powershell -Command "Get-CimInstance Win32_Process -Filter \\\"Name='${exeName}'\\\" | Select-Object ProcessId,CommandLine,ExecutablePath | ConvertTo-Csv -NoTypeInformation"`;
  try {
    console.log(`[acServer] Recherche PowerShell: ${exeName}`);
    const { stdout } = await execAsync(psCmd, { timeout: 10000 });
    console.log(`[acServer] Sortie PowerShell brute:\n${stdout}`);
    return parseProcessCsv(stdout);
  } catch (err) {
    console.warn(`[acServer] PowerShell a échoué pour ${exeName}, fallback wmic`);
    try {
      const { stdout } = await execAsync(
        `wmic process where "name='${exeName}'" get ProcessId,CommandLine,ExecutablePath /FORMAT:CSV`,
        { timeout: 10000 }
      );
      console.log(`[acServer] Sortie WMIC brute:\n${stdout}`);
      return parseProcessCsv(stdout);
    } catch (fallbackErr) {
      console.error(`[acServer] Impossible de lister les processus ${exeName}:`, fallbackErr);
      return [];
    }
  }
}

function parseProcessCsv(csv: string): ProcessInfo[] {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const header = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const pidIdx = header.findIndex((h) => h === 'ProcessId');
  const cmdIdx = header.findIndex((h) => h === 'CommandLine');
  const exeIdx = header.findIndex((h) => h === 'ExecutablePath');

  const processes: ProcessInfo[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const pid = parseInt(cols[pidIdx] || '0', 10);
    if (!pid) continue;
    processes.push({
      pid,
      commandLine: cols[cmdIdx],
      executablePath: cols[exeIdx],
    });
  }
  return processes;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((s) => s.trim());
}

function parseCommandLineArgs(commandLine?: string): Record<string, string> {
  const args: Record<string, string> = {};
  if (!commandLine) return args;

  // Extrait les arguments style -c value, -c "value", --config=value
  const regex = /(?:^|\s)-(-?)(\w+)(?:\s+|=)("[^"]*"|\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(commandLine)) !== null) {
    const key = match[2].toLowerCase();
    const value = match[3].replace(/^"|"$/g, '');
    args[key] = value;
  }
  return args;
}

function resolveServerDir(proc: ProcessInfo): string | undefined {
  console.log(`[acServer] Résolution dossier pour PID ${proc.pid}`);
  console.log(`  CommandLine: ${proc.commandLine || 'non disponible'}`);
  console.log(`  ExecutablePath: ${proc.executablePath || 'non disponible'}`);

  // 1. Cherche -c server_cfg.ini ou -e entry_list.ini dans la ligne de commande
  if (proc.commandLine) {
    const args = parseCommandLineArgs(proc.commandLine);
    console.log(`  Args parsés:`, args);

    for (const key of ['c', 'e', 'cfg', 'config']) {
      const filePath = args[key];
      if (filePath) {
        const resolved = path.resolve(filePath);
        console.log(`  Chemin candidat depuis -${key}: ${resolved}`);
        if (fs.pathExistsSync(resolved)) {
          const dir = path.dirname(resolved);
          console.log(`  Dossier serveur trouvé (ligne de commande): ${dir}`);
          return dir;
        }
      }
    }
  }

  // 2. Utiliser le répertoire de l'exécutable si server_cfg.ini existe
  if (proc.executablePath) {
    const dir = path.dirname(proc.executablePath);
    console.log(`  Vérification dossier exécutable: ${dir}`);
    if (fs.pathExistsSync(path.join(dir, 'server_cfg.ini'))) {
      console.log(`  Dossier serveur trouvé (exécutable): ${dir}`);
      return dir;
    }
  }

  console.warn(`[acServer] Impossible de trouver le dossier serveur pour PID ${proc.pid}`);
  return undefined;
}

function parseIniFile(filePath: string): Record<string, Record<string, string>> {
  if (!fs.pathExistsSync(filePath)) {
    console.log(`[acServer] Fichier non trouvé: ${filePath}`);
    return {};
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const sections: Record<string, Record<string, string>> = {};
  let currentSection = '';
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.split(';')[0].trim();
    if (!line) continue;
    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      sections[currentSection] = sections[currentSection] || {};
      continue;
    }
    const kvMatch = line.match(/^([^=]+)=(.*)$/);
    if (kvMatch && currentSection) {
      const key = kvMatch[1].trim();
      const value = kvMatch[2].trim();
      sections[currentSection][key] = value;
    }
  }
  return sections;
}

function parseEntryListCars(serverDir: string): string[] {
  const filePath = path.join(serverDir, 'entry_list.ini');
  const sections = parseIniFile(filePath);
  const cars = new Set<string>();
  for (const [section, values] of Object.entries(sections)) {
    if (section.toUpperCase().startsWith('CAR_')) {
      const model = values.MODEL || values.model;
      if (model) cars.add(model);
    }
  }
  return Array.from(cars);
}

function countPlayersInLog(serverDir: string): number {
  const logPath = path.join(serverDir, 'log.txt');
  if (!fs.pathExistsSync(logPath)) {
    console.log(`[acServer] log.txt non trouvé: ${logPath}`);
    return 0;
  }

  try {
    const content = fs.readFileSync(logPath, 'utf-8');
    let newConnections = 0;
    let disconnections = 0;
    for (const line of content.split(/\r?\n/)) {
      const lower = line.toLowerCase();
      if (lower.includes('new connection')) newConnections++;
      if (lower.includes('disconnected') || lower.includes('connection lost')) disconnections++;
    }
    const count = Math.max(0, newConnections - disconnections);
    console.log(`[acServer] Joueurs dans log.txt: ${count} (connexions=${newConnections}, déco=${disconnections})`);
    return count;
  } catch (err) {
    console.error('[acServer] Erreur lecture log serveur:', err);
    return 0;
  }
}

export async function getLocalAcServers(): Promise<AcServerInfo[]> {
  const processes = await findAcServerProcesses();
  const servers: AcServerInfo[] = [];

  for (const proc of processes) {
    const serverDir = resolveServerDir(proc);
    if (!serverDir) continue;

    const cfgPath = path.join(serverDir, 'server_cfg.ini');
    console.log(`[acServer] Parsing config: ${cfgPath}`);
    const cfg = parseIniFile(cfgPath);
    const serverSection = cfg.SERVER || cfg.Server || cfg.server || {};

    const name = serverSection.NAME || serverSection.name || `Serveur ${proc.pid}`;
    const track = serverSection.TRACK || serverSection.track;
    const trackLayout = serverSection.CONFIG_TRACK || serverSection.config_track;
    const carsRaw = serverSection.CARS || serverSection.cars;
    const maxClients = parseInt(serverSection.MAX_CLIENTS || serverSection.max_clients || '0', 10) || undefined;
    const hasPassword = !!(serverSection.PASSWORD || serverSection.password);

    const cars = carsRaw ? carsRaw.split(';').map((c) => c.trim()).filter(Boolean) : parseEntryListCars(serverDir);
    const playerCount = countPlayersInLog(serverDir);

    const info: AcServerInfo = {
      pid: proc.pid,
      name,
      track,
      trackLayout,
      cars,
      maxClients,
      playerCount,
      hasPassword,
      serverDir,
      executablePath: proc.executablePath || '',
    };

    console.log(`[acServer] Serveur détecté:`, info);
    servers.push(info);
  }

  console.log(`[acServer] Total serveurs détectés: ${servers.length}`);
  return servers;
}
