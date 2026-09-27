import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { ProcessService, protectedReason, type ProcessDeps } from '../src/modules/processes/service.js';
import { AUTH, HOST, TOKEN, testConfig } from './helpers.js';

const fx = (f: string) => fs.readFileSync(path.join(import.meta.dirname, 'fixtures', f), 'utf8');

function fakeDeps(overrides: Partial<ProcessDeps> = {}): ProcessDeps {
  return {
    psStats: async () => fx('ps-stats.txt'),
    psArgs: async () => fx('ps-args.txt'),
    lsof: async (pid) => (pid === 2001 ? fx('lsof-p.txt') : ''),
    kill: vi.fn(),
    now: () => 1_000,
    selfPid: 2001,
    selfUid: 501,
    ...overrides,
  };
}

const errno = (code: string) => Object.assign(new Error(code), { code });

describe('protectedReason', () => {
  it('protege 0, 1 e o próprio servidor', () => {
    expect(protectedReason(0, 99)).toBeDefined();
    expect(protectedReason(1, 99)).toBeDefined();
    expect(protectedReason(99, 99)).toBeDefined();
    expect(protectedReason(100, 99)).toBeUndefined();
  });
});

describe('ProcessService', () => {
  it('coalesce coletas simultâneas', async () => {
    const psStats = vi.fn(async () => fx('ps-stats.txt'));
    const svc = new ProcessService(fakeDeps({ psStats }));
    await Promise.all([svc.list(), svc.list(), svc.list()]);
    expect(psStats).toHaveBeenCalledTimes(1);
  });

  it('snapshot reaproveita coleta recente', async () => {
    const psStats = vi.fn(async () => fx('ps-stats.txt'));
    const svc = new ProcessService(fakeDeps({ psStats }));
    await svc.snapshot(2000);
    await svc.snapshot(2000);
    expect(psStats).toHaveBeenCalledTimes(1);
  });

  it('detalhe com pai, filhos e arquivos', async () => {
    const svc = new ProcessService(fakeDeps());
    const d = await svc.detail(2000, 2000);
    expect(d.process.name).toBe('zsh');
    expect(d.parent?.pid).toBe(453);
    expect(d.children.map((c) => c.pid)).toEqual([2001, 2002]);
    expect(d.filesError).toBe('nenhum arquivo visível');
    expect((await svc.detail(2001, 2000)).files).toHaveLength(10);
  });

  it('explica falta de permissão para processo de outro usuário', async () => {
    const d = await new ProcessService(fakeDeps()).detail(339, 2000);
    expect(d.filesError).toMatch(/root/);
  });

  it('404 para PID inexistente', async () => {
    await expect(new ProcessService(fakeDeps()).detail(424242, 2000)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('kill envia sinal e audita', async () => {
    const deps = fakeDeps();
    const audit = vi.fn();
    const svc = new ProcessService(deps, audit);
    await svc.list();
    expect(svc.kill(1200, 'KILL')).toEqual({ ok: true, pid: 1200, signal: 'KILL' });
    expect(deps.kill).toHaveBeenCalledWith(1200, 'SIGKILL');
    expect(audit).toHaveBeenCalledWith(
      'kill',
      '1200',
      expect.objectContaining({ signal: 'KILL', name: 'Google Chrome' }),
    );
  });

  it('kill: protegido, inexistente e sem permissão', () => {
    const svc = (err?: string) =>
      new ProcessService(
        fakeDeps({
          kill: () => {
            if (err) throw errno(err);
          },
        }),
      );
    expect(() => svc().kill(1, 'TERM')).toThrow(expect.objectContaining({ statusCode: 403, code: 'protected' }));
    expect(() => svc().kill(2001, 'TERM')).toThrow(expect.objectContaining({ code: 'protected' }));
    expect(() => svc('ESRCH').kill(50, 'TERM')).toThrow(expect.objectContaining({ statusCode: 404 }));
    expect(() => svc('EPERM').kill(50, 'TERM')).toThrow(expect.objectContaining({ statusCode: 403, code: 'eperm' }));
  });
});

describe('rotas de processos', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => close?.());

  async function setup(deps = fakeDeps()) {
    const { app } = await buildApp(testConfig(), TOKEN, { processDeps: deps, audit: () => {} });
    close = () => app.close();
    return app;
  }

  it('GET /api/processes', async () => {
    const app = await setup();
    expect((await app.inject({ url: '/api/processes', headers: HOST })).statusCode).toBe(401);
    const res = await app.inject({ url: '/api/processes', headers: AUTH });
    expect(res.json()).toMatchObject({ selfPid: 2001, processes: expect.any(Array) });
  });

  it('GET /api/processes/:pid valida parâmetro', async () => {
    const app = await setup();
    expect((await app.inject({ url: '/api/processes/abc', headers: AUTH })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/processes/999999', headers: AUTH })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/processes/2001', headers: AUTH })).json().files).toHaveLength(10);
  });

  it('POST kill', async () => {
    const deps = fakeDeps();
    const app = await setup(deps);
    const post = (pid: number | string, body?: unknown) =>
      app.inject({
        method: 'POST',
        url: `/api/processes/${pid}/kill`,
        headers: AUTH,
        ...(body ? { payload: body } : {}),
      });

    expect((await post(1200, { signal: 'STOP' })).statusCode).toBe(400);
    expect((await post(1)).statusCode).toBe(403);
    const ok = await post(1200);
    expect(ok.json()).toEqual({ ok: true, pid: 1200, signal: 'TERM' });
    expect(deps.kill).toHaveBeenCalledWith(1200, 'SIGTERM');
  });

  it('POST kill bloqueado cross-site', async () => {
    const app = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/processes/1200/kill',
      headers: { ...AUTH, origin: 'https://evil.com' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /api/tails recusa arquivo que o processo não abriu', async () => {
    const app = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/tails',
      headers: AUTH,
      payload: { pid: 2001, path: '/etc/passwd' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('not_open');
  });
});
