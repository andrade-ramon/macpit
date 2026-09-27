import type { FastifyInstance } from 'fastify';
import type { PortService } from './service.js';

export function portRoutes(app: FastifyInstance, deps: { ports: PortService }): void {
  // Encerrar o dono de uma porta usa POST /api/processes/:pid/kill.
  app.get('/api/ports', async () => deps.ports.list());
}
