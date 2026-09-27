import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { SystemService, type SystemDeps } from '../src/modules/system/service.js';
import { AUTH, TOKEN, testConfig } from './helpers.js';

const vmStat = fs.readFileSync(path.join(import.meta.dirname, 'fixtures/vm_stat.txt'), 'utf8');

function fakeDeps() {
  const clock = { now: 1_000_000, busy: 0, idle: 0 };
  const deps: SystemDeps = {
    vmStat: async () => vmStat,
    swapUsage: async () => 'total = 1024.00M  used = 256.00M  free = 768.00M',
    cpus: () =>
      Array.from({ length: 2 }, () => ({
        model: 'Apple M4 ',
        speed: 0,
        times: { user: clock.busy, nice: 0, sys: 0, idle: clock.idle, irq: 0 },
      })),
    totalMem: () => 16 * 1024 ** 3,
    loadavg: () => [1.234, 2, 3],
    uptime: () => 3600.4,
    now: () => clock.now,
  };
  return { clock, deps };
}

let close: (() => Promise<void>) | undefined;
afterEach(async () => close?.());

describe('SystemService', () => {
  it('monta amostra completa', async () => {
    const { clock, deps } = fakeDeps();
    const svc = new SystemService(deps);
    clock.busy = 25;
    clock.idle = 75;
    const s = await svc.sample();
    expect(s.cpu).toEqual({ usagePct: 25, userPct: 25, systemPct: 0, cores: 2, model: 'Apple M4' });
    expect(s.load).toEqual([1.23, 2, 3]);
    expect(s.swap.usedBytes).toBe(256 * 1024 ** 2);
    expect(s.uptimeSec).toBe(3600);
    expect(s.ts).toBe(1_000_000);
  });

  it('descarta histórico mais antigo que a janela', async () => {
    const { clock, deps } = fakeDeps();
    const svc = new SystemService(deps, 10_000);
    for (let i = 0; i < 5; i++) {
      await svc.sample();
      clock.now += 4_000;
    }
    const { history } = await svc.overview(60_000);
    expect(history.map((h) => h.ts)).toEqual([1_008_000, 1_012_000, 1_016_000]);
  });

  it('overview reaproveita amostra recente e coleta quando velha', async () => {
    const { clock, deps } = fakeDeps();
    const svc = new SystemService(deps);
    const first = await svc.overview(2_000);
    clock.now += 1_000;
    expect((await svc.overview(2_000)).current).toBe(first.current);
    clock.now += 5_000;
    expect((await svc.overview(2_000)).current.ts).toBe(clock.now);
  });
});

describe('GET /api/system', () => {
  it('exige autenticação e retorna visão geral', async () => {
    const { deps } = fakeDeps();
    const { app } = await buildApp(testConfig(), TOKEN, { systemDeps: deps });
    close = () => app.close();
    expect((await app.inject({ url: '/api/system', headers: { host: AUTH.host } })).statusCode).toBe(401);
    const res = await app.inject({ url: '/api/system', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.current.memory.totalBytes).toBe(16 * 1024 ** 3);
    expect(body.history).toHaveLength(1);
  });
});
