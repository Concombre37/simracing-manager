import fs from 'fs-extra';
import path from 'path';
import https from 'https';
import { spawn } from 'child_process';
import { config } from './config';

const OWNER = 'Concombre37';
const REPO = 'simracing-manager';
const ASSET_NAME = 'sim-center-agent-win.exe';
const PUBLIC_DOWNLOAD_URL = `https://github.com/${OWNER}/${REPO}/releases/latest/download/${ASSET_NAME}`;

interface GithubAsset {
  name: string;
  url: string;
  browser_download_url?: string;
}

function githubApiRequest<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'User-Agent': 'sim-center-agent',
      Accept: 'application/vnd.github+json',
    };
    if (config.githubToken) {
      headers['Authorization'] = `token ${config.githubToken}`;
    }
    let data = '';
    https
      .get(url, { headers }, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location;
          if (!redirectUrl) {
            reject(new Error('Redirection sans URL'));
            return;
          }
          githubApiRequest<T>(redirectUrl).then(resolve).catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`GitHub API HTTP ${response.statusCode}`));
          return;
        }
        response.on('data', (chunk) => (data += chunk));
        response.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err: any) {
            reject(new Error(`Réponse GitHub invalide: ${err.message}`));
          }
        });
      })
      .on('error', reject);
  });
}

async function resolveDownloadUrl(): Promise<string> {
  if (!config.githubToken) {
    return PUBLIC_DOWNLOAD_URL;
  }
  const release = await githubApiRequest<{ assets: GithubAsset[] }>(
    `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`
  );
  const asset = release.assets.find((a) => a.name === ASSET_NAME);
  if (!asset) {
    throw new Error(`Asset ${ASSET_NAME} introuvable dans la dernière release`);
  }
  // L'URL API de l'asset permet un téléchargement authentifié (redirection vers S3)
  return asset.url;
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const headers: Record<string, string> = { Accept: 'application/octet-stream' };
    if (config.githubToken && url.includes('api.github.com')) {
      headers['Authorization'] = `token ${config.githubToken}`;
    }
    https
      .get(url, { headers }, (response) => {
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

export async function triggerUpdate(currentExePath: string): Promise<void> {
  const currentDir = path.dirname(currentExePath);
  const currentName = path.basename(currentExePath);
  const newExePath = path.join(currentDir, `${currentName}.new`);
  const oldExePath = path.join(currentDir, `${currentName}.old`);
  const pid = process.pid;

  console.log(`[updater] Recherche de la dernière version...`);
  const downloadUrl = await resolveDownloadUrl();
  console.log(`[updater] Téléchargement depuis ${downloadUrl.split('?')[0]}...`);
  await downloadFile(downloadUrl, newExePath);
  console.log(`[updater] Téléchargement terminé: ${newExePath}`);

  const psPath = path.join(currentDir, 'update_agent.ps1');
  const logPath = path.join(currentDir, 'update_agent.log');
  const psContent = `$log = "${logPath}"
function Write-Log($msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
  Add-Content -Path $log -Value $line -ErrorAction SilentlyContinue
  Write-Host $line
}
Write-Log "Mise a jour de SimRacing Agent..."
$pidToKill = ${pid}
$maxWait = 15
Write-Log "Attente de l arret du processus $pidToKill..."
for ($i = 0; $i -lt $maxWait; $i++) {
  try {
    Stop-Process -Id $pidToKill -Force -ErrorAction Stop
  } catch {
    break
  }
  Start-Sleep -Milliseconds 500
}
Start-Sleep -Seconds 2
if (Test-Path "${oldExePath}") {
  try { Remove-Item -Path "${oldExePath}" -Force -ErrorAction Stop } catch { Write-Log "Impossible de supprimer l ancien exe : $_" }
}
if (Test-Path "${currentExePath}") {
  try { Move-Item -Path "${currentExePath}" -Destination "${oldExePath}" -Force -ErrorAction Stop } catch { Write-Log "Impossible de renommer l exe actuel : $_" }
}
try {
  Move-Item -Path "${newExePath}" -Destination "${currentExePath}" -Force -ErrorAction Stop
} catch {
  Write-Log "Impossible de deplacer le nouvel exe : $_"
  return
}
Write-Log "Lancement de la nouvelle version : ${currentExePath}"
try {
  Start-Process -FilePath "${currentExePath}" -WorkingDirectory "${currentDir}" -WindowStyle Normal
  Write-Log "Nouvelle version lancee."
} catch {
  Write-Log "Erreur lors du lancement : $_"
}
`;
  await fs.writeFile(psPath, psContent, 'utf-8');
  console.log(`[updater] Script de mise a jour créé: ${psPath}`);

  spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  }).unref();

  console.log('[updater] Mise a jour lancée, fermeture de l agent...');
  setTimeout(() => process.exit(0), 1000);
}
