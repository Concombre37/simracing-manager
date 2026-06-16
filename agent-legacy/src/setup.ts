import fs from 'fs-extra';
import path from 'path';
import https from 'https';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { config } from './config';
import { log } from './console';
import { ensureStarterBoundToA } from './acControls';

const execAsync = promisify(exec);

const OWNER = 'Concombre37';
const REPO = 'simracing-manager';

const VIGEM_DRIVER_NAME = 'ViGEmBus_1.22.0_x64_x86_arm64.exe';
const VIGEM_DOWNLOAD_URL = `https://github.com/nefarius/ViGEmBus/releases/download/v1.22.0/${VIGEM_DRIVER_NAME}`;

const HELPER_NAME = 'PressDriveKey.exe';
const HELPER_PUBLIC_URL = `https://github.com/${OWNER}/${REPO}/releases/latest/download/${HELPER_NAME}`;

const LUA_APP_DIR = 'lua_app';
const LUA_APP_TARGET_NAME = 'SimCenterAutoStart';
const LUA_APP_FILES = ['manifest.ini', 'SimCenterAutoStart.lua'];

function getToolsDir(): string {
  return path.join(config.baseDir, 'tools');
}

function getHelperPath(): string {
  return path.join(getToolsDir(), HELPER_NAME);
}

function getViGEmDir(): string {
  return path.join(getToolsDir(), 'ViGEmBus');
}

function getViGEmDriverPath(): string {
  return path.join(getViGEmDir(), VIGEM_DRIVER_NAME);
}

function getSnapshotAssetPath(asset: string): string {
  return path.join(__dirname, '..', asset);
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, { headers: { Accept: 'application/octet-stream' } }, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location;
          if (!redirectUrl) {
            reject(new Error('Redirection sans URL'));
            return;
          }
          downloadFile(redirectUrl, dest).then(resolve).catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      })
      .on('error', (err) => {
        try {
          fs.unlinkSync(dest);
        } catch {}
        reject(err);
      });
  });
}

async function isViGEmBusInstalled(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('sc query ViGEmBus');
    return stdout.toLowerCase().includes('vigembus');
  } catch {
    return false;
  }
}

async function unblockFile(filePath: string): Promise<void> {
  try {
    await execAsync(
      `powershell.exe -NoProfile -Command "Unblock-File -Path '${filePath.replace(/'/g, "''")}'"`,
    );
  } catch {
    // Ignorer si PowerShell n'est pas disponible ou si le fichier n'est pas bloque
  }
}

function runDriverInstaller(driverPath: string): Promise<number> {
  return new Promise((resolve) => {
    log('info', `[setup] Execution de ${driverPath} /S`);

    // Utilise cmd /c pour eviter les problemes de parsing de certains installateurs NSIS
    const child = spawn('cmd.exe', ['/c', `"${driverPath}"`, '/S'], {
      detached: false,
      windowsHide: true,
    });

    let output = '';
    child.stdout?.on('data', (data) => {
      output += data.toString();
    });
    child.stderr?.on('data', (data) => {
      output += data.toString();
    });

    child.on('exit', (code) => {
      if (code !== 0 && output) {
        log('warn', `[setup] Sortie installateur: ${output.trim()}`);
      }
      resolve(code ?? 1);
    });
    child.on('error', (err) => {
      log('error', `[setup] Erreur execution installateur: ${err.message}`);
      resolve(1);
    });
  });
}

async function extractAssetFromSnapshot(asset: string, dest: string): Promise<boolean> {
  try {
    const snapshotPath = getSnapshotAssetPath(asset);
    const data = fs.readFileSync(snapshotPath);
    if (!data || data.length === 0) return false;
    await fs.ensureDir(path.dirname(dest));
    await fs.writeFile(dest, data);
    return true;
  } catch {
    return false;
  }
}

