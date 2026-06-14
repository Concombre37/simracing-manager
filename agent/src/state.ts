import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const stateFilePath = path.join(
  os.homedir(),
  'Documents',
  'Assetto Corsa',
  'apps',
  'lua',
  'simcenter_overlay',
  'session_state.json'
);

export interface SessionState {
  clientName: string;
  endTime: number;
  sessionId: string;
}

export async function writeSessionState(state: SessionState): Promise<void> {
  await fs.ensureDir(path.dirname(stateFilePath));
  await fs.writeJson(stateFilePath, state, { spaces: 2 });
  console.log(`État session écrit: ${stateFilePath}`);
}

export async function clearSessionState(): Promise<void> {
  if (await fs.pathExists(stateFilePath)) {
    await fs.writeJson(stateFilePath, { clientName: '', endTime: 0, sessionId: '' });
  }
}
