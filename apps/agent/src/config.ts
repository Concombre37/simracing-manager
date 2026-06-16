import { z } from 'zod';
import { LaunchMode, ScreenMode, AssistPreset } from '@simracing/shared';
import dotenv from 'dotenv';
import path from 'path';
import { existsSync, writeFileSync } from 'fs';
import { VERSION } from './version';

// Load .env from the same directory as the executable.
const baseDir = path.dirname(process.execPath);
const envPath = path.join(baseDir, '.env');

// If no .env exists, create a default one so the agent can start and auto-provision.
if (!existsSync(envPath)) {
  const defaultEnv = [
    '# Configuration SimRacing Manager Agent',
    '# Généré automatiquement - modifiez selon votre installation',
    '',
    'SERVER_URL=https://simracing.hytlabs.com',
    `STATION_ID=${getComputerName()}`,
    `STATION_NAME=${getComputerName()}`,
    '',
    "# Clé API (laisser vide pour l'auto-provisioning)",
    'API_KEY=',
    '',
    '# Chemins Windows (décommenter et adapter si la détection automatique échoue)',
    '# AC_PATH=C:\\\\Program Files (x86)\\\\Steam\\\\steamapps\\\\common\\\\assettocorsa',
    '# CM_PATH=C:\\\\Program Files\\\\Content Manager',
    '# DOCUMENTS_PATH=C:\\\\Users\\\\%USERNAME%\\\\Documents',
    '',
    '# Mode de lancement : cm (Content Manager) ou ac (Assetto Corsa direct)',
    'LAUNCH_MODE=cm',
    '',
    '# Écran : single, triple, vr',
    'SCREEN_MODE=single',
    '',
    '# Assists : easy, pro, custom',
    'ASSIST_PRESET=pro',
    '',
    '# Helpers',
    'AUTO_MAP_AC_CONTROLS=1',
    'AUTO_DRIVE_HELPER=1',
    '',
  ].join('\n');

  try {
    writeFileSync(envPath, defaultEnv, 'utf-8');
  } catch {
    // Ignore write errors (e.g. read-only location).
  }
}

dotenv.config({ path: envPath });

const configSchema = z.object({
  VERSION: z.string().default(VERSION),
  SERVER_URL: z.string().url().default('https://simracing.hytlabs.com'),
  STATION_ID: z.string().min(1).default(getComputerName()),
  STATION_NAME: z.string().min(1).default(getComputerName()),
  API_KEY: z.string().optional(),
  AC_PATH: z
    .string()
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  CM_PATH: z
    .string()
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  DOCUMENTS_PATH: z
    .string()
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  LAUNCH_MODE: z.nativeEnum(LaunchMode).default(LaunchMode.CONTENT_MANAGER),
  SCREEN_MODE: z.nativeEnum(ScreenMode).default(ScreenMode.SINGLE),
  ASSIST_PRESET: z.nativeEnum(AssistPreset).default(AssistPreset.PRO),
  AUTO_MAP_AC_CONTROLS: z.coerce.boolean().default(true),
  AUTO_DRIVE_HELPER: z.coerce.boolean().default(true),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => {
    const path = issue.path.join('.');
    return `  - ${path}: ${issue.message}`;
  });

  throw new Error(
    `Configuration invalide. Vérifie le fichier .env à côté de l'exécutable (${envPath}).\n\nErreurs:\n${issues.join(
      '\n',
    )}`,
  );
}

export const config = parsed.data;

function getComputerName(): string {
  if (process.platform === 'win32') {
    return process.env.COMPUTERNAME?.toLowerCase() || 'poste';
  }
  return process.env.HOSTNAME?.toLowerCase() || 'poste';
}
