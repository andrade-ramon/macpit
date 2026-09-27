import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../config/index.js';
import { tokensMatch } from './auth.js';

export const SESSION_COOKIE = 'macpit_session';
/** Cookie da época do bash-monitor: ainda aceito; a renovação deslizante grava o nome novo. */
const LEGACY_COOKIE = 'bm_session';
const sessionCookie = (req: FastifyRequest) => req.cookies[SESSION_COOKIE] ?? req.cookies[LEGACY_COOKIE];

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function allowedHosts(config: Config): Set<string> {
  const hosts = new Set([`127.0.0.1:${config.port}`, `localhost:${config.port}`]);
  if (config.webDevUrl) hosts.add(new URL(config.webDevUrl).host);
  return hosts;
}

export function allowedOrigins(config: Config): Set<string> {
  const origins = new Set([`http://127.0.0.1:${config.port}`, `http://localhost:${config.port}`]);
  if (config.webDevUrl) origins.add(new URL(config.webDevUrl).origin);
  return origins;
}

function isProtectedPath(url: string): boolean {
  const pathname = url.split('?')[0] ?? '';
  return pathname === '/ws' || pathname === '/api' || pathname.startsWith('/api/');
}

function readBearer(req: FastifyRequest): string | undefined {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
}

export function isAuthenticated(req: FastifyRequest, token: string): boolean {
  return tokensMatch(token, sessionCookie(req)) || tokensMatch(token, readBearer(req));
}

/**
 * Hook global de segurança (docs/05-seguranca.md):
 * 1. Host deve ser 127.0.0.1/localhost na porta do servidor (anti DNS rebinding).
 * 2. Origin, se presente, deve ser uma origem permitida; obrigatório em métodos que alteram estado e no upgrade WS.
 * 3. /api/* e /ws exigem cookie de sessão ou `Authorization: Bearer <token>`.
 */
export function registerSecurity(app: FastifyInstance, config: Config, token: string): void {
  const hosts = allowedHosts(config);
  const origins = allowedOrigins(config);

  const deny = (reply: FastifyReply, status: number, error: string) =>
    reply.code(status).header('cache-control', 'no-store').send({ error });

  app.addHook('onRequest', async (req, reply) => {
    const host = req.headers.host;
    if (!host || !hosts.has(host.toLowerCase())) return deny(reply, 421, 'host não permitido');

    const origin = req.headers.origin;
    const isUpgrade = req.headers.upgrade?.toLowerCase() === 'websocket';
    if (origin !== undefined && !origins.has(origin)) return deny(reply, 403, 'origem não permitida');
    // Navegadores sempre enviam Origin em upgrade WS e em POST cross-site; exigimos ele quando é um navegador.
    if (isUpgrade && origin === undefined && !readBearer(req)) return deny(reply, 403, 'origem ausente');
    if (!SAFE_METHODS.has(req.method) && req.headers['sec-fetch-site'] === 'cross-site') {
      return deny(reply, 403, 'requisição cross-site bloqueada');
    }

    if (isProtectedPath(req.url) && !isAuthenticated(req, token)) return deny(reply, 401, 'não autenticado');
  });

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
    // Sessão deslizante: o app (instalado ou não) consulta /api/health periodicamente; renovar ali faz
    // a sessão só expirar depois de 30 dias SEM uso — o app instalado não "desloga sozinho".
    const pathname = req.url.split('?')[0];
    if (pathname === '/api/health' && reply.statusCode === 200 && tokensMatch(token, sessionCookie(req))) {
      setSessionCookie(reply, token);
    }
    // O navegador precisa sempre revalidar o service worker e o manifest (senão um SW antigo fica preso).
    if (pathname === '/sw.js' || pathname === '/manifest.webmanifest') reply.header('cache-control', 'no-cache');
  });

  // Troca o token da URL por um cookie httpOnly e redireciona para a UI (removendo o token do histórico).
  app.get<{ Querystring: { token?: string } }>('/auth', async (req, reply) => {
    if (!tokensMatch(token, req.query.token)) {
      return reply
        .code(401)
        .type('text/html; charset=utf-8')
        .send('<h1>Token inválido</h1><p>Use a URL impressa no terminal ao iniciar o macpit.</p>');
    }
    setSessionCookie(reply, token);
    return reply.header('cache-control', 'no-store').redirect('/');
  });

  // Entrar colando o token (tela de acesso): o token vai no corpo, não fica na URL nem no histórico.
  app.post('/auth', async (req, reply) => {
    const received = (req.body as { token?: unknown } | undefined)?.token;
    if (typeof received !== 'string' || !tokensMatch(token, received.trim())) {
      return deny(reply, 401, 'token inválido');
    }
    setSessionCookie(reply, token);
    return reply.header('cache-control', 'no-store').send({ ok: true });
  });
}

export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30;

function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    secure: false, // apenas http://127.0.0.1
    maxAge: SESSION_MAX_AGE_S,
  });
}
