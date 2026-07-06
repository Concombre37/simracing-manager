import { z } from 'zod';

export const updateSettingsSchema = z.object({
  blankingDelaySeconds: z.number().int().min(0).max(120),
});

export type UpdateSettingsDto = z.infer<typeof updateSettingsSchema>;
