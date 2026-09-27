import { z } from 'zod';

export const ProcessInfoSchema = z.object({
  pid: z.number().int(),
  ppid: z.number().int(),
  uid: z.number().int(),
  user: z.string(),
  cpuPct: z.number(),
  memPct: z.number(),
  rssBytes: z.number(),
  vszBytes: z.number(),
  /** Estado bruto do `ps` (ex.: `Ss`, `R+`, `Z`). */
  state: z.string(),
  elapsedSec: z.number(),
  /** Início aproximado (epoch ms), derivado de `etime`. */
  startedAt: z.number(),
  /** Nome curto (basename do executável). */
  name: z.string(),
  /** Caminho do executável (`comm`). */
  path: z.string(),
  /** Linha de comando completa (`args`). */
  command: z.string(),
});

export const ProcessListSchema = z.object({
  ts: z.number(),
  /** PID do próprio servidor macpit. */
  selfPid: z.number().int(),
  processes: z.array(ProcessInfoSchema),
});

export const OpenFileKindSchema = z.enum(['stdout', 'stderr', 'file', 'network', 'cwd', 'other']);

export const OpenFileSchema = z.object({
  fd: z.string(),
  /** Tipo do lsof (REG, DIR, IPv4, IPv6, CHR, unix…). */
  type: z.string(),
  /** r, w ou u (leitura/escrita), quando houver. */
  access: z.string().optional(),
  name: z.string(),
  kind: OpenFileKindSchema,
  /** Arquivo regular que pode ser acompanhado (tail). */
  tailable: z.boolean(),
  /** Parece um log: stdout/stderr redirecionado, extensão .log/.out/.err ou pasta log(s). */
  looksLikeLog: z.boolean(),
});

export const ProcessDetailSchema = z.object({
  process: ProcessInfoSchema,
  parent: ProcessInfoSchema.optional(),
  children: z.array(ProcessInfoSchema),
  files: z.array(OpenFileSchema),
  /** Motivo de `files` vazio/incompleto (ex.: sem permissão). */
  filesError: z.string().optional(),
});

export const KillSignalSchema = z.enum(['TERM', 'KILL', 'INT', 'HUP']);

export const KillRequestSchema = z.object({ signal: KillSignalSchema.default('TERM') });

export const KillResultSchema = z.object({ ok: z.literal(true), pid: z.number().int(), signal: KillSignalSchema });

export const PidParamSchema = z.object({ pid: z.coerce.number().int().positive() });

export const TailCreateSchema = z.object({
  pid: z.number().int().positive(),
  path: z.string().min(1).max(4096),
});

export const TailCreatedSchema = z.object({ id: z.string(), channel: z.string(), path: z.string() });

export const TailChunkSchema = z.object({
  /** Texto novo. Com `reset`, substitui tudo o que já foi exibido. */
  chunk: z.string(),
  reset: z.boolean(),
  /** Arquivo foi truncado/rotacionado. */
  truncated: z.boolean().optional(),
});

export type ProcessInfo = z.infer<typeof ProcessInfoSchema>;
export type ProcessList = z.infer<typeof ProcessListSchema>;
export type OpenFile = z.infer<typeof OpenFileSchema>;
export type OpenFileKind = z.infer<typeof OpenFileKindSchema>;
export type ProcessDetail = z.infer<typeof ProcessDetailSchema>;
export type KillSignal = z.infer<typeof KillSignalSchema>;
export type KillRequest = z.infer<typeof KillRequestSchema>;
export type KillResult = z.infer<typeof KillResultSchema>;
export type TailCreate = z.infer<typeof TailCreateSchema>;
export type TailCreated = z.infer<typeof TailCreatedSchema>;
export type TailChunk = z.infer<typeof TailChunkSchema>;

export const tailChannel = (id: string) => `tail:${id}`;
