import { z } from 'zod';

export const PortBindingSchema = z.object({
  /** `*` (todas as interfaces), `127.0.0.1`, `::1`, `fe80::1%lo0`… */
  address: z.string(),
  family: z.enum(['IPv4', 'IPv6']),
});

export const PortEntrySchema = z.object({
  protocol: z.enum(['TCP', 'UDP']),
  port: z.number().int(),
  pid: z.number().int(),
  /** Nome do processo segundo o lsof (completo, `+c 0`). */
  command: z.string(),
  user: z.string(),
  uid: z.number().int(),
  /** Endereços em que o processo escuta nessa porta (IPv4/IPv6 agrupados). */
  bindings: z.array(PortBindingSchema),
  /** `local` = só loopback; `network` = acessível de outras máquinas. */
  scope: z.enum(['local', 'network']),
  /** Linha de comando completa (do snapshot de processos), se disponível. */
  commandLine: z.string().optional(),
});

export const PortListSchema = z.object({
  ts: z.number(),
  entries: z.array(PortEntrySchema),
  /** Servidor sem root: o lsof só enxerga processos do próprio usuário. */
  limited: z.boolean(),
});

export type PortBinding = z.infer<typeof PortBindingSchema>;
export type PortEntry = z.infer<typeof PortEntrySchema>;
export type PortList = z.infer<typeof PortListSchema>;
