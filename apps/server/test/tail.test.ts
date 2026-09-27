import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import type { TailChunk } from '@macpit/shared';
import { followFile, TailService } from '../src/modules/logs/tail.js';
import { WsHub } from '../src/ws/hub.js';

const OPTS = { initialBytes: 32, pollMs: 20, idleTtlMs: 1_000, maxChunkBytes: 1024 };
const tmpFile = (content = '') => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bm-tail-')), 'app.log');
  fs.writeFileSync(f, content);
  return f;
};
const waitFor = async (pred: () => boolean, ms = 1000) => {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
};

const stops: Array<() => void> = [];
afterEach(() => stops.splice(0).forEach((s) => s()));

describe('followFile', () => {
  it('envia o final, depois só o que foi acrescentado', async () => {
    const file = tmpFile('linha-antiga-1\nlinha-antiga-2\nlinha-3\n');
    const chunks: TailChunk[] = [];
    stops.push(followFile(file, OPTS, (c) => chunks.push(c)));
    await waitFor(() => chunks.length === 1);
    // 32 bytes finais, começando na próxima quebra de linha
    expect(chunks[0]).toEqual({ chunk: 'linha-antiga-2\nlinha-3\n', reset: true });

    fs.appendFileSync(file, 'nova\n');
    await waitFor(() => chunks.length === 2);
    expect(chunks[1]).toEqual({ chunk: 'nova\n', reset: false });
  });

  it('detecta truncamento', async () => {
    const file = tmpFile('aaaa\nbbbb\n');
    const chunks: TailChunk[] = [];
    stops.push(followFile(file, OPTS, (c) => chunks.push(c)));
    await waitFor(() => chunks.length === 1);
    fs.writeFileSync(file, 'x\n');
    await waitFor(() => chunks.length === 2);
    expect(chunks[1]).toEqual({ chunk: 'x\n', reset: true, truncated: true });
  });

  it('crescimento grande envia só o final com reset', async () => {
    const file = tmpFile('');
    const chunks: TailChunk[] = [];
    stops.push(followFile(file, OPTS, (c) => chunks.push(c)));
    await waitFor(() => chunks.length === 1);
    fs.appendFileSync(file, 'z'.repeat(5000) + '\nfim\n');
    await waitFor(() => chunks.length === 2);
    expect(chunks[1]).toEqual({ chunk: 'fim\n', reset: true });
  });
});

class FakeSocket extends EventEmitter {
  readyState = 1;
  sent: Array<Record<string, unknown>> = [];
  send(d: string) {
    this.sent.push(JSON.parse(d) as Record<string, unknown>);
  }
  msg(o: unknown) {
    this.emit('message', Buffer.from(JSON.stringify(o)));
  }
}

describe('TailService', () => {
  it('só cria tail para arquivo aberto pelo processo', async () => {
    const file = tmpFile('x\n');
    const svc = new TailService(
      async (_pid, p) => p === file,
      () => {},
      OPTS,
    );
    await expect(svc.create(1, '/etc/hosts')).rejects.toMatchObject({ code: 'not_open' });
    const created = await svc.create(1, file);
    expect(created.channel).toBe(`tail:${created.id}`);
    svc.close();
  });

  it('ciclo de vida pelo hub: assina, recebe, destrói ao sair', async () => {
    const file = tmpFile('ola\n');
    const svc = new TailService(
      async () => true,
      () => {},
      OPTS,
    );
    const hub = new WsHub();
    hub.resolve(svc.resolver);
    const { id, channel } = await svc.create(1, file);

    const s = new FakeSocket();
    hub.attach(s);
    s.msg({ type: 'subscribe', channel });
    await waitFor(() => s.sent.some((m) => m.type === 'snapshot'));
    expect(s.sent.find((m) => m.type === 'snapshot')).toMatchObject({ data: { chunk: 'ola\n', reset: true } });

    s.msg({ type: 'unsubscribe', channel });
    expect(svc.has(id)).toBe(false);
    expect(hub.hasChannel(channel)).toBe(false);
    svc.close();
  });

  it('tail sem assinante expira', async () => {
    const file = tmpFile('');
    const svc = new TailService(
      async () => true,
      () => {},
      { ...OPTS, idleTtlMs: 30 },
    );
    const { id } = await svc.create(1, file);
    await waitFor(() => !svc.has(id));
  });
});
