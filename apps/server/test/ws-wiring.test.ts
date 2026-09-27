import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from '../src/app.js';
import { TOKEN, testConfig } from './helpers.js';

// Integração ponta a ponta: garante que os canais estão registrados no app (não só no hub isolado).
let cleanup: Array<() => unknown> = [];
afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup = [];
});

async function start() {
  const { app } = await buildApp(testConfig({ MACPIT_PORT: '0' }), TOKEN, { audit: () => {} });
  await app.listen({ host: '127.0.0.1', port: 0 });
  cleanup.push(() => app.close());
  const port = (app.server.address() as { port: number }).port;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
    headers: { host: '127.0.0.1:0', origin: 'http://127.0.0.1:0', cookie: `macpit_session=${TOKEN}` },
  });
  cleanup.push(() => ws.close());
  await new Promise((r) => ws.once('open', r));
  const nextSnapshot = (channel: string) =>
    new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`sem snapshot em ${channel}`)), 4000);
      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw)) as { type: string; channel?: string; data?: unknown; message?: string };
        if (msg.channel !== channel) return;
        if (msg.type === 'error') reject(new Error(msg.message));
        if (msg.type === 'snapshot') {
          clearTimeout(timer);
          resolve(msg.data);
        }
      });
    });
  const subscribe = (channel: string) => ws.send(JSON.stringify({ type: 'subscribe', channel }));
  return { app, ws, subscribe, nextSnapshot };
}

describe.runIf(process.platform === 'darwin')('canal run:<id> + comando run:input', () => {
  it('replay, input pelo WebSocket e saída ao vivo', async () => {
    const { app, ws, subscribe, nextSnapshot } = await start();
    const headers = { host: '127.0.0.1:0', cookie: `macpit_session=${TOKEN}` };
    const action = (
      await app.inject({
        method: 'POST',
        url: '/api/actions',
        headers,
        payload: { name: 'eco', command: 'read -r x; echo "WS:$x"' },
      })
    ).json<{ id: string }>();
    const run = (
      await app.inject({ method: 'POST', url: `/api/actions/${action.id}/run`, headers, payload: {} })
    ).json<{ id: string }>();

    const channel = `run:${run.id}`;
    const replay = nextSnapshot(channel);
    subscribe(channel);
    expect(await replay).toMatchObject({ kind: 'replay', run: { id: run.id, status: 'running' } });

    const got = new Promise<void>((resolve) => {
      let out = '';
      ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw)) as { channel?: string; data?: { kind: string; data?: string } };
        if (msg.channel === channel && msg.data?.kind === 'output') {
          out += msg.data.data;
          if (out.includes('WS:ola')) resolve();
        }
      });
    });
    await new Promise((r) => setTimeout(r, 300));
    ws.send(JSON.stringify({ type: 'run:input', runId: run.id, data: 'ola\r' }));
    await got;
  });
});

describe.runIf(process.platform === 'darwin')('canais registrados no app', () => {
  it.each(['health', 'system', 'processes', 'ports', 'disk'])('canal %s entrega snapshot', async (channel) => {
    const { subscribe, nextSnapshot } = await start();
    const snap = nextSnapshot(channel);
    subscribe(channel);
    expect(await snap).toBeTruthy();
  });

  it('tail de stdout de um processo real', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-wire-'));
    const file = fs.realpathSync(dir) + '/out.log';
    const out = fs.openSync(file, 'w');
    const child: ChildProcess = spawn('/bin/sh', ['-c', 'echo inicio; while true; do echo tick; sleep 0.2; done'], {
      stdio: ['ignore', out, out],
    });
    cleanup.push(() => child.kill('SIGKILL'));
    await new Promise((r) => setTimeout(r, 300));

    const { app, subscribe, nextSnapshot } = await start();
    const res = await app.inject({
      method: 'POST',
      url: '/api/tails',
      headers: { host: '127.0.0.1:0', cookie: `macpit_session=${TOKEN}` },
      payload: { pid: child.pid, path: file },
    });
    expect(res.statusCode).toBe(201);
    const { channel } = res.json<{ channel: string }>();
    const snap = nextSnapshot(channel);
    subscribe(channel);
    expect(await snap).toMatchObject({ reset: true, chunk: expect.stringContaining('inicio') });
  });
});
