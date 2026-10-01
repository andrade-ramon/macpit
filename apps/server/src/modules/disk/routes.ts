import type { FastifyInstance } from 'fastify';
import {
  CleanupScanSchema,
  CleanupExecuteSchema,
  CleanupOpenSchema,
  DiskHistoryQuerySchema,
  DiskSettingsSchema,
  DiskUsageQuerySchema,
} from '@macpit/shared';
import { parseOr400 } from '../../lib/http.js';
import type { DiskService } from './service.js';
import type { DiskUsageService } from './usage.js';
import type { CleanupService } from './cleanup.js';

export function diskRoutes(
  app: FastifyInstance,
  deps: { disk: DiskService; usage: DiskUsageService; cleanup: CleanupService },
): void {
  const { disk, usage } = deps;

  app.post('/api/disk/cleanup/scan', async (req, reply) => {
    const { path, maxFiles, minFileBytes } = parseOr400(CleanupScanSchema, req.body);
    const abort = new AbortController();
    const cancel = () => {
      if (!reply.raw.writableEnded) abort.abort();
    };
    reply.raw.on('close', cancel);
    reply.header('Cache-Control', 'no-store');
    try {
      return await deps.cleanup.scan(path, abort.signal, maxFiles, minFileBytes);
    } finally {
      reply.raw.off('close', cancel);
    }
  });
  app.post('/api/disk/cleanup/execute', async (req, reply) => {
    const { planId, fileIds } = parseOr400(CleanupExecuteSchema, req.body);
    reply.header('Cache-Control', 'no-store');
    const result = await deps.cleanup.execute(planId, fileIds);
    usage.invalidate();
    return result;
  });
  app.post('/api/disk/cleanup/open', async (req, reply) => {
    const { planId, fileId } = parseOr400(CleanupOpenSchema, req.body);
    await deps.cleanup.open(planId, fileId);
    return reply.code(204).send();
  });

  app.get('/api/disk', async () => disk.overview());

  app.get('/api/disk/history', async (req) => {
    const { mount, range } = parseOr400(DiskHistoryQuerySchema, req.query);
    return disk.history(mount, range);
  });

  app.put('/api/disk/settings', async (req) => disk.updateSettings(parseOr400(DiskSettingsSchema, req.body)));

  app.get('/api/disk/usage', async (req) => {
    const { path, refresh } = parseOr400(DiskUsageQuerySchema, req.query);
    return usage.usage(path, refresh);
  });
}
