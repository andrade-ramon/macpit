import type { FastifyInstance } from 'fastify';
import { IdParamSchema, SavePanelSchema } from '@macpit/shared';
import { parseOr400 } from '../../lib/http.js';
import type { PanelService } from './service.js';

export function panelRoutes(app: FastifyInstance, panels: PanelService): void {
  app.get('/api/panels', async () => panels.list());
  app.post('/api/panels', async (req) => panels.save(parseOr400(SavePanelSchema, req.body).repoId));
  app.delete('/api/panels/:id', async (req, reply) => {
    panels.remove(parseOr400(IdParamSchema, req.params).id);
    return reply.code(204).send();
  });
}
