import fs from "fs-extra";
import path from "path";
import https from "https";
import { spawn } from "child_process";
import { config } from "./config";

const OWNER = "Concombre37";
const REPO = "simracing-manager";
const ASSET_EXE = "sim-center-agent-win.exe";
const ASSET_ZIP = "sim-center-agent-win.zip";

function publicDownloadUrl(assetName: string): string {
  return `https://github.com/${OWNER}/${REPO}/releases/latest/download/${assetName}`;
}

interface GithubAsset {
  name: string;
  url: string;
  browser_download_url?: string;
}

function githubApiRequest<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      "User-Agent": "sim-center-agent",
      Accept: "application/vnd.github+json",
    };
    if (config.githubToken) {
      headers["Authorization"] = `token ${config.githubToken}`;
    }
    let data = "";
    https
      .get(url, { headers }, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location;
          if (!redirectUrl) {
            reject(new Error("Redirection sans URL"));
            return;
          }
          githubApiRequest<T>(redirectUrl).then(resolve).catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`GitHub API HTTP ${response.statusCode}`));
          return;
        }
        response.on("data", (chunk) => (data += chunk));
        response.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (err: any) {
            reject(new Error(`Réponse GitHub invalide: ${err.message}`));
          }
        });
      })
      .on("error", reject);
  });
}

async function resolveAssetUrl(assetName: string): Promise<string> {
  if (!config.githubToken) {
    return publicDownloadUrl(assetName);
  }
  const release = await githubApiRequest<{ assets: GithubAsset[] }>(
    `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`,
  );
  const asset = release.assets.find((a) => a.name === assetName);
  if (!asset) {
    throw new Error(`Asset ${assetName} introuvable dans la dernière release`);
  }
  // L'URL API de l'asset permet un téléchargement authentifié (redirection vers S3)
  return asset.url;
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const headers: Record<string, string> = {
      Accept: "application/octet-stream",
    };
    if (config.githubToken && url.includes("api.github.com")) {
      headers["Authorization"] = `token ${config.githubToken}`;
    }
    https
      .get(url, { headers }, (response) => {
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
      })
      .on("error", (err) => {
        try {
          fs.unlinkSync(dest);
        } catch {}
        reject(err);
      });
  });
}

function buildExeUpdateBatch(opts: {
  currentExePath: string;
  newExePath: string;
  oldExePath: string;
  pid: number;
  logPath: string;
}): string {
  return `@echo off
chcp 65001 >nul
echo [%date% %time%] Mise a jour de SimRacing Agent... >> "${opts.logPath}"
ping -n 6 127.0.0.1 >nul
:waitloop
tasklist /FI "PID eq ${opts.pid}" 2>nul | find "${opts.pid}" >nul
if %errorlevel%==0 (
  taskkill /F /PID ${opts.pid} >> "${opts.logPath}" 2>&1
  ping -n 3 127.0.0.1 >nul
  goto waitloop
)
echo [%date% %time%] Processus arrete >> "${opts.logPath}"
ping -n 4 127.0.0.1 >nul
if exist "${opts.oldExePath}" del /F /Q "${opts.oldExePath}" >> "${opts.logPath}" 2>&1
if exist "${opts.currentExePath}" move /Y "${opts.currentExePath}" "${opts.oldExePath}" >> "${opts.logPath}" 2>&1
move /Y "${opts.newExePath}" "${opts.currentExePath}" >> "${opts.logPath}" 2>&1
if exist "${opts.currentExePath}" (
  echo [%date% %time%] Lancement de la nouvelle version... >> "${opts.logPath}"
  start "" "${opts.currentExePath}"
) else (
  echo [%date% %time%] ERREUR: nouvel exe introuvable >> "${opts.logPath}"
)
ping -n 3 127.0.0.1 >nul
del /F /Q "%~f0"
`;
}

