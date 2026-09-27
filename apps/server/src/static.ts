import fs from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import type { Config } from './config/index.js';

/** Caminho com extensão de arquivo (`/assets/x.js`, `/favicon.svg`): é um asset, não uma rota do front. */
const looksLikeFile = (pathname: string) => /\.[a-z0-9]+$/i.test(path.posix.basename(pathname));

/**
 * Em produção, serve o build do web (SPA) e responde index.html para rotas do front.
 * `wildcard: true` busca no disco a cada requisição, então um `pnpm build` com o servidor no ar
 * funciona sem reiniciar (os nomes dos chunks mudam a cada build).
 */
export async function registerStatic(app: FastifyInstance, config: Config): Promise<boolean> {
  const hasDist = fs.existsSync(path.join(config.webDist, 'index.html'));
  if (hasDist) await app.register(fastifyStatic, { root: config.webDist, wildcard: true });

  app.setNotFoundHandler((req, reply) => {
    const pathname = req.url.split('?')[0] ?? '';
    if (
      !hasDist ||
      req.method !== 'GET' ||
      pathname.startsWith('/api') ||
      pathname === '/ws' ||
      // asset inexistente: 404 de verdade (servir index.html como JS quebra a página)
      looksLikeFile(pathname)
    ) {
      return reply.code(404).send({ error: 'não encontrado' });
    }
    return reply.header('cache-control', 'no-cache').sendFile('index.html');
  });
  return hasDist;
}
