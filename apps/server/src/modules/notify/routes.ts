import type { FastifyInstance } from 'fastify';
import { NotificationSettingsSchema } from '@macpit/shared';
import { HttpError, parseOr400 } from '../../lib/http.js';
import type { Notifier } from './notifier.js';

export function notifyRoutes(app: FastifyInstance, deps: { notifier: Notifier }): void {
  const { notifier } = deps;

  app.get('/api/settings/notifications', async () => notifier.settings());

  app.put('/api/settings/notifications', async (req) =>
    notifier.update(parseOr400(NotificationSettingsSchema, req.body)),
  );

  app.post('/api/settings/notifications/test', async () => {
    try {
      await notifier.test();
      return { ok: true };
    } catch (err) {
      throw new HttpError(
        502,
        `não foi possível notificar: ${err instanceof Error ? err.message : String(err)}`,
        'notify_failed',
      );
    }
  });
}
