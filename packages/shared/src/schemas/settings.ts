import { z } from 'zod';

export const NotificationSettingsSchema = z.object({
  enabled: z.boolean(),
  /** Execuções: nenhuma, só falhas, ou todas as que terminarem. */
  runs: z.enum(['none', 'failures', 'all']),
  /** Serviço caiu, ficou sem resposta, reiniciou ou voltou. */
  services: z.boolean(),
  /** Volume passou do limite de alerta. */
  disk: z.boolean(),
});

export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  runs: 'failures',
  services: true,
  disk: true,
};
