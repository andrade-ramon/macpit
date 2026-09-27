import { z } from 'zod';

export const HealthSchema = z.object({
  ok: z.literal(true),
  version: z.string(),
  user: z.string(),
  isRoot: z.boolean(),
  hostname: z.string(),
  platform: z.string(),
  pid: z.number().int(),
  uptimeSec: z.number(),
  sampleIntervalMs: z.number().int(),
});

export type Health = z.infer<typeof HealthSchema>;
