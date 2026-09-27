import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { isLoopback, parseLsofSockets, splitHostPort, toPortEntries } from '../src/modules/ports/parser.js';
import { PortService, type PortDeps } from '../src/modules/ports/service.js';
import { ProcessService } from '../src/modules/processes/service.js';
import { AUTH, HOST, TOKEN, testConfig } from './helpers.js';

const fx = (f: string) => fs.readFileSync(path.join(import.meta.dirname, 'fixtures', f), 'utf8');

describe('splitHostPort', () => {
  it.each([
    ['*:80', { address: '*', port: 80 }],
    ['127.0.0.1:5432', { address: '127.0.0.1', port: 5432 }],
    ['[::1]:5432', { address: '::1', port: 5432 }],
    ['[fe80::1%lo0]:8080', { address: 'fe80::1%lo0', port: 8080 }],
    ['*:*', undefined],
    ['lixo', undefined],
  ])('%s', (input, expected) => expect(splitHostPort(input)).toEqual(expected));
});

describe('isLoopback', () => {
  it('reconhece loopback', () => {
    expect(isLoopback('127.0.0.1')).toBe(true);
    expect(isLoopback('::1')).toBe(true);
    expect(isLoopback('fe80::1%lo0')).toBe(true);
    expect(isLoopback('*')).toBe(false);
    expect(isLoopback('0.0.0.0')).toBe(false);
    expect(isLoopback('192.168.0.10')).toBe(false);
  });
});

describe('parseLsofSockets + toPortEntries', () => {
  const entries = toPortEntries(parseLsofSockets(fx('lsof-ports.txt')));
  const find = (proto: string, port: number) => entries.find((e) => e.protocol === proto && e.port === port);

  it('lê sockets com processo, família e estado', () => {
    const raw = parseLsofSockets(fx('lsof-ports.txt'));
    expect(raw[0]).toMatchObject({
      pid: 680,
      command: 'rapportd',
      uid: 501,
      user: 'alice',
      protocol: 'TCP',
      family: 'IPv4',
      name: '*:63483',
      state: 'LISTEN',
    });
    expect(raw.find((s) => s.command === 'Google Chrome Helper')).toBeDefined();
  });

  it('ignora UDP sem porta e conectado', () => {
    expect(entries.some((e) => e.pid === 702)).toBe(false);
  });

  it('agrupa IPv4 + IPv6 da mesma porta e PID', () => {
    expect(find('TCP', 63483)).toMatchObject({
      pid: 680,
      scope: 'network',
      bindings: [
        { address: '*', family: 'IPv4' },
        { address: '*', family: 'IPv6' },
      ],
    });
    expect(find('TCP', 5432)).toMatchObject({ command: 'postgres', scope: 'local' });
    expect(find('TCP', 5432)!.bindings).toHaveLength(2);
  });

  it('escopo de rede e usuário root', () => {
    expect(find('TCP', 9222)?.scope).toBe('network');
    expect(find('TCP', 80)).toMatchObject({ user: 'root', uid: 0, scope: 'network' });
    expect(find('TCP', 8080)?.scope).toBe('local');
    expect(find('UDP', 5353)).toMatchObject({
      user: '_mdnsresponder',
      bindings: expect.arrayContaining([{ address: '*', family: 'IPv6' }]),
    });
  });

  it('ordena por porta', () => {
    const ports = entries.map((e) => e.port);
    expect(ports).toEqual([...ports].sort((a, b) => a - b));
    expect(entries).toHaveLength(7);
  });

  it('TCP fora de LISTEN é ignorado', () => {
    const text = 'p1\ncx\nu1\nLu\nf3\ntIPv4\nPTCP\nn127.0.0.1:3000\nTST=ESTABLISHED\n';
    expect(toPortEntries(parseLsofSockets(text))).toEqual([]);
  });
});

function fakeDeps(over: Partial<PortDeps> = {}): PortDeps {
  return { lsof: async () => fx('lsof-ports.txt'), now: () => 5, isRoot: () => false, ...over };
}

function fakeProcesses() {
  return new ProcessService({
    psStats: async () => '  900     1   501 alice  0.0  0.1  100 100 Ss 01:00 /opt/pg/bin/postgres\n',
    psArgs: async () => '  900 /opt/pg/bin/postgres -D /data\n',
    lsof: async () => '',
    kill: () => {},
    now: () => 5,
    selfPid: 1,
    selfUid: 501,
  });
}

describe('PortService', () => {
  it('anexa a linha de comando e indica limitação sem root', async () => {
    const list = await new PortService(fakeProcesses(), 2000, fakeDeps()).list();
    expect(list.limited).toBe(true);
    expect(list.entries.find((e) => e.port === 5432)?.commandLine).toBe('/opt/pg/bin/postgres -D /data');
    expect(list.entries.find((e) => e.port === 80)?.commandLine).toBeUndefined();
    expect((await new PortService(fakeProcesses(), 2000, fakeDeps({ isRoot: () => true })).list()).limited).toBe(false);
  });

  it('continua funcionando se o snapshot de processos falhar', async () => {
    const broken = fakeProcesses();
    broken.snapshot = async () => {
      throw new Error('ps falhou');
    };
    const list = await new PortService(broken, 2000, fakeDeps()).list();
    expect(list.entries).toHaveLength(7);
  });
});

describe('GET /api/ports', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => close?.());

  it('exige auth e retorna a lista', async () => {
    const { app } = await buildApp(testConfig(), TOKEN, { portDeps: fakeDeps(), audit: () => {} });
    close = () => app.close();
    expect((await app.inject({ url: '/api/ports', headers: HOST })).statusCode).toBe(401);
    const res = await app.inject({ url: '/api/ports', headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.json().entries).toHaveLength(7);
  });
});

describe.runIf(process.platform === 'darwin')('PortService (macOS real)', () => {
  it('encontra uma porta aberta por este processo', async () => {
    const { createServer } = await import('node:net');
    const srv = createServer().listen(0, '127.0.0.1');
    await new Promise((r) => srv.once('listening', r));
    const port = (srv.address() as { port: number }).port;
    try {
      const list = await new PortService(new ProcessService(), 2000).list();
      expect(list.entries.find((e) => e.port === port)).toMatchObject({
        protocol: 'TCP',
        pid: process.pid,
        scope: 'local',
      });
    } finally {
      srv.close();
    }
  });
});
