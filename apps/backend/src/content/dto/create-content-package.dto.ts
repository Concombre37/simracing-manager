import { z } from 'zod';

export const createContentPackageSchema = z.object({
  type: z.enum(['car', 'track', 'app']),
  name: z.string().min(1),
  version: z.string().min(1),
  archiveUrl: z.string().url(),
  checksum: z.string().optional(),
  isRequired: z.boolean().default(true),
});

export type CreateContentPackageDto = z.infer<
  typeof createContentPackageSchema
>;
