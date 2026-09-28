import { z } from 'zod';

export const ServerStatusSchema = z.object({
  instanceId: z.string(),
  pid: z.number().int(),
  canRestart: z.boolean(),
  restarting: z.boolean(),
  activeRuns: z.number().int().nonnegative(),
  error: z.string().nullable(),
});
export const ServerRestartSchema = z.object({ confirm: z.literal(true) }).strict();
export type ServerStatus = z.infer<typeof ServerStatusSchema>;
