import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { ActionsExport, ActionsImportResult } from '@macpit/shared';
import {
  ActionsImportSchema,
  IdParamSchema,
  RunListQuerySchema,
  RunStartSchema,
  ServiceStopSchema,
} from '@macpit/shared';
import { HttpError, parseOr400 } from '../../lib/http.js';
import type { RunManager } from '../runs/manager.js';
import { publicRun, type RunStore } from '../runs/store.js';
import type { RepoService } from '../repos/service.js';
import type { ServiceSupervisor } from '../services/supervisor.js';
import { readShellEntries, type ShellImportDeps } from './shellImport.js';
import { ActionStore } from './store.js';

export function actionRoutes(
  app: FastifyInstance,
  deps: {
    actions: ActionStore;
    runs: RunStore;
    manager: RunManager;
    supervisor: ServiceSupervisor;
    repos?: RepoService;
    shellImport?: () => ShellImportDeps;
  },
): void {
  const { actions, runs, manager, supervisor } = deps;

  app.get('/api/actions', async () => actions.list());

  // A validação (incluindo o template {{parâmetros}}) acontece no store: 400 com a mensagem.
  app.post('/api/actions', async (req, reply) => reply.code(201).send(actions.create(req.body)));

  // Exportar/importar ficam antes de `/:id` só por clareza (o Fastify prioriza rotas estáticas).
  app.get('/api/actions/export', async (_req, reply) => {
    const body: ActionsExport = {
      format: 'macpit/actions',
      version: 1,
      exportedAt: new Date().toISOString(),
      actions: actions.list().map((a) => ActionStore.toInput(a)),
    };
    const date = body.exportedAt.slice(0, 10);
    return reply.header('content-disposition', `attachment; filename="macpit-acoes-${date}.json"`).send(body);
  });

  app.post('/api/actions/import', async (req) => {
    const { actions: items, onConflict } = parseOr400(ActionsImportSchema, req.body);
    const result: ActionsImportResult = { created: 0, skipped: [] };
    for (const item of items) {
      const name =
        typeof (item as { name?: unknown })?.name === 'string' ? (item as { name: string }).name : '(sem nome)';
      if (onConflict === 'skip' && actions.existsByName(name)) {
        result.skipped.push({ name, reason: 'já existe uma ação com esse nome' });
        continue;
      }
      try {
        actions.create(item);
        result.created++;
      } catch (err) {
        result.skipped.push({ name, reason: err instanceof HttpError ? err.message : 'inválida' });
      }
    }
    return result;
  });

  // Executa o shell interativo do usuário (lê o rc) só para listar aliases/funções: POST, não GET.
  app.post('/api/import/shell', async () => readShellEntries(deps.shellImport?.()));

  app.get('/api/actions/:id', async (req) => actions.get(parseOr400(IdParamSchema, req.params).id));

  app.put('/api/actions/:id', async (req) => {
    const { id } = parseOr400(IdParamSchema, req.params);
    return actions.update(id, req.body);
  });

  app.delete('/api/actions/:id', async (req, reply) => {
    const { id } = parseOr400(IdParamSchema, req.params);
    supervisor.forget(id);
    actions.delete(id);
    return reply.code(204).send();
  });

  // Serviços passam pelo supervisor (health-check e reinício); as demais direto pelo executor.
  app.post('/api/actions/:id/run', async (req, reply) => {
    const action = actions.get(parseOr400(IdParamSchema, req.params).id);
    const { cols, rows, params } = parseOr400(RunStartSchema, req.body ?? {});
    if (action.params.some((p) => p.type === 'repo')) await deps.repos?.ensureScanned();
    const run = action.persistent
      ? supervisor.start(action, { cols, rows }, params)
      : manager.start(action, { cols, rows, params });
    return reply.code(201).send(run);
  });

  /** Para o serviço: encerra a execução e cancela reinício pendente. */
  app.post('/api/actions/:id/stop', async (req) => {
    const action = actions.get(parseOr400(IdParamSchema, req.params).id);
    if (!action.persistent) throw new HttpError(400, 'a ação não é um serviço; pare a execução', 'not_service');
    const { repoPath } = parseOr400(ServiceStopSchema, req.body ?? {});
    if (repoPath !== undefined) {
      const current = action.service?.runId ? runs.get(action.service.runId) : undefined;
      if (current?.repoPath !== repoPath) {
        throw new HttpError(
          409,
          'o serviço mudou de projeto; atualize o painel antes de parar',
          'service_project_conflict',
        );
      }
    }
    supervisor.stop(action.id);
    return actions.get(action.id);
  });

  app.get('/api/runs', async (req) => {
    const q = parseOr400(RunListQuerySchema, req.query);
    return runs.list(q.actionId ? { actionId: q.actionId, limit: q.limit } : { limit: q.limit }).map(publicRun);
  });

  app.get('/api/runs/:id', async (req) => manager.get(parseOr400(IdParamSchema, req.params).id));

  // Log bruto (com sequências ANSI), como texto.
  app.get('/api/runs/:id/log', async (req, reply) => {
    const file = manager.logFile(parseOr400(IdParamSchema, req.params).id);
    if (!fs.existsSync(file)) return reply.type('text/plain; charset=utf-8').send('');
    return reply.type('text/plain; charset=utf-8').send(fs.createReadStream(file));
  });

  app.post('/api/runs/:id/stop', async (req) => manager.stop(parseOr400(IdParamSchema, req.params).id));
}
