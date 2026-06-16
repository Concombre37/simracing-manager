import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';
import { config, getCmPresetsPath } from './config';

export interface SessionConfig {
  sessionId: string;
  userId: string;
  carAcId?: string;
  trackAcId?: string;
  layoutName?: string;
  weatherPreset?: string;
  sessionType?: 'practice' | 'race' | 'hotlap';
}

const presetTemplate = `[GAME]
MODE={{mode}}

[CAR]
MODEL={{car}}

[TRACK]
MODEL={{track}}
CONFIG_TRACK={{layout}}

[CONDITIONS]
PRESET={{weather}}

[REMOTE]
ACTIVE=1

[SESSION_0]
NAME=SimCenter Session
TYPE={{mode}}
DURATION_MINUTES=60
SPAWN_SET=PIT
`;

export async function createCmPreset(session: SessionConfig): Promise<string> {
  const presetName = `simcenter_${session.sessionId}`;
  const presetsDir = getCmPresetsPath();
  await fs.ensureDir(presetsDir);

  const modeMap: Record<string, string> = {
    practice: 'PRACTICE',
    race: 'RACE',
    hotlap: 'HOTLAP',
  };

  const content = presetTemplate
    .replace(/{{mode}}/g, modeMap[session.sessionType || 'practice'])
    .replace(/{{car}}/g, session.carAcId || 'ks_mazda_mx5_cup')
    .replace(/{{track}}/g, session.trackAcId || 'spa')
    .replace(/{{layout}}/g, session.layoutName || '')
    .replace(/{{weather}}/g, session.weatherPreset || 'default');

  const presetPath = path.join(presetsDir, `${presetName}.ini`);
  await fs.writeFile(presetPath, content, 'utf-8');
  console.log(`Preset CM créé: ${presetPath}`);
  return presetName;
}

export async function launchContentManager(presetName: string): Promise<number> {
  const cmExe = path.join(config.cmPath, config.cmExecutable);

  if (!(await fs.pathExists(cmExe))) {
    throw new Error(`Content Manager non trouvé: ${cmExe}`);
  }

  console.log(`Lancement de Content Manager: ${cmExe} --preset "${presetName}" --start`);

  const child = spawn(cmExe, ['--preset', presetName, '--start'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });

  child.unref();
  return child.pid || 0;
}

export async function launchAssettoCorsa(session: SessionConfig): Promise<number> {
  const acExe = path.join(config.acPath, config.acExecutable);

  if (!(await fs.pathExists(acExe))) {
    throw new Error(`Assetto Corsa non trouvé: ${acExe}`);
  }

  const args = ['-c', session.carAcId || 'ks_mazda_mx5_cup', '-t', session.trackAcId || 'spa'];
  if (session.layoutName) {
    args.push('-l', session.layoutName);
  }

  console.log(`Lancement d'Assetto Corsa: ${acExe} ${args.join(' ')}`);

  const child = spawn(acExe, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });

  child.unref();
  return child.pid || 0;
}

export async function launchSession(session: SessionConfig): Promise<number> {
  if (config.launchMode === 'cm') {
    const presetName = await createCmPreset(session);
    return launchContentManager(presetName);
  } else {
    return launchAssettoCorsa(session);
  }
}
