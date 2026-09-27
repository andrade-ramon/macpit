import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { openDb } from '../src/db/index.js';
import { ExecError } from '../src/lib/exec.js';
import { isUserVolume, parseDf, parseDu, volumeName } from '../src/modules/disk/parser.js';
import { DISK_RETENTION_MS, DiskService, type DiskDeps } from '../src/modules/disk/service.js';
import { DiskUsageService, type DuDeps } from '../src/modules/disk/usage.js';
import { AUTH, HOST, TOKEN, testConfig } from './helpers.js';

const fx = (f: string) => fs.readFileSync(path.join(import.meta.dirname, 'fixtures', f), 'utf8');
const KB = 1024;

describe('parseDf / isUserVolume', () => {
  const rows = parseDf(fx('df.txt'));

  it('lê todas as linhas, com espaços no filesystem e no mount', () => {
    expect(rows).toHaveLength(12);
    expect(rows.find((r) => r.mount === '/Volumes/Backup Externo')?.totalBytes).toBe(976762584 * KB);
    expect(rows.find((r) => r.filesystem === 'map auto_home')?.mount).toBe('/System/Volumes/Data/home');
    expect(rows.find((r) => r.filesystem.startsWith('//alice'))?.mount).toBe('/Volumes/share');
  });

  it('mantém só volumes do usuário', () => {
    expect(rows.filter(isUserVolume).map((r) => r.mount)).toEqual(['/', '/Volumes/Backup Externo', '/Volumes/share']);
  });

  it('nome amigável', () => {
    expect(volumeName('/')).toBe('Disco do sistema');
    expect(volumeName('/Volumes/Backup Externo')).toBe('Backup Externo');
  });
});

describe('parseDu', () => {
  it('separa total e subpastas, ordenadas', () => {
    const r = parseDu(fx('du.txt'), '/Users/alice/github/');
    expect(r.totalBytes).toBe(37655668 * KB);
    expect(r.entries.map((e) => e.name)).toEqual(['big project', 'other', '.codegraph', 'logistica-kit']);
    expect(r.entries[0]!.path).toBe('/Users/alice/github/big project');
  });

  it('raiz e saída sem total', () => {
    expect(parseDu('10\t/a\n30\t/\n', '/')).toEqual({
      totalBytes: 30 * KB,
      entries: [{ name: 'a', path: '/a', sizeBytes: 10 * KB }],
    });
    expect(parseDu('10\t/x/a\n5\t/x/b\n', '/x').totalBytes).toBe(15 * KB);
  });
});

function diskDeps(over: Partial<DiskDeps> = {}) {
  const clock = { now: 1_000_000_000_000 };
  const deps: DiskDeps = { df: async () => fx('df.txt'), now: () => clock.now, ...over };
  return { clock, deps };
}

describe('DiskService', () => {
  it('usado = total − disponível (APFS) e alerta pelo limite', async () => {
    const { deps } = diskDeps();
    const svc = new DiskService(openDb(':memory:'), 60_000, deps);
    const [root, backup] = await svc.volumes();
    expect(root).toMatchObject({
      mount: '/',
      name: 'Disco do sistema',
      usedBytes: (239362496 - 25147292) * KB,
      usedPct: 89.5,
      alert: false,
    });
    expect(backup!.usedPct).toBe(50);
    svc.updateSettings({ alertPct: 85 });
    expect((await svc.volumes())[0]!.alert).toBe(true);
    expect((await svc.overview()).settings).toEqual({ alertPct: 85 });
  });

  it('grava amostras, aplica retenção e agrega o histórico', async () => {
    const { clock, deps } = diskDeps();
    const db = openDb(':memory:');
    const svc = new DiskService(db, 60_000, deps);
    const start = clock.now;
    await svc.recordSample();
    for (let i = 1; i <= 10; i++) {
      clock.now = start + i * 60_000;
      await svc.recordSample();
    }
    const h24 = svc.history('/', '24h');
    // bucket de 24h/300 = 288 s → 11 amostras de 1 min viram 3 pontos
    expect(h24.points.length).toBeGreaterThanOrEqual(2);
    expect(h24.points.length).toBeLessThanOrEqual(4);
    expect(h24.points.at(-1)!.totalBytes).toBe(239362496 * KB);
    expect(svc.history('/nao-existe', '24h').points).toEqual([]);

    clock.now = start + DISK_RETENTION_MS + 5 * 60_000;
    await svc.recordSample();
    const count = db.prepare("SELECT COUNT(*) AS n FROM disk_samples WHERE mount = '/'").get() as { n: number };
    // corte = start + 5 min: ficam as amostras i=5..10 (6) + a nova
    expect(count.n).toBe(6 + 1);
  });

  afterEach(() => vi.useRealTimers());

  it('amostragem em segundo plano grava e para', async () => {
    vi.useFakeTimers();
    const { deps } = diskDeps({ now: () => Date.now() });
    const db = openDb(':memory:');
    const svc = new DiskService(db, 10_000, deps);
    svc.startSampling(() => {});
    await vi.advanceTimersByTimeAsync(25_000);
    svc.stopSampling();
    const n = (db.prepare('SELECT COUNT(DISTINCT ts) AS n FROM disk_samples').get() as { n: number }).n;
    expect(n).toBeGreaterThanOrEqual(2);
  });
});

