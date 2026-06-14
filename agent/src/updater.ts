import fs from 'fs-extra';
import path from 'path';
import https from 'https';
import { spawn } from 'child_process';

const DOWNLOAD_URL = 'https://github.com/Concombre37/simracing-manager/releases/latest/download/sim-center-agent-win.exe';

export async function triggerUpdate(currentExePath: string): Promise<void> {
  const currentDir = path.dirname(currentExePath);
  const currentName = path.basename(currentExePath);
  const newExePath = path.join(currentDir, `${currentName}.new`);
  const oldExePath = path.join(currentDir, `${currentName}.old`);
  const pid = process.pid;

  console.log(`[updater] Téléchargement de la dernière version...`);
  console.log(`[updater] URL: ${DOWNLOAD_URL}`);
  await downloadFile(DOWNLOAD_URL, newExePath);
  console.log(`[updater] Téléchargement terminé: ${newExePath}`);

  const batchPath = path.join(currentDir, 'update_agent.bat');
  const batchContent = `@echo off
chcp 65001 >nul
echo Mise a jour de SimRacing Agent...
timeout /t 3 /nobreak >nul
taskkill /F /PID ${pid} >nul 2>&1
if exist "${oldExePath}" del /F /Q "${oldExePath}"
if exist "${currentExePath}" move /Y "${currentExePath}" "${oldExePath}"
move /Y "${newExePath}" "${currentExePath}"
echo Lancement de la nouvelle version...
start "" "${currentExePath}"
del /F /Q "%~f0"
`;
  await fs.writeFile(batchPath, batchContent, 'utf-8');
  console.log(`[updater] Script de mise a jour créé: ${batchPath}`);

  spawn('cmd.exe', ['/c', batchPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  }).unref();

  console.log('[updater] Mise a jour lancée, fermeture de l agent...');
  setTimeout(() => process.exit(0), 1000);
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
        fs.unlinkSync(dest);
        reject(err);
      });
  });
}