async function ensureViGEmBus(): Promise<void> {
  if (await isViGEmBusInstalled()) {
    log('info', '[setup] ViGEmBus est installe');
    return;
  }

  log('warn', "[setup] ViGEmBus non detecte, tentative d'installation...");

  await fs.ensureDir(getViGEmDir());

  const driverPath = getViGEmDriverPath();
  if (!fs.existsSync(driverPath)) {
    const extracted = await extractAssetFromSnapshot(
      path.join('tools', 'ViGEmBus', VIGEM_DRIVER_NAME),
      driverPath,
    );

    if (!extracted) {
      log('info', `[setup] Telechargement de ${VIGEM_DRIVER_NAME}...`);
      await downloadFile(VIGEM_DOWNLOAD_URL, driverPath);
    } else {
      log('info', "[setup] Installateur ViGEmBus extrait de l'agent");
    }
  }

  if (!fs.existsSync(driverPath)) {
    throw new Error(`Installateur introuvable: ${driverPath}`);
  }

  const stats = fs.statSync(driverPath);
  log('info', `[setup] Installateur pret: ${driverPath} (${stats.size} octets)`);

  // Debloque le fichier si Windows l'a marque comme telecharge depuis Internet
  await unblockFile(driverPath);

  log('info', '[setup] Installation silencieuse de ViGEmBus (admin requis)...');
  const code = await runDriverInstaller(driverPath);
  if (code !== 0) {
    throw new Error(`L'installateur a retourne le code ${code}`);
  }

  if (await isViGEmBusInstalled()) {
    log('success', '[setup] ViGEmBus installe avec succes');
  } else {
    throw new Error('ViGEmBus toujours non detecte apres installation');
  }
}

function getLuaAppTargetDir(): string {
  return path.join(config.acPath, 'apps', 'lua', LUA_APP_TARGET_NAME);
}

async function ensureLuaApp(): Promise<void> {
  if (process.platform !== 'win32') {
    log('info', '[setup] App Lua ignoree sur plateforme non-Windows');
    return;
  }

  const targetDir = getLuaAppTargetDir();
  let installed = 0;

  for (const file of LUA_APP_FILES) {
    const srcSnapshot = path.join(__dirname, '..', LUA_APP_DIR, file);
    const dest = path.join(targetDir, file);

    try {
      const data = fs.readFileSync(srcSnapshot);
      if (!data || data.length === 0) {
        log('warn', `[setup] Fichier Lua source vide : ${srcSnapshot}`);
        continue;
      }
      await fs.ensureDir(targetDir);
      await fs.writeFile(dest, data);
      installed++;
    } catch (err: any) {
      log('warn', `[setup] Impossible de copier ${file} : ${err.message}`);
    }
  }

  if (installed === LUA_APP_FILES.length) {
    log('success', `[setup] App Lua installee : ${targetDir}`);
  } else if (installed > 0) {
    log('warn', `[setup] App Lua partiellement installee (${installed}/${LUA_APP_FILES.length})`);
  } else {
    throw new Error("Aucun fichier Lua n'a pu etre installe");
  }
}

async function ensureDriveKeyHelper(): Promise<void> {
  const helperPath = getHelperPath();
  if (fs.existsSync(helperPath)) {
    log('info', '[setup] PressDriveKey.exe est present');
    return;
  }

  await fs.ensureDir(getToolsDir());

  const extracted = await extractAssetFromSnapshot(path.join('tools', HELPER_NAME), helperPath);

  if (extracted) {
    log('success', `[setup] PressDriveKey.exe extrait de l'agent : ${helperPath}`);
    return;
  }

  log('warn', '[setup] PressDriveKey.exe non trouve, tentative de telechargement...');
  await downloadFile(HELPER_PUBLIC_URL, helperPath);
  log('success', `[setup] PressDriveKey.exe telecharge : ${helperPath}`);
}

export async function runSetupChecks(): Promise<void> {
  if (process.platform !== 'win32') {
    log('info', '[setup] Verification ignoree sur plateforme non-Windows');
    return;
  }

  try {
    await ensureDriveKeyHelper();
  } catch (err: any) {
    log('warn', `[setup] PressDriveKey.exe indisponible : ${err.message}`);
  }

  try {
    if (config.autoMapAcControls) {
      await ensureStarterBoundToA();
    }
  } catch (err: any) {
    log('warn', `[setup] Mapping AC controls indisponible : ${err.message}`);
  }

  try {
    if (config.autoDriveLua) {
      await ensureLuaApp();
    }
  } catch (err: any) {
    log('warn', `[setup] App Lua indisponible : ${err.message}`);
  }

  try {
    await ensureViGEmBus();
  } catch (err: any) {
    log('warn', `[setup] ViGEmBus indisponible : ${err.message}`);
  }
}
