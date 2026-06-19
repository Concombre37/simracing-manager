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
  interfaceType: 'Wi-Fi' | 'Ethernet' | 'Unknown';
  wakeOnMagicPacket: 'Enabled' | 'Disabled' | 'Unsupported' | 'Unknown';
  wakeOnPattern: 'Enabled' | 'Disabled' | 'Unsupported' | 'Unknown';
  allowComputerToTurnOffDevice: boolean | null;
  allowThisDeviceToWakeComputer: boolean | null;
  onlyAllowMagicPacketToWake: boolean | null;
  wakeFromAny: boolean | null;
}

export async function runWolDiagnostics(logger: Logger): Promise<WolDiagnosticsResult> {
  logger.info('Running Wake-on-LAN diagnostics...');
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

  let wakeFromAnyDevices: string[] = [];
  try {
    wakeFromAnyDevices = await getWakeFromAnyDevices();
  } catch (err) {
    logger.debug({ err }, 'Failed to list wake-from-any devices');
  }

  try {
    result.adapters = await checkNetworkAdapters(wakeFromAnyDevices);
  } catch (err) {
    logger.warn({ err }, 'Failed to check network adapters WoL settings');
  }

  const readyAdapter = result.adapters.find(
    (a) => a.wakeOnMagicPacket === 'Enabled' || a.wakeFromAny === true,
  );
  result.overallReady = readyAdapter !== undefined && result.fastStartupEnabled !== true;

  if (!readyAdapter) {
    result.warnings.push(
      'Aucune carte réseau n a le Wake-on-LAN (magic packet) activé. Vérifie les propriétés avancées de la carte réseau dans le Gestionnaire de périphériques.',
    );
  }

  for (const adapter of result.adapters) {
    if (adapter.interfaceType === 'Wi-Fi') {
      result.warnings.push(
        `[${adapter.name}] Connexion Wi-Fi détectée. Le Wake-on-LAN sur Wi-Fi est souvent peu fiable ; privilégie le câble Ethernet si possible.`,
      );
    }
    if (adapter.wakeOnMagicPacket !== 'Enabled' && adapter.wakeFromAny !== true) {
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
    const text = stdout.toLowerCase();
    if (text.includes('activé') || text.includes('enabled')) return true;
    if (text.includes('désactivé') || text.includes('disabled')) return false;
    return null;
  } catch {
    return null;
  }
}

async function getWakeFromAnyDevices(): Promise<string[]> {
  if (process.platform !== 'win32') return [];
  try {
    const { stdout } = await execFileAsync('powercfg', ['/devicequery', 'wake_from_any']);
    return stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function checkNetworkAdapters(
  wakeFromAnyDevices: string[],
): Promise<NetworkAdapterWolCheck[]> {
  if (process.platform !== 'win32') return [];

  const wakeList = wakeFromAnyDevices.map((d) => d.toLowerCase());

  const script = `
$adapters = Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' }
foreach ($a in $adapters) {
  $advanced = Get-NetAdapterAdvancedProperty -Name $a.Name -AllProperties -ErrorAction SilentlyContinue
  $power = $null
  try {
    $power = Get-NetAdapterPowerManagement -Name $a.Name -ErrorAction Stop
  } catch {
    $power = $null
  }

  $wolMagic = ($advanced | Where-Object { $_.DisplayName -like '*Wake*Magic*' -or $_.DisplayName -like '*WOL*' -or $_.DisplayName -like '*Wake on LAN*' }).DisplayValue | Select-Object -First 1
  $wolPattern = ($advanced | Where-Object { $_.DisplayName -like '*Wake*Pattern*' }).DisplayValue | Select-Object -First 1

  [PSCustomObject]@{
    name = $a.Name
    macAddress = $a.MacAddress
    interfaceType = $a.InterfaceDescription
    wakeOnMagicPacket = if ($wolMagic) { $wolMagic } else { 'Unknown' }
    wakeOnPattern = if ($wolPattern) { $wolPattern } else { 'Unknown' }
    allowComputerToTurnOffDevice = if ($power -and $power.AllowComputerToTurnOffDevice -eq $true) { 'true' } elseif ($power -and $power.AllowComputerToTurnOffDevice -eq $false) { 'false' } else { 'unknown' }
    allowThisDeviceToWakeComputer = if ($power -and $power.AllowThisDeviceToWakeComputer -eq $true) { 'true' } elseif ($power -and $power.AllowThisDeviceToWakeComputer -eq $false) { 'false' } else { 'unknown' }
    onlyAllowMagicPacketToWake = if ($power -and $power.OnlyAllowMagicPacketToWakeComputer -eq $true) { 'true' } elseif ($power -and $power.OnlyAllowMagicPacketToWakeComputer -eq $false) { 'false' } else { 'unknown' }
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

  return parsePowerShellOutput(stdout, wakeList);
}

function parsePowerShellOutput(
  stdout: string,
  wakeFromAnyDevices: string[],
): NetworkAdapterWolCheck[] {
  const adapters: NetworkAdapterWolCheck[] = [];
  const blocks = stdout.trim().split(/\r?\n\r?\n/);

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((l) => l.trim());
    const getValue = (prefix: string): string | null => {
      const line = lines.find((l) => l.startsWith(prefix));
      return line ? cleanValue(line.substring(prefix.length).trim()) : null;
    };

    const name = getValue('name');
    if (!name) continue;

    const macAddress = getValue('macAddress');
    const interfaceDescription = getValue('interfaceType') ?? '';
    const interfaceType = detectInterfaceType(interfaceDescription);
    const wakeFromAny = wakeFromAnyDevices.some(
      (d) => name.toLowerCase().includes(d) || interfaceDescription.toLowerCase().includes(d),
    );

    adapters.push({
      name,
      macAddress,
      interfaceType,
      wakeOnMagicPacket: normalizeWolValue(getValue('wakeOnMagicPacket')),
      wakeOnPattern: normalizeWolValue(getValue('wakeOnPattern')),
      allowComputerToTurnOffDevice: normalizeBool(getValue('allowComputerToTurnOffDevice')),
      allowThisDeviceToWakeComputer: normalizeBool(getValue('allowThisDeviceToWakeComputer')),
      onlyAllowMagicPacketToWake: normalizeBool(getValue('onlyAllowMagicPacketToWake')),
      wakeFromAny,
    });
  }

  return adapters;
}

function cleanValue(value: string): string {
  return value.replace(/^[:\s]+/, '').replace(/[:\s]+$/, '');
}

function detectInterfaceType(description: string): NetworkAdapterWolCheck['interfaceType'] {
  const lower = description.toLowerCase();
  if (
    lower.includes('wi-fi') ||
    lower.includes('wireless') ||
    lower.includes('802.11') ||
    lower.includes('wlan')
  )
    return 'Wi-Fi';
  if (
    lower.includes('ethernet') ||
    lower.includes('gigabit') ||
    lower.includes('realtek') ||
    lower.includes('intel(r) i') ||
    lower.includes('marvell') ||
    lower.includes('broadcom') ||
    lower.includes('killer') ||
    lower.includes('usb gbe') ||
    lower.includes('pci') ||
    lower.includes('family controller')
  )
    return 'Ethernet';
  return 'Unknown';
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
