import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AiCredentialSchema, AiDraftRequestSchema, AiSettingsSchema } from '@macpit/shared';
import { HttpError, parseOr400 } from '../../lib/http.js';
import type { AiService } from './service.js';

const EmptySchema = z.strictObject({});

export function aiRoutes(app: FastifyInstance, service: AiService) {
  // Escopo isolado: nunca cachear configuração/rascunhos, nem depender do service worker para isso.
  app.register(async (scope) => {
    scope.addHook('onRequest', async (_req, reply) => {
      reply.header('cache-control', 'no-store');
    });
    scope.get('/api/ai/settings', async () => service.settings());
    scope.put('/api/ai/settings', async (req) => service.configure(parseOr400(AiSettingsSchema, req.body)));
    scope.put('/api/ai/credential', async (req) => {
      const parsed = AiCredentialSchema.safeParse(req.body);
      if (!parsed.success)
        throw new HttpError(400, 'credencial inválida; confira provedor, chave e armazenamento', 'invalid_request');
      return service.setCredential(parsed.data);
    });
    scope.delete('/api/ai/credential', async () => service.removeCredential());

    async function generate(req: FastifyRequest, reply: FastifyReply, test: boolean) {
      if (test) parseOr400(EmptySchema, req.body ?? {});
      const { provider, model } = service.settings();
      const request = test
        ? {
            configuration: { provider, model },
            prompt:
              'Teste de conexão. Prepare uma ação chamada Teste de IA com comando pwd, sem parâmetros, sem serviço. Não execute nada.',
            history: [],
          }
        : parseOr400(AiDraftRequestSchema, req.body);
      const controller = new AbortController();
      const onClose = () => {
        if (!reply.raw.writableEnded) controller.abort();
      };
      reply.raw.on('close', onClose);
      try {
        const response = await service.draft(request, controller.signal, test ? 'test' : 'draft');
        if (test && response.result.status !== 'draft')
          throw new HttpError(502, 'o modelo não produziu o rascunho de teste esperado', 'ai_invalid_response');
        return test ? { ok: true, usage: response.usage } : response;
      } finally {
        reply.raw.off('close', onClose);
      }
    }
    scope.post('/api/ai/test', { bodyLimit: 1024 }, (req, reply) => generate(req, reply, true));
    scope.post('/api/ai/drafts', { bodyLimit: 192 * 1024 }, (req, reply) => generate(req, reply, false));
  });
}
