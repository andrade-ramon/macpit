import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { ServerRestartSchema, type ServerStatus } from '@macpit/shared';
import type { Audit } from '../../lib/audit.js';
import { HttpError, parseOr400 } from '../../lib/http.js';
import type { RunManager } from '../runs/manager.js';

export interface RestartDeps {
  /** Verifica se os arquivos necessários ainda estão acessíveis antes de aceitar. */
  prepare: () => void;
  /** Encerra o app e substitui o processo pelo mesmo executável/argv, sem shell. */
  restart: () => Promise<void>;
}

export function lifecycleRoutes(app: FastifyInstance, manager: RunManager, audit: Audit, deps?: RestartDeps): void {
  const instanceId = randomUUID();
  let restarting = false;
  let error: string | null = null;
  let timer: NodeJS.Timeout | undefined;
  const status = (): ServerStatus => ({
    instanceId,
    pid: process.pid,
    canRestart: Boolean(deps),
    restarting,
    activeRuns: manager.runningIds().length,
    error,
  });

  app.get('/api/server', async () => status());
  app.post('/api/server/restart', async (req, reply) => {
    parseOr400(ServerRestartSchema, req.body);
    if (!deps)
      throw new HttpError(
        503,
        'reinício disponível ao executar o build com Node compatível; no modo dev, reinicie pelo terminal',
        'restart_unavailable',
      );
    if (restarting) throw new HttpError(409, 'o macpit já está reiniciando', 'already_restarting');
    deps.prepare();
    audit('restart', 'macpit', { activeRuns: manager.runningIds().length });
    restarting = true;
    error = null;
    let sent = false;
    // Só fecha conexões depois que a resposta de aceite foi enviada ao navegador.
    reply.raw.once('finish', () => {
      sent = true;
      timer = setTimeout(() => {
        timer = undefined;
        void deps.restart().catch((err: unknown) => {
          restarting = false;
          error = 'Não foi possível reiniciar o macpit. Verifique o servidor no terminal.';
          app.log.error({ err }, 'falha ao reiniciar macpit');
        });
      }, 250);
      timer.unref();
    });
    reply.raw.once('close', () => {
      if (!sent) restarting = false;
    });
    return reply.code(202).send(status());
  });
  app.addHook('onClose', async () => {
    if (timer) clearTimeout(timer);
  });
}
