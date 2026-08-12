import { z } from 'zod';

export const upsertContentLabelSchema = z.object({
  type: z.enum(['car', 'track']),
  acId: z.string().min(1),
  displayName: z.string().trim().max(120),
  category: z.string().trim().max(60).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  country: z.string().trim().max(80).optional(),
  countryCode: z
    .string()
    .trim()
    .length(2)
    .regex(/^[A-Za-z]{2}$/)
    .toUpperCase()
    .optional(),
  description: z.string().trim().max(500).optional(),
  powerHp: z.number().int().min(1).max(20000).optional(),
  weightKg: z.number().int().min(1).max(20000).optional(),
  mirrored: z.boolean().optional(),
});

export type UpsertContentLabelDto = z.infer<typeof upsertContentLabelSchema>;
