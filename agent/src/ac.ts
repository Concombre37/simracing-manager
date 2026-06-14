import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

const processNames = [
  'acs.exe',
  'Content Manager.exe',
  'ContentManager.exe',
  'ACLauncher.exe',
];

export async function isAcRunning(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('tasklist /FI "STATUS eq RUNNING" /FO CSV /NH');
    const lowerStdout = stdout.toLowerCase();
    return processNames.some((name) => lowerStdout.includes(name.toLowerCase()));
  } catch (err) {
    return false;
  }
}

export async function killAssettoCorsa(): Promise<void> {
  try {
    await execAsync('taskkill /F /IM acs.exe /IM ContentManager.exe /IM "Content Manager.exe"');
    console.log('Processus AC/CM arrêtés');
  } catch (err) {
    console.log('Aucun processus AC/CM à arrêter');
  }
}
