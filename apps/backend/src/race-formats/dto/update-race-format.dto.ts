import { z } from 'zod';
import { raceFormatShape } from './create-race-format.dto';

export const updateRaceFormatSchema = z.object(raceFormatShape).partial();

export type UpdateRaceFormatDto = z.infer<typeof updateRaceFormatSchema>;
