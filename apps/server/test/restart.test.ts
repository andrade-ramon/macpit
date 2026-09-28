import { afterEach, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type { RestartDeps } from '../src/modules/lifecycle/routes.js';
import { fakeRunDeps } from './fake-pty.js';
import { AUTH, HOST, TOKEN, testConfig } from './helpers.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});
async function setup(restart?: RestartDeps) {
  const config = testConfig();
  const fake = fakeRunDeps(config.dataDir);
  const audit = vi.fn();
  const ctx = await buildApp(config, TOKEN, { ...(restart ? { restart } : {}), runDeps: fake.deps, audit });
  cleanups.push(() => ctx.app.close());
  return { ...ctx, fake, audit };
}

it('reinício indisponível sem controlador e exige confirmação explícita', async () => {
  const { app } = await setup();
  expect((await app.inject({ url: '/api/server', headers: AUTH })).json()).toMatchObject({
    canRestart: false,
    restarting: false,
  });
  for (const payload of [{}, { confirm: false }, { confirm: true, command: 'reboot' }]) {
    expect((await app.inject({ method: 'POST', url: '/api/server/restart', headers: AUTH, payload })).statusCode).toBe(
      400,
    );
  }
  expect(
    (await app.inject({ method: 'POST', url: '/api/server/restart', headers: AUTH, payload: { confirm: true } }))
      .statusCode,
  ).toBe(503);
});

it('retorna 202 antes de reiniciar, bloqueia duplicatas e audita sem parâmetros de ações', async () => {
  const restart = { prepare: vi.fn(), restart: vi.fn(async () => {}) };
  const { app, actions, manager, audit } = await setup(restart);
  const a = actions.create({ name: 'Teste', command: 'echo teste', env: { PASSWORD: 'segredo-sintetico' } });
  manager.start(a, { cols: 80, rows: 24 });
  const response = await app.inject({
    method: 'POST',
    url: '/api/server/restart',
    headers: AUTH,
    payload: { confirm: true },
  });
  expect(response.statusCode).toBe(202);
  expect(response.json()).toMatchObject({ restarting: true, activeRuns: 1 });
  expect(restart.restart).not.toHaveBeenCalled();
  expect(
    (await app.inject({ method: 'POST', url: '/api/server/restart', headers: AUTH, payload: { confirm: true } }))
      .statusCode,
  ).toBe(409);
  await vi.waitFor(() => expect(restart.restart).toHaveBeenCalledTimes(1));
  expect(restart.prepare).toHaveBeenCalledTimes(1);
  expect(audit).toHaveBeenCalledWith('restart', 'macpit', { activeRuns: 1 });
  expect(JSON.stringify(audit.mock.calls)).not.toContain('segredo-sintetico');
});

it('falha de preparação não agenda; falha de reinício informa erro e permite tentar novamente', async () => {
  const restart = {
    prepare: vi.fn((): void => {
      throw new Error('arquivo ausente');
    }),
    restart: vi.fn(async () => {
      throw new Error('falha sintética');
    }),
  };
  const { app } = await setup(restart);
  const request = () =>
    app.inject({ method: 'POST', url: '/api/server/restart', headers: AUTH, payload: { confirm: true } });
  expect((await request()).statusCode).toBe(500);
  expect(restart.restart).not.toHaveBeenCalled();
  restart.prepare.mockImplementation(() => {});
  expect((await request()).statusCode).toBe(202);
  await vi.waitFor(async () =>
    expect((await app.inject({ url: '/api/server', headers: AUTH })).json()).toMatchObject({
      restarting: false,
      error: expect.stringContaining('Não foi possível'),
    }),
  );
  expect((await request()).statusCode).toBe(202);
});

it('protege GET e POST por sessão, Host, Origin e cross-site sem acionar reinício', async () => {
  const restart = { prepare: vi.fn(), restart: vi.fn(async () => {}) };
  const { app } = await setup(restart);
  for (const method of ['GET', 'POST'] as const) {
    const opts = {
      method,
      url: method === 'GET' ? '/api/server' : '/api/server/restart',
      ...(method === 'POST' ? { payload: { confirm: true } } : {}),
    };
    expect((await app.inject({ ...opts, headers: HOST })).statusCode).toBe(401);
    expect((await app.inject({ ...opts, headers: { ...AUTH, host: 'malicioso.invalid' } })).statusCode).toBe(421);
    expect((await app.inject({ ...opts, headers: { ...AUTH, origin: 'https://malicioso.invalid' } })).statusCode).toBe(
      403,
    );
  }
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/server/restart',
        payload: { confirm: true },
        headers: { ...AUTH, 'sec-fetch-site': 'cross-site' },
      })
    ).statusCode,
  ).toBe(403);
  expect(restart.prepare).not.toHaveBeenCalled();
  expect(restart.restart).not.toHaveBeenCalled();
});
