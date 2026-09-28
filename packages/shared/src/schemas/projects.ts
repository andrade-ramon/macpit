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

/** Atalho persistido para a visão ao vivo; não guarda comandos, métricas ou segredos. */
export const SavedPanelSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  repoPath: z.string().min(1).max(4096),
  savedAt: z.number(),
});
export const SavedPanelsSchema = z.array(SavedPanelSchema).max(200);
export const SavePanelSchema = z.object({ repoId: z.string().min(1).max(64) });
export const PanelSchema = SavedPanelSchema.extend({ available: z.boolean() });
export type SavedPanel = z.infer<typeof SavedPanelSchema>;
export type Panel = z.infer<typeof PanelSchema>;
