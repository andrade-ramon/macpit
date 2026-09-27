import { z } from 'zod';

export const DiskSettingsSchema = z.object({
  /** % de uso a partir do qual o volume fica em alerta. */
  alertPct: z.number().int().min(50).max(99),
});

export const DEFAULT_DISK_SETTINGS: DiskSettings = { alertPct: 90 };

export const DiskVolumeSchema = z.object({
  mount: z.string(),
  filesystem: z.string(),
  /** Nome amigável (ex.: `Disco do sistema`, `Backup`). */
  name: z.string(),
  totalBytes: z.number(),
  /** Usado = total − disponível (como o Finder; no APFS inclui todos os volumes do contêiner). */
  usedBytes: z.number(),
  availableBytes: z.number(),
  usedPct: z.number(),
  alert: z.boolean(),
});

export const DiskOverviewSchema = z.object({
  ts: z.number(),
  volumes: z.array(DiskVolumeSchema),
  settings: DiskSettingsSchema,
});

export const DiskRangeSchema = z.enum(['24h', '7d', '30d']);

export const DiskHistoryQuerySchema = z.object({
  mount: z.string().min(1).max(1024),
  range: DiskRangeSchema.default('24h'),
});

export const DiskHistoryPointSchema = z.object({ ts: z.number(), usedBytes: z.number(), totalBytes: z.number() });

export const DiskHistorySchema = z.object({
  mount: z.string(),
  range: DiskRangeSchema,
  points: z.array(DiskHistoryPointSchema),
  /** Intervalo de gravação das amostras (ms). */
  sampleIntervalMs: z.number(),
});

export const DiskUsageQuerySchema = z.object({
  /** Caminho absoluto ou começando com `~`. */
  path: z.string().min(1).max(4096),
  /** Ignora o cache. */
  refresh: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .optional()
    .transform((v) => v === true || v === 'true' || v === '1'),
});

export const DiskUsageEntrySchema = z.object({ name: z.string(), path: z.string(), sizeBytes: z.number() });

export const DiskUsageSchema = z.object({
  path: z.string(),
  totalBytes: z.number(),
  /** Subpastas diretas, da maior para a menor. */
  entries: z.array(DiskUsageEntrySchema),
  /** Arquivos soltos diretamente na pasta (total − soma das subpastas). */
  looseBytes: z.number(),
  /** Algumas pastas não puderam ser lidas (sem permissão): totais são um mínimo. */
  partial: z.boolean(),
  durationMs: z.number(),
  computedAt: z.number(),
  cached: z.boolean(),
});

export type DiskSettings = z.infer<typeof DiskSettingsSchema>;
export type DiskVolume = z.infer<typeof DiskVolumeSchema>;
export type DiskOverview = z.infer<typeof DiskOverviewSchema>;
export type DiskRange = z.infer<typeof DiskRangeSchema>;
export type DiskHistoryPoint = z.infer<typeof DiskHistoryPointSchema>;
export type DiskHistory = z.infer<typeof DiskHistorySchema>;
export type DiskUsageEntry = z.infer<typeof DiskUsageEntrySchema>;
export type DiskUsage = z.infer<typeof DiskUsageSchema>;

export const DISK_RANGE_MS: Record<DiskRange, number> = {
  '24h': 24 * 3600_000,
  '7d': 7 * 24 * 3600_000,
  '30d': 30 * 24 * 3600_000,
};
