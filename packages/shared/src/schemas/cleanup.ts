import { z } from 'zod';

export const CLEANUP_DEFAULT_FILES = 10_000;
export const CLEANUP_MAX_FILES = 20_000;
export const CLEANUP_MAX_MIN_BYTES = 1_000_000_000_000;
export const CleanupScanSchema = z
  .object({
    path: z.string().min(1).max(4096),
    maxFiles: z.number().int().min(1).max(CLEANUP_MAX_FILES).default(CLEANUP_DEFAULT_FILES),
    minFileBytes: z.number().int().min(0).max(CLEANUP_MAX_MIN_BYTES).default(0),
  })
  .strict();
export const CleanupExecuteSchema = z
  .object({
    planId: z.uuid(),
    fileIds: z
      .array(z.uuid())
      .min(1)
      .max(500)
      .refine((ids) => new Set(ids).size === ids.length),
    confirm: z.literal(true),
  })
  .strict();
export const CleanupOpenSchema = z.object({ planId: z.uuid(), fileId: z.uuid() }).strict();
export interface CleanupFile {
  id: string;
  path: string;
  bytes: number;
  modifiedAt: number;
  category: 'cache' | 'manual';
  reason: string;
  impact: string;
}
export interface CleanupPlan {
  id: string;
  root: string;
  expiresAt: number;
  files: CleanupFile[];
  warnings: string[];
  partial: boolean;
}
export interface CleanupResult {
  items: Array<{ id: string; path: string; status: 'moved' | 'skipped' | 'failed'; message: string }>;
  movedBytes: number;
}
