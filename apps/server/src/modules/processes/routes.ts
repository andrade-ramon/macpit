import type { FastifyInstance } from 'fastify';
import { KillRequestSchema, PidParamSchema, TailCreateSchema } from '@macpit/shared';
import { parseOr400 } from '../../lib/http.js';
import type { TailService } from '../logs/tail.js';
import type { ProcessService } from './service.js';

export function processRoutes(
  app: FastifyInstance,
  deps: { processes: ProcessService; tails: TailService; sampleIntervalMs: number },
): void {
  const { processes, tails, sampleIntervalMs } = deps;

  app.get('/api/processes', async () => processes.snapshot(sampleIntervalMs));

  app.get('/api/processes/:pid', async (req) => {
    const { pid } = parseOr400(PidParamSchema, req.params);
    return processes.detail(pid, sampleIntervalMs);
  });

  app.post('/api/processes/:pid/kill', async (req) => {
    const { pid } = parseOr400(PidParamSchema, req.params);
    const { signal } = parseOr400(KillRequestSchema, req.body ?? {});
    return processes.kill(pid, signal);
  });

  app.post('/api/tails', async (req, reply) => {
    const { pid, path } = parseOr400(TailCreateSchema, req.body);
    return reply.code(201).send(await tails.create(pid, path));
  });
}
