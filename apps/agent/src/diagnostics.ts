import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import type { Logger } from 'pino';
import type { DiagnosticCheck, DiagnosticDriver, StationDiagnostics } from '@simracing/shared';
import { config } from './config';
import { resolveAcInstallPath } from './acPathResolver';
import { findContentManagerExe } from './cmLocator';

const execFileAsync = promisify(execFile);

async function exists(file: string): Promise<boolean> {
  return fs.access(file).then(
    () => true,
    () => false,
  );
}

async function windowsDrivers(): Promise<DiagnosticDriver[]> {
  if (process.platform !== 'win32') return [];
  // Read-only WMI inventory. The date/version are installed values, not an
  // assertion that a newer vendor release is available.
  const script = `$ErrorActionPreference='Stop'; Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceName -match 'NVIDIA|Radeon|Intel.*Graphics|Logitech|Thrustmaster|Fanatec|MOZA|Simucube|Asetek|ViGEm|Nefarius|VRS|Heusinkveld' } | Select-Object DeviceName,DriverProviderName,DriverVersion,DriverDate | ConvertTo-Json -Compress`;
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    {
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    },
  );
  if (!stdout.trim()) return [];
  const parsed: unknown = JSON.parse(stdout);
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows
    .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
    .map((row) => ({
      name: String(row.DeviceName ?? ''),
      provider: String(row.DriverProviderName ?? ''),
      version: String(row.DriverVersion ?? ''),
      date: row.DriverDate ? String(row.DriverDate) : undefined,
    }))
    .filter((row) => row.name)
    .slice(0, 40);
}

export async function collectDiagnostics(
  requestId: string,
  logger: Logger,
): Promise<StationDiagnostics> {
  const checks: DiagnosticCheck[] = [];
  const acPath = await resolveAcInstallPath(logger, 'acs.exe');
  checks.push({
    id: 'assetto-corsa',
    label: 'Assetto Corsa',
    status: acPath ? 'ok' : 'missing',
    detail: acPath ?? 'acs.exe introuvable. Vérifier Steam et AC_PATH.',
  });

  const cmPath = await findContentManagerExe();
  checks.push({
    id: 'content-manager',
    label: 'Content Manager',
    status: cmPath ? 'ok' : config.LAUNCH_MODE === 'cm' ? 'missing' : 'warning',
    detail: cmPath ?? 'Content Manager introuvable. Vérifier CM_PATH.',
  });

  const cspPresent = acPath ? await exists(path.join(acPath, 'dwrite.dll')) : false;
  checks.push({
    id: 'csp',
    label: 'Custom Shaders Patch',
    status: !acPath ? 'unknown' : cspPresent ? 'ok' : 'missing',
    detail: !acPath
      ? 'Vérification impossible sans Assetto Corsa.'
      : cspPresent
        ? 'dwrite.dll présent dans Assetto Corsa.'
        : 'dwrite.dll absent du dossier Assetto Corsa.',
  });

  const helperPaths = [
    path.join(path.dirname(process.execPath), 'tools', 'PressDriveKey.exe'),
    path.join(__dirname, '..', 'tools', 'PressDriveKey.exe'),
  ];
  const helperPresent = (await Promise.all(helperPaths.map(exists))).some(Boolean);
  checks.push({
    id: 'drive-helper',
    label: 'Assistant Drive',
    status: helperPresent ? 'ok' : 'warning',
    detail: helperPresent
      ? 'PressDriveKey.exe présent.'
      : 'PressDriveKey.exe absent ; le repli Lua reste disponible.',
  });

  let drivers: DiagnosticDriver[] = [];
  let driverScanFailed = false;
  try {
    drivers = await windowsDrivers();
    checks.push({
      id: 'drivers',
      label: 'Pilotes graphiques et périphériques',
      status: process.platform === 'win32' ? (drivers.length ? 'ok' : 'warning') : 'unknown',
      detail:
        process.platform === 'win32'
          ? `${drivers.length} pilote(s) détecté(s). Comparer les versions avec les sites des fabricants.`
          : 'Inventaire des pilotes disponible sur Windows uniquement.',
    });
  } catch (error) {
    driverScanFailed = true;
    logger.warn({ error }, 'Driver inventory unavailable');
    checks.push({
      id: 'drivers',
      label: 'Pilotes graphiques et périphériques',
      status: 'unknown',
      detail: 'Inventaire Windows indisponible.',
    });
  }

  const vigem = drivers.some((driver) => /ViGEm|Nefarius/i.test(driver.name));
  checks.push({
    id: 'vigem',
    label: 'ViGEmBus',
    status: process.platform !== 'win32' || driverScanFailed ? 'unknown' : vigem ? 'ok' : 'warning',
    detail: vigem
      ? 'Pilote ViGEmBus détecté.'
      : 'Non détecté dans les pilotes Plug and Play ; vérifier si le bouton Drive automatique échoue.',
  });

  const luaApp =
    acPath && path.join(acPath, 'apps', 'lua', 'SimCenterManager', 'SimCenterManager.lua');
  const luaPresent = !!luaApp && (await exists(luaApp));
  checks.push({
    id: 'lua-app',
    label: 'Application Lua SimCenter',
    status: luaPresent ? 'ok' : 'warning',
    detail: luaPresent
      ? 'Application Lua installée.'
      : 'Application Lua introuvable dans Assetto Corsa/apps/lua.',
  });

  return {
    requestId,
    stationId: config.STATION_ID,
    scannedAt: new Date().toISOString(),
    agentVersion: config.VERSION,
    checks,
    drivers,
  };
}
