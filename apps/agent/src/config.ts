import { z } from 'zod';
import { LaunchMode, ScreenMode, AssistPreset } from '@simracing/shared';
import 'dotenv/config';

const configSchema = z.object({
  SERVER_URL: z.string().url().default('http://localhost:3000'),
  STATION_ID: z.string().min(1).default('poste-1'),
  STATION_NAME: z.string().min(1).default('Poste 1'),
  API_KEY: z.string().min(1),
  AC_PATH: z.string().optional(),
  CM_PATH: z.string().optional(),
  DOCUMENTS_PATH: z.string().optional(),
  LAUNCH_MODE: z.nativeEnum(LaunchMode).default(LaunchMode.CONTENT_MANAGER),
  SCREEN_MODE: z.nativeEnum(ScreenMode).default(ScreenMode.SINGLE),
  ASSIST_PRESET: z.nativeEnum(AssistPreset).default(AssistPreset.PRO),
  AUTO_MAP_AC_CONTROLS: z.coerce.boolean().default(true),
  AUTO_DRIVE_HELPER: z.coerce.boolean().default(true),
});

export const config = configSchema.parse(process.env);
