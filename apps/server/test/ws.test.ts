import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from '../src/app.js';
import { TOKEN, testConfig } from './helpers.js';

let close: (() => Promise<void>) | undefined;
afterEach(async () => close?.());

async function listen() {
  const config = testConfig({ MACPIT_PORT: '0' });
  const { app } = await buildApp(config, TOKEN);
  await app.listen({ host: '127.0.0.1', port: 0 });
  close = () => app.close();
  const port = (app.server.address() as { port: number }).port;
  // allowedHosts usa a porta configurada; em teste com porta 0 ajustamos via header Host.
  return { port, host: `127.0.0.1:${config.port}` };
}

function connect(port: number, headers: Record<string, string>) {
  return new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers });
}

function firstEvent(ws: WebSocket): Promise<{ kind: 'open' } | { kind: 'rejected'; status: number }> {
  return new Promise((resolve) => {
    ws.once('open', () => resolve({ kind: 'open' }));
    ws.once('unexpected-response', (_req, res) => resolve({ kind: 'rejected', status: res.statusCode ?? 0 }));
  });
}

describe('WebSocket /ws', () => {
  it('rejeita upgrade sem autenticação', async () => {
    const { port, host } = await listen();
    const ws = connect(port, { host, origin: `http://${host}` });
    expect(await firstEvent(ws)).toEqual({ kind: 'rejected', status: 401 });
  });

  it('rejeita upgrade de origem estranha', async () => {
    const { port, host } = await listen();
    const ws = connect(port, { host, origin: 'https://evil.com', cookie: `macpit_session=${TOKEN}` });
    expect(await firstEvent(ws)).toEqual({ kind: 'rejected', status: 403 });
  });

  it('assina o canal health e recebe snapshot', async () => {
    const { port, host } = await listen();
    const ws = connect(port, { host, origin: `http://${host}`, cookie: `macpit_session=${TOKEN}` });
    expect(await firstEvent(ws)).toEqual({ kind: 'open' });
    const snapshot = new Promise<Record<string, unknown>>((resolve) => {
      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw)) as Record<string, unknown>;
        if (msg.type === 'snapshot') resolve(msg);
      });
    });
    ws.send(JSON.stringify({ type: 'subscribe', channel: 'health' }));
    const msg = await snapshot;
    expect(msg).toMatchObject({ channel: 'health', data: { ok: true } });
    ws.close();
  });
});
