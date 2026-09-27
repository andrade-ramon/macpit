import type { FastifyInstance } from 'fastify';
import { DiskHistoryQuerySchema, DiskSettingsSchema, DiskUsageQuerySchema } from '@macpit/shared';
import { parseOr400 } from '../../lib/http.js';
import type { DiskService } from './service.js';
import type { DiskUsageService } from './usage.js';

export function diskRoutes(app: FastifyInstance, deps: { disk: DiskService; usage: DiskUsageService }): void {
  const { disk, usage } = deps;

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
