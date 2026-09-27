/// <reference lib="webworker" />
/**
 * Service worker do macpit (gerado como /sw.js pelo build — ver vite.config.ts).
 * Guarda só a casca do app para ele abrir instalado mesmo com o servidor parado (e explicar o que fazer).
 * Regras de cache em ./routing.ts.
 */
import { assetsInHtml, CACHE_PREFIX, PRECACHE, SHELL_URL, strategyFor } from './routing';

declare const self: ServiceWorkerGlobalScope;
declare const __BUILD_ID__: string;

const CACHE = CACHE_PREFIX + __BUILD_ID__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE);
      // os chunks da página inicial também, para a casca abrir inteira sem servidor
      const shell = await cache.match(SHELL_URL);
      if (shell) await cache.addAll(assetsInHtml(await shell.clone().text()));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith(CACHE_PREFIX) && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

const cacheOk = async (request: Request | string, response: Response) => {
  if (response.ok && response.type === 'basic') await (await caches.open(CACHE)).put(request, response.clone());
  return response;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const strategy = strategyFor({ url: request.url, method: request.method, mode: request.mode }, self.location.origin);
  if (strategy === 'bypass') return;

  if (strategy === 'shell') {
    event.respondWith(
      (async () => {
        try {
          // a resposta de qualquer rota do front é o index.html (fallback da SPA) → guarda como a casca
          return await cacheOk(SHELL_URL, await fetch(request));
        } catch {
          const cached = await caches.match(SHELL_URL);
          return cached ?? new Response(OFFLINE_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
        }
      })(),
    );
    return;
  }

  if (strategy === 'cache-first') {
    event.respondWith((async () => (await caches.match(request)) ?? cacheOk(request, await fetch(request)))());
    return;
  }

  // stale-while-revalidate
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const network = fetch(request)
        .then((r) => cacheOk(request, r))
        .catch(() => undefined);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      return (await network) ?? Response.error();
    })(),
  );
});

/** Só se nem a casca estiver em cache (1ª abertura já sem servidor). */
const OFFLINE_HTML = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>macpit</title>
<body style="font-family:system-ui;background:#020617;color:#e2e8f0;display:grid;place-items:center;height:100vh;margin:0">
<div style="max-width:28rem"><h1 style="font-size:1.25rem">O servidor do macpit não está rodando</h1>
<p>Inicie no terminal com <code>./scripts/start.sh</code> (ou instale o LaunchAgent) e recarregue.</p>
<button onclick="location.reload()">Tentar de novo</button></div></body></html>`;
