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
setlocal EnableDelayedExpansion
set "LOG=${opts.logPath}"
set "PID=${opts.pid}"
set "CURRENT=${opts.currentExePath}"
set "NEW=${opts.newExePath}"
set "OLD=${opts.oldExePath}"

echo ============================================
echo  Mise a jour de SimRacing Agent
echo ============================================
echo.
echo [1/5] Arret de l'agent (PID: %PID%)...
echo [%date% %time%] Demarrage de la mise a jour >> "%LOG%"

:: Laisse le temps a l'agent d'avoir lance ce script
timeout /t 2 /nobreak >nul

:: Demande gentiment au processus de se fermer, puis force
taskkill /PID %PID% >nul 2>&1
timeout /t 1 /nobreak >nul
taskkill /F /PID %PID% >nul 2>&1

:: Attend que le processus soit reellement termine (max 30s)
set /a RETRIES=30
:waitloop
timeout /t 1 /nobreak >nul
tasklist /FI "PID eq %PID%" 2>nul | find /I "%PID%" >nul
if %errorlevel%==1 goto processStopped
set /a RETRIES-=1
if %RETRIES%==0 goto processNotStopped
goto waitloop

:processNotStopped
echo [ERREUR] Impossible d'arreter l'agent (PID: %PID%)
echo [%date% %time%] ERREUR: impossible d'arreter l'agent PID %PID% >> "%LOG%"
echo.
pause
exit /b 1

:processStopped
echo [OK] Agent arrete.
echo [%date% %time%] Agent arrete >> "%LOG%"
timeout /t 1 /nobreak >nul

echo [2/5] Suppression de l'ancienne sauvegarde...
if exist "%OLD%" del /F /Q "%OLD%" >> "%LOG%" 2>&1

echo [3/5] Sauvegarde de la version actuelle...
if exist "%CURRENT%" move /Y "%CURRENT%" "%OLD%" >> "%LOG%" 2>&1

echo [4/5] Installation de la nouvelle version...
move /Y "%NEW%" "%CURRENT%" >> "%LOG%" 2>&1

if not exist "%CURRENT%" (
  echo [ERREUR] Le nouvel executable est introuvable.
  echo [%date% %time%] ERREUR: nouvel exe introuvable >> "%LOG%"
  echo.
  pause
  exit /b 1
)

echo [5/5] Lancement de la nouvelle version...
echo [%date% %time%] Lancement de la nouvelle version >> "%LOG%"
start "" "%CURRENT%"

timeout /t 2 /nobreak >nul
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
setlocal EnableDelayedExpansion
set "LOG=${opts.logPath}"
set "PID=${opts.pid}"
set "CURRENT=${opts.currentExePath}"
set "ZIP=${opts.zipPath}"
set "DEST=${path.dirname(opts.currentExePath)}"

echo ============================================
echo  Mise a jour de SimRacing Agent (zip)
echo ============================================
echo.
echo [1/5] Arret de l'agent (PID: %PID%)...
echo [%date% %time%] Demarrage de la mise a jour (zip) >> "%LOG%"

timeout /t 2 /nobreak >nul

taskkill /PID %PID% >nul 2>&1
timeout /t 1 /nobreak >nul
taskkill /F /PID %PID% >nul 2>&1

set /a RETRIES=30
:waitloop
timeout /t 1 /nobreak >nul
tasklist /FI "PID eq %PID%" 2>nul | find /I "%PID%" >nul
if %errorlevel%==1 goto processStopped
set /a RETRIES-=1
if %RETRIES%==0 goto processNotStopped
goto waitloop

:processNotStopped
echo [ERREUR] Impossible d'arreter l'agent (PID: %PID%)
echo [%date% %time%] ERREUR: impossible d'arreter l'agent PID %PID% >> "%LOG%"
echo.
pause
exit /b 1

:processStopped
echo [OK] Agent arrete.
echo [%date% %time%] Agent arrete >> "%LOG%"
timeout /t 1 /nobreak >nul

echo [2/5] Sauvegarde du dossier tools...
if exist "tools" (
  if exist "tools.old" rmdir /S /Q "tools.old" >> "%LOG%" 2>&1
  move /Y "tools" "tools.old" >> "%LOG%" 2>&1
)

echo [3/5] Extraction du package...
powershell -NoProfile -Command "Expand-Archive -Path '%ZIP%' -DestinationPath '%DEST%' -Force" >> "%LOG%" 2>&1
if errorlevel 1 (
  echo [ERREUR] Extraction du zip echouee, restauration...
  echo [%date% %time%] ERREUR extraction du zip >> "%LOG%"
  if exist "tools.old" move /Y "tools.old" "tools" >> "%LOG%" 2>&1
  echo.
  pause
  exit /b 1
)
if exist "tools.old" rmdir /S /Q "tools.old" >> "%LOG%" 2>&1

echo [4/5] Nettoyage...
if exist "%ZIP%" del /F /Q "%ZIP%" >> "%LOG%" 2>&1

echo [5/5] Lancement de la nouvelle version...
if exist "%CURRENT%" (
  echo [%date% %time%] Lancement de la nouvelle version >> "%LOG%"
  start "" "%CURRENT%"
) else (
  echo [ERREUR] Executable introuvable apres extraction.
  echo [%date% %time%] ERREUR: exe introuvable apres extraction >> "%LOG%"
  echo.
  pause
  exit /b 1
)

timeout /t 2 /nobreak >nul
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
