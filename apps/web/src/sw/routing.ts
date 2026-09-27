/**
 * Regras do service worker (puras, testáveis). O SW só guarda a "casca" do app: dados são SEMPRE ao
 * vivo (API/WS) e nada com token/cookie de login é armazenado.
 */
export type Strategy =
  /** não intercepta: o navegador faz a requisição normalmente */
  | 'bypass'
  /** navegação: rede primeiro; sem servidor, devolve a casca (index.html) guardada */
  | 'shell'
  /** arquivos com hash no nome (nunca mudam): cache primeiro */
  | 'cache-first'
  /** ícones/manifest: responde do cache e atualiza em segundo plano */
  | 'stale-while-revalidate';

export interface RequestInfo {
  url: string;
  method: string;
  mode: string;
}

/** Caminhos que nunca passam pelo cache (dados, WebSocket, login com token). */
const NEVER_CACHE = [/^\/api(\/|$)/, /^\/ws$/, /^\/auth(\/|$)/];

export function strategyFor(req: RequestInfo, origin: string): Strategy {
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return 'bypass';
  }
  if (url.origin !== origin || req.method !== 'GET') return 'bypass';
  if (NEVER_CACHE.some((re) => re.test(url.pathname))) return 'bypass';
  if (req.mode === 'navigate') return 'shell';
  if (url.pathname.startsWith('/assets/')) return 'cache-first';
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/favicon.svg' ||
    url.pathname === '/manifest.webmanifest'
  ) {
    return 'stale-while-revalidate';
  }
  return 'bypass';
}

/** Chunks JS/CSS referenciados pelo index.html (pré-carregados na instalação do SW). */
export function assetsInHtml(html: string): string[] {
  return [...new Set([...html.matchAll(/\/assets\/[A-Za-z0-9._-]+\.(?:js|css)/g)].map((m) => m[0]))];
}

export const SHELL_URL = '/';
export const CACHE_PREFIX = 'bm-shell-';
export const PRECACHE = [
  SHELL_URL,
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];
