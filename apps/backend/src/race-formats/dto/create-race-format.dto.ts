import { z } from 'zod';
import { RaceMode, GridType } from '@simracing/shared';

export const raceFormatShape = {
  name: z.string().min(1).max(128),
  description: z.string().max(500).optional(),
  practiceEnabled: z.boolean().default(true),
  practiceMinutes: z.number().int().min(1).max(1440).default(720),
  qualifyingEnabled: z.boolean().default(false),
  qualifyingMinutes: z.number().int().min(1).max(180).default(15),
  raceEnabled: z.boolean().default(false),
  raceMode: z.nativeEnum(RaceMode).default(RaceMode.LAPS),
  raceLaps: z.number().int().min(1).max(500).default(5),
  raceMinutes: z.number().int().min(1).max(360).default(20),
  gridType: z.nativeEnum(GridType).default(GridType.NORMAL),
  weatherGraphics: z.array(z.string().min(1)).min(1).default(['3_clear']),
};

// At least one session must be enabled — acServer.exe needs at least one of
// [PRACTICE]/[QUALIFY]/[RACE] present to start at all. Only enforced here
// (create, full payload) — the update DTO allows partial payloads, so the
// same invariant is instead checked service-side against the merged result.
export const createRaceFormatSchema = z
  .object(raceFormatShape)
  .refine(
    (dto) => dto.practiceEnabled || dto.qualifyingEnabled || dto.raceEnabled,
    {
      message:
        'Au moins une session (Practice, Qualifying ou Race) doit être activée',
      path: ['practiceEnabled'],
    },
  );

export type CreateRaceFormatDto = z.infer<typeof createRaceFormatSchema>;
