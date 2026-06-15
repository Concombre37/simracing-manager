import fs from "fs-extra";
import path from "path";
import https from "https";
import { spawn, exec } from "child_process";
import { promisify } from "util";
import { config } from "./config";
import { log } from "./console";
import { ensureStarterBoundToA } from "./acControls";

const execAsync = promisify(exec);

const OWNER = "Concombre37";
const REPO = "simracing-manager";

const VIGEM_DRIVER_NAME = "ViGEmBus_1.22.0_x64_x86_arm64.exe";
const VIGEM_DOWNLOAD_URL = `https://github.com/nefarius/ViGEmBus/releases/download/v1.22.0/${VIGEM_DRIVER_NAME}`;

const HELPER_NAME = "PressDriveKey.exe";
const HELPER_PUBLIC_URL = `https://github.com/${OWNER}/${REPO}/releases/latest/download/${HELPER_NAME}`;

function getToolsDir(): string {
  return path.join(config.baseDir, "tools");
}

function getHelperPath(): string {
  return path.join(getToolsDir(), HELPER_NAME);
}

function getViGEmDir(): string {
  return path.join(getToolsDir(), "ViGEmBus");
}

function getViGEmDriverPath(): string {
  return path.join(getViGEmDir(), VIGEM_DRIVER_NAME);
}

function getSnapshotAssetPath(asset: string): string {
  return path.join(__dirname, "..", asset);
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(
        url,
        { headers: { Accept: "application/octet-stream" } },
        (response) => {
          if (response.statusCode === 302 || response.statusCode === 301) {
            const redirectUrl = response.headers.location;
            if (!redirectUrl) {
              reject(new Error("Redirection sans URL"));
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
          file.on("finish", () => {
            file.close();
            resolve();
          });
        },
      )
      .on("error", (err) => {
        try {
          fs.unlinkSync(dest);
        } catch {}
        reject(err);
      });
  });
}

async function isViGEmBusInstalled(): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      'powershell.exe -NoProfile -Command "Get-Service -Name ViGEmBus -ErrorAction SilentlyContinue | Select-Object -First 1"',
    );
    return stdout.toLowerCase().includes("vigembus");
  } catch {
    return false;
  }
}

function runDriverInstaller(driverPath: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(driverPath, ["/S"], {
      detached: false,
      windowsHide: true,
    });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
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
    log("info", "[setup] ViGEmBus est installe");
    return;
  }

  log("warn", "[setup] ViGEmBus non detecte, tentative d'installation...");

  await fs.ensureDir(getViGEmDir());

  const driverPath = getViGEmDriverPath();
  if (!fs.existsSync(driverPath)) {
    const extracted = await extractAssetFromSnapshot(
      path.join("tools", "ViGEmBus", VIGEM_DRIVER_NAME),
      driverPath,
    );

    if (!extracted) {
      log("info", `[setup] Telechargement de ${VIGEM_DRIVER_NAME}...`);
      await downloadFile(VIGEM_DOWNLOAD_URL, driverPath);
    } else {
      log("info", "[setup] Installateur ViGEmBus extrait de l'agent");
    }
  }

  log("info", "[setup] Installation silencieuse de ViGEmBus (admin requis)...");
  const code = await runDriverInstaller(driverPath);
  if (code !== 0) {
    throw new Error(`L'installateur a retourne le code ${code}`);
  }

  if (await isViGEmBusInstalled()) {
    log("success", "[setup] ViGEmBus installe avec succes");
  } else {
    throw new Error("ViGEmBus toujours non detecte apres installation");
  }
}

async function ensureDriveKeyHelper(): Promise<void> {
  const helperPath = getHelperPath();
  if (fs.existsSync(helperPath)) {
    log("info", "[setup] PressDriveKey.exe est present");
    return;
  }

  await fs.ensureDir(getToolsDir());

  const extracted = await extractAssetFromSnapshot(
    path.join("tools", HELPER_NAME),
    helperPath,
  );

  if (extracted) {
    log("success", `[setup] PressDriveKey.exe extrait de l'agent : ${helperPath}`);
    return;
  }

  log("warn", "[setup] PressDriveKey.exe non trouve, tentative de telechargement...");
  await downloadFile(HELPER_PUBLIC_URL, helperPath);
  log("success", `[setup] PressDriveKey.exe telecharge : ${helperPath}`);
}

export async function runSetupChecks(): Promise<void> {
  if (process.platform !== "win32") {
    log("info", "[setup] Verification ignoree sur plateforme non-Windows");
    return;
  }

  try {
    await ensureDriveKeyHelper();
  } catch (err: any) {
    log("warn", `[setup] PressDriveKey.exe indisponible : ${err.message}`);
  }

  try {
    if (config.autoMapAcControls) {
      await ensureStarterBoundToA();
    }
  } catch (err: any) {
    log("warn", `[setup] Mapping AC controls indisponible : ${err.message}`);
  }

  try {
    await ensureViGEmBus();
  } catch (err: any) {
    log("warn", `[setup] ViGEmBus indisponible : ${err.message}`);
  }
}
