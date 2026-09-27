import { z } from 'zod';

export const CpuSampleSchema = z.object({
  /** % de uso total (user + system), 0–100. */
  usagePct: z.number(),
  userPct: z.number(),
  systemPct: z.number(),
  cores: z.number().int(),
  model: z.string(),
});

export const MemorySampleSchema = z.object({
  totalBytes: z.number(),
  /** Usada = app + wired + comprimida (mesma definição do Monitor de Atividade). */
  usedBytes: z.number(),
  appBytes: z.number(),
  wiredBytes: z.number(),
  compressedBytes: z.number(),
  /** Arquivos em cache (file-backed + purgeable): reaproveitável pelo sistema. */
  cachedBytes: z.number(),
  freeBytes: z.number(),
  usedPct: z.number(),
});

export const SwapSampleSchema = z.object({
  totalBytes: z.number(),
  usedBytes: z.number(),
});

export const SystemSampleSchema = z.object({
  ts: z.number(),
  cpu: CpuSampleSchema,
  /** Load average de 1, 5 e 15 minutos. */
  load: z.tuple([z.number(), z.number(), z.number()]),
  memory: MemorySampleSchema,
  swap: SwapSampleSchema,
  uptimeSec: z.number(),
});

export const SystemOverviewSchema = z.object({
  current: SystemSampleSchema,
  /** Amostras recentes (janela de 5 min), da mais antiga para a mais nova. */
  history: z.array(SystemSampleSchema),
});

export type CpuSample = z.infer<typeof CpuSampleSchema>;
export type MemorySample = z.infer<typeof MemorySampleSchema>;
export type SwapSample = z.infer<typeof SwapSampleSchema>;
export type SystemSample = z.infer<typeof SystemSampleSchema>;
export type SystemOverview = z.infer<typeof SystemOverviewSchema>;

export const SYSTEM_HISTORY_WINDOW_MS = 5 * 60 * 1000;
