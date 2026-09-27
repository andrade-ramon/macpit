import type { FastifyInstance } from 'fastify';
import type { Health } from '@macpit/shared';
import type { SystemService } from './service.js';

export function systemRoutes(
  app: FastifyInstance,
  deps: { health: () => Health; system: SystemService; sampleIntervalMs: number },
): void {
  app.get('/api/health', async () => deps.health());
  app.get('/api/system', async () => deps.system.overview(deps.sampleIntervalMs));
}