function duDeps(over: Partial<DuDeps> = {}): DuDeps & { calls: string[] } {
  const calls: string[] = [];
  let now = 0;
  return {
    calls,
    du: async (dir) => {
      calls.push(dir);
      return { stdout: `100\t${dir}/a\n300\t${dir}\n`, partial: false };
    },
    now: () => (now += 10),
    home: () => os.tmpdir(),
    ...over,
  };
}

describe('DiskUsageService', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bm-du-')));
  const file = path.join(dir, 'f.txt');
  fs.writeFileSync(file, 'x');

  it('valida caminho', async () => {
    const svc = new DiskUsageService(duDeps());
    await expect(svc.usage('relativo')).rejects.toMatchObject({ statusCode: 400, code: 'not_absolute' });
    await expect(svc.usage('/nao/existe/mesmo')).rejects.toMatchObject({ statusCode: 404 });
    await expect(svc.usage(file)).rejects.toMatchObject({ statusCode: 400, code: 'not_dir' });
    expect((await svc.usage('~')).path).toBe(fs.realpathSync(os.tmpdir()));
  });

  it('calcula soltos, usa cache e respeita refresh', async () => {
    const deps = duDeps();
    const svc = new DiskUsageService(deps);
    const r = await svc.usage(dir);
    expect(r).toMatchObject({ totalBytes: 300 * KB, looseBytes: 200 * KB, cached: false, partial: false });
    expect((await svc.usage(dir)).cached).toBe(true);
    await svc.usage(dir, true);
    expect(deps.calls).toHaveLength(2);
  });

  it('junta pedidos simultâneos e limita concorrência', async () => {
    const release: Array<() => void> = [];
    const deps = duDeps({
      du: (d) => new Promise((res) => release.push(() => res({ stdout: `1\t${d}\n`, partial: true }))),
    });
    const svc = new DiskUsageService(deps, { maxConcurrent: 1 });
    const a = svc.usage(dir);
    const b = svc.usage(dir);
    await new Promise((r) => setTimeout(r, 5));
    await expect(svc.usage(os.tmpdir(), true)).rejects.toMatchObject({ statusCode: 429 });
    release.forEach((f) => f());
    expect(await a).toBe(await b);
    expect((await a).partial).toBe(true);
  });

  it('timeout vira 504', async () => {
    const svc = new DiskUsageService(
      duDeps({
        du: async () => {
          throw new ExecError('t', 'du', [], null, '', true);
        },
      }),
    );
    await expect(svc.usage(dir)).rejects.toMatchObject({ statusCode: 504, code: 'timeout' });
  });
});

describe('rotas de disco', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => close?.());

  async function setup() {
    const { app } = await buildApp(testConfig(), TOKEN, {
      diskDeps: diskDeps().deps,
      duDeps: duDeps(),
      db: openDb(':memory:'),
      audit: () => {},
    });
    close = () => app.close();
    return app;
  }

  it('GET /api/disk', async () => {
    const app = await setup();
    expect((await app.inject({ url: '/api/disk', headers: HOST })).statusCode).toBe(401);
    const body = (await app.inject({ url: '/api/disk', headers: AUTH })).json();
    expect(body.volumes).toHaveLength(3);
    expect(body.settings).toEqual({ alertPct: 90 });
  });

  it('PUT /api/disk/settings valida faixa', async () => {
    const app = await setup();
    const put = (payload: Record<string, unknown>) =>
      app.inject({ method: 'PUT', url: '/api/disk/settings', headers: AUTH, payload });
    expect((await put({ alertPct: 20 })).statusCode).toBe(400);
    expect((await put({ alertPct: 80 })).json()).toEqual({ alertPct: 80 });
    expect((await app.inject({ url: '/api/disk', headers: AUTH })).json().settings.alertPct).toBe(80);
  });

  it('GET /api/disk/history e /usage', async () => {
    const app = await setup();
    expect((await app.inject({ url: '/api/disk/history', headers: AUTH })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/disk/history?mount=/&range=1y', headers: AUTH })).statusCode).toBe(400);
    const h = await app.inject({ url: '/api/disk/history?mount=%2F&range=7d', headers: AUTH });
    expect(h.json()).toMatchObject({ mount: '/', range: '7d', points: [] });
    const u = await app.inject({
      url: `/api/disk/usage?path=${encodeURIComponent(os.tmpdir())}&refresh=1`,
      headers: AUTH,
    });
    expect(u.statusCode).toBe(200);
    expect(u.json().cached).toBe(false);
  });
});

describe.runIf(process.platform === 'darwin')('disco (macOS real)', () => {
  it('df real tem o volume /', async () => {
    const vols = await new DiskService(openDb(':memory:'), 60_000).volumes();
    expect(vols[0]).toMatchObject({ mount: '/' });
    expect(vols[0]!.usedPct).toBeGreaterThan(0);
  });

  it('du real numa pasta temporária', async () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bm-du-real-')));
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.writeFileSync(path.join(dir, 'sub', 'x.bin'), Buffer.alloc(64 * 1024));
    const r = await new DiskUsageService().usage(dir);
    expect(r.entries[0]).toMatchObject({ name: 'sub' });
    expect(r.entries[0]!.sizeBytes).toBeGreaterThanOrEqual(64 * 1024);
  });
});
