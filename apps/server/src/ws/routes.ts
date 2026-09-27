import type { FastifyInstance } from 'fastify';
import type { WsHub } from './hub.js';

export function wsRoutes(app: FastifyInstance, hub: WsHub): void {
  // Autenticação, Host e Origin já foram validados no hook onRequest (lib/security.ts).
  app.get('/ws', { websocket: true }, (socket) => hub.attach(socket));
}
