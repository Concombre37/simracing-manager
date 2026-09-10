import { z } from 'zod';

export const updateSettingsSchema = z.object({
  blankingDelaySeconds: z.number().int().min(0).max(120),
  tabletIdleSeconds: z.number().int().min(5).max(3600).optional(),
});

export type UpdateSettingsDto = z.infer<typeof updateSettingsSchema>;