function buildZipUpdateBatch(opts: {
  currentExePath: string;
  zipPath: string;
  pid: number;
  logPath: string;
}): string {
  return `@echo off
chcp 65001 >nul
echo [%date% %time%] Mise a jour de SimRacing Agent (package zip)... >> "${opts.logPath}"
ping -n 6 127.0.0.1 >nul
:waitloop
tasklist /FI "PID eq ${opts.pid}" 2>nul | find "${opts.pid}" >nul
if %errorlevel%==0 (
  taskkill /F /PID ${opts.pid} >> "${opts.logPath}" 2>&1
  ping -n 3 127.0.0.1 >nul
  goto waitloop
)
echo [%date% %time%] Processus arrete >> "${opts.logPath}"
ping -n 4 127.0.0.1 >nul
if exist "tools" (
  if exist "tools.old" rmdir /S /Q "tools.old" >> "${opts.logPath}" 2>&1
  move /Y "tools" "tools.old" >> "${opts.logPath}" 2>&1
)
powershell -NoProfile -Command "Expand-Archive -Path '${opts.zipPath}' -DestinationPath '${path.dirname(opts.currentExePath)}' -Force" >> "${opts.logPath}" 2>&1
if errorlevel 1 (
  echo [%date% %time%] ERREUR lors de l extraction du zip >> "${opts.logPath}"
  if exist "tools.old" move /Y "tools.old" "tools" >> "${opts.logPath}" 2>&1
) else (
  if exist "tools.old" rmdir /S /Q "tools.old" >> "${opts.logPath}" 2>&1
)
if exist "${opts.zipPath}" del /F /Q "${opts.zipPath}" >> "${opts.logPath}" 2>&1
if exist "${opts.currentExePath}" (
  echo [%date% %time%] Lancement de la nouvelle version... >> "${opts.logPath}"
  start "" "${opts.currentExePath}"
) else (
  echo [%date% %time%] ERREUR: exe introuvable apres extraction >> "${opts.logPath}"
)
ping -n 3 127.0.0.1 >nul
del /F /Q "%~f0"
`;
}

async function launchUpdateBatch(
  batchContent: string,
  currentDir: string,
): Promise<void> {
  const batchPath = path.join(currentDir, "update_agent.bat");
  const logPath = path.join(currentDir, "update_agent.log");
  await fs.writeFile(batchPath, batchContent, "utf-8");
  console.log(`[updater] Script de mise a jour créé: ${batchPath}`);

  spawn("cmd.exe", ["/c", batchPath], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  }).unref();

  console.log("[updater] Mise a jour lancée, fermeture de l agent...");
  setTimeout(() => process.exit(0), 1000);
}

export async function triggerUpdate(currentExePath: string): Promise<void> {
  const currentDir = path.dirname(currentExePath);
  const currentName = path.basename(currentExePath);
  const pid = process.pid;

  // Essayer d'abord l'exe seul (format actuel : un seul exe autonome)
  const newExePath = path.join(currentDir, `${currentName}.new`);
  const oldExePath = path.join(currentDir, `${currentName}.old`);

  try {
    const downloadUrl = await resolveAssetUrl(ASSET_EXE);
    console.log(
      `[updater] Téléchargement de l'exe depuis ${downloadUrl.split("?")[0]}...`,
    );
    await downloadFile(downloadUrl, newExePath);
    console.log(`[updater] Téléchargement terminé: ${newExePath}`);

    const logPath = path.join(currentDir, "update_agent.log");
    const batchContent = buildExeUpdateBatch({
      currentExePath,
      newExePath,
      oldExePath,
      pid,
      logPath,
    });
    await launchUpdateBatch(batchContent, currentDir);
    return;
  } catch (exeErr: any) {
    console.log(
      `[updater] Exe seul indisponible: ${exeErr.message}. Fallback vers le package zip.`,
    );
  }

  // Fallback : package zip (ancien format avec tools/)
  try {
    const zipUrl = await resolveAssetUrl(ASSET_ZIP);
    const zipPath = path.join(currentDir, `${ASSET_ZIP}.new`);
    console.log(
      `[updater] Téléchargement du zip depuis ${zipUrl.split("?")[0]}...`,
    );
    await downloadFile(zipUrl, zipPath);
    console.log(`[updater] Zip téléchargé: ${zipPath}`);

    const batchContent = buildZipUpdateBatch({
      currentExePath,
      zipPath,
      pid,
      logPath: path.join(currentDir, "update_agent.log"),
    });
    await launchUpdateBatch(batchContent, currentDir);
    return;
  } catch (zipErr: any) {
    throw new Error(
      `Aucun asset de mise a jour disponible : ${zipErr.message}`,
    );
  }
}
