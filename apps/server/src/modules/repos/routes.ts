import type { FastifyInstance } from 'fastify';
import { IdParamSchema } from '@macpit/shared';
import { parseOr400 } from '../../lib/http.js';
import type { RepoService } from './service.js';

export function repoRoutes(app: FastifyInstance, deps: { repos: RepoService }): void {
  const { repos } = deps;

  app.get('/api/repos', async () => repos.listFresh());

  app.post('/api/repos/scan', async () => repos.scan());

  app.put('/api/repos/selection', async (req) => repos.setSelection(req.body));

  app.post('/api/repos/:id/open', async (req) => {
    await repos.open(parseOr400(IdParamSchema, req.params).id);
    return { ok: true };
  });

  app.put('/api/repos/:id/vars', async (req) => repos.setVars(parseOr400(IdParamSchema, req.params).id, req.body));

  app.get('/api/settings/repos', async () => repos.settings());

  app.put('/api/settings/repos', async (req) => repos.updateSettings(req.body));
}
