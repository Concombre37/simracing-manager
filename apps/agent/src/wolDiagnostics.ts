import { execFile } from 'child_process';
import { promisify } from 'util';
import { Logger } from 'pino';

const execFileAsync = promisify(execFile);

export interface WolDiagnosticsResult {
  fastStartupEnabled: boolean | null;
  adapters: NetworkAdapterWolCheck[];
  overallReady: boolean;
  warnings: string[];
}

export interface NetworkAdapterWolCheck {
  name: string;
  macAddress: string | null;
  wakeOnMagicPacket: 'Enabled' | 'Disabled' | 'Unsupported' | 'Unknown';
  wakeOnPattern: 'Enabled' | 'Disabled' | 'Unsupported' | 'Unknown';
  allowComputerToTurnOffDevice: boolean | null;
  allowThisDeviceToWakeComputer: boolean | null;
  onlyAllowMagicPacketToWake: boolean | null;
}

export async function runWolDiagnostics(logger: Logger): Promise<WolDiagnosticsResult> {
  const result: WolDiagnosticsResult = {
    fastStartupEnabled: null,
    adapters: [],
    overallReady: false,
    warnings: [],
  };

  try {
    result.fastStartupEnabled = await isFastStartupEnabled();
    if (result.fastStartupEnabled) {
      result.warnings.push(
        'Le démarrage rapide (Fast Startup) est activé ; il peut empêcher le Wake-on-LAN. Désactive-le dans les options d alimentation Windows.',
      );
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to check Fast Startup status');
  }

  try {
    result.adapters = await checkNetworkAdapters();
  } catch (err) {
    logger.warn({ err }, 'Failed to check network adapters WoL settings');
  }

  const readyAdapter = result.adapters.find(
    (a) => a.wakeOnMagicPacket === 'Enabled' && a.allowThisDeviceToWakeComputer === true,
  );
  result.overallReady = readyAdapter !== undefined && result.fastStartupEnabled === false;

  if (!readyAdapter) {
    result.warnings.push(
      'Aucune carte réseau n a le Wake-on-LAN (magic packet) activé. Vérifie les propriétés avancées de la carte réseau dans le Gestionnaire de périphériques.',
    );
  }

  for (const adapter of result.adapters) {
    if (adapter.wakeOnMagicPacket !== 'Enabled') {
      result.warnings.push(`[${adapter.name}] Wake on Magic Packet = ${adapter.wakeOnMagicPacket}`);
    }
    if (adapter.allowThisDeviceToWakeComputer === false) {
      result.warnings.push(
        `[${adapter.name}] Autoriser ce périphérique à sortir le PC de veille = Désactivé`,
      );
    }
    if (adapter.allowComputerToTurnOffDevice === true) {
      result.warnings.push(
        `[${adapter.name}] Autoriser Windows à éteindre ce périphérique = Activé (peut couper l alimentation de la carte réseau)`,
      );
    }
  }

  return result;
}

async function isFastStartupEnabled(): Promise<boolean | null> {
  if (process.platform !== 'win32') return null;
  try {
    const { stdout } = await execFileAsync('powercfg', ['/hibernate']);
    // French Windows output: "Hibernation activée" or "Hibernation désactivée"
    // English: "Hibernation enabled" or "Hibernation disabled"
    const text = stdout.toLowerCase();
    if (text.includes('activé') || text.includes('enabled')) return true;
    if (text.includes('désactivé') || text.includes('disabled')) return false;
    return null;
  } catch {
    return null;
  }
}

async function checkNetworkAdapters(): Promise<NetworkAdapterWolCheck[]> {
  if (process.platform !== 'win32') return [];

  const script = `
$adapters = Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' }
foreach ($a in $adapters) {
  $advanced = Get-NetAdapterAdvancedProperty -Name $a.Name -ErrorAction SilentlyContinue
  $power = Get-NetAdapterPowerManagement -Name $a.Name -ErrorAction SilentlyContinue

  $wolMagic = ($advanced | Where-Object { $_.DisplayName -like '*Wake on Magic Packet*' }).DisplayValue
  $wolPattern = ($advanced | Where-Object { $_.DisplayName -like '*Wake on Pattern Match*' }).DisplayValue

  [PSCustomObject]@{
    name = $a.Name
    macAddress = $a.MacAddress
    wakeOnMagicPacket = if ($wolMagic) { $wolMagic } else { 'Unknown' }
    wakeOnPattern = if ($wolPattern) { $wolPattern } else { 'Unknown' }
    allowComputerToTurnOffDevice = if ($power.AllowComputerToTurnOffDevice -eq $true) { 'true' } elseif ($power.AllowComputerToTurnOffDevice -eq $false) { 'false' } else { 'unknown' }
    allowThisDeviceToWakeComputer = if ($power.AllowThisDeviceToWakeComputer -eq $true) { 'true' } elseif ($power.AllowThisDeviceToWakeComputer -eq $false) { 'false' } else { 'unknown' }
    onlyAllowMagicPacketToWake = if ($power.OnlyAllowMagicPacketToWakeComputer -eq $true) { 'true' } elseif ($power.OnlyAllowMagicPacketToWakeComputer -eq $false) { 'false' } else { 'unknown' }
  }
}
`;

  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ]);

  return parsePowerShellOutput(stdout);
}

function parsePowerShellOutput(stdout: string): NetworkAdapterWolCheck[] {
  const adapters: NetworkAdapterWolCheck[] = [];
  const blocks = stdout.trim().split(/\r?\n\r?\n/);

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((l) => l.trim());
    const getValue = (prefix: string): string | null => {
      const line = lines.find((l) => l.startsWith(prefix));
      return line ? line.substring(prefix.length).trim() : null;
    };

    const name = getValue('name');
    if (!name) continue;

    adapters.push({
      name,
      macAddress: getValue('macAddress'),
      wakeOnMagicPacket: normalizeWolValue(getValue('wakeOnMagicPacket')),
      wakeOnPattern: normalizeWolValue(getValue('wakeOnPattern')),
      allowComputerToTurnOffDevice: normalizeBool(getValue('allowComputerToTurnOffDevice')),
      allowThisDeviceToWakeComputer: normalizeBool(getValue('allowThisDeviceToWakeComputer')),
      onlyAllowMagicPacketToWake: normalizeBool(getValue('onlyAllowMagicPacketToWake')),
    });
  }

  return adapters;
}

function normalizeWolValue(value: string | null): NetworkAdapterWolCheck['wakeOnMagicPacket'] {
  if (!value) return 'Unknown';
  const lower = value.toLowerCase();
  if (lower.includes('enabled') || lower.includes('activé')) return 'Enabled';
  if (lower.includes('disabled') || lower.includes('désactivé')) return 'Disabled';
  if (lower.includes('unsupported') || lower.includes('non pris')) return 'Unsupported';
  return 'Unknown';
}

function normalizeBool(value: string | null): boolean | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  return null;
}
