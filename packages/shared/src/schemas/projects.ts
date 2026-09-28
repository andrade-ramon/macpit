import { z } from 'zod';
import { ActionSchema, RunSchema } from './actions.js';
import { PortEntrySchema } from './ports.js';
import { RepoSchema } from './repos.js';

export const ProjectOverviewSchema = z.object({
  repo: RepoSchema,
  actions: z.array(z.object({ action: ActionSchema, busyElsewhere: z.boolean() })),
  /** Até 50 recentes, mais todas as execuções ativas do projeto. */
  runs: z.array(RunSchema),
  ports: z.array(PortEntrySchema),
  portsLimited: z.boolean(),
  warnings: z.array(z.string()),
});

export type ProjectOverview = z.infer<typeof ProjectOverviewSchema>;
