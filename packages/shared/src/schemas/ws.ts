import { z } from 'zod';

/** Nomes de canal: letras, números, `-`, `_` e `:` (ex.: `processes`, `run:abc123`). */
export const ChannelNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9_:-]+$/i);

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribe'), channel: ChannelNameSchema }),
  z.object({ type: z.literal('unsubscribe'), channel: ChannelNameSchema }),
  /** Teclas digitadas no terminal de uma execução. */
  z.object({ type: z.literal('run:input'), runId: z.string().min(1).max(64), data: z.string().max(64 * 1024) }),
  z.object({
    type: z.literal('run:resize'),
    runId: z.string().min(1).max(64),
    cols: z.number().int().min(10).max(500),
    rows: z.number().int().min(5).max(200),
  }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export type ServerMessage =
  | { type: 'subscribed'; channel: string }
  | { type: 'unsubscribed'; channel: string }
  | { type: 'snapshot'; channel: string; data: unknown }
  | { type: 'error'; message: string; channel?: string };

/** Canais conhecidos. Cresce a cada fase. */
export const Channels = {
  health: 'health',
  system: 'system',
  processes: 'processes',
  ports: 'ports',
  disk: 'disk',
} as const;
