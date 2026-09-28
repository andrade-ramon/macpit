import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PanelSchema } from '@macpit/shared';
import { buildApp } from '../src/app.js';
import { SettingsStore } from '../src/db/settings.js';
import { AUTH, TOKEN, testConfig } from './helpers.js';
import { fakeRunDeps } from './fake-pty.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function setup() {
  const config = testConfig();
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'macpit-panels-')));
  for (const name of ['api', 'web']) {
    const git = path.join(root, name, '.git');
    fs.mkdirSync(git, { recursive: true });
    fs.writeFileSync(path.join(git, 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(path.join(git, 'config'), '[core]\n');
  }
  const fake = fakeRunDeps(root);
  let ctx = await buildApp(config, TOKEN, { runDeps: fake.deps });
  cleanups.push(async () => {
    await ctx.app.close();
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(config.dataDir, { recursive: true, force: true });
  });
  await ctx.repos.updateSettings({ roots: [root], maxDepth: 1 });
  const repos = (await ctx.repos.listFresh()).repos;
  return {
    ctx,
    root,
    repos,
    fake,
    reopen: async () => {
      await ctx.app.close();
      ctx = await buildApp(config, TOKEN, { runDeps: fake.deps });
      return ctx;
    },
  };
}

describe('painéis salvos', () => {
  it('salva sem duplicar, persiste ao reiniciar e remove só o acesso salvo', async () => {
    const { ctx, repos, fake, reopen } = await setup();
    const repo = repos[0]!;
    await ctx.repos.setVars(repo.id, { vars: [{ name: 'TOKEN', value: 'segredo-sintetico', secret: true }] });
    const action = ctx.actions.create({ name: 'Ação preservada', command: 'echo teste' });
    const save = () =>
      ctx.app.inject({ method: 'POST', url: '/api/panels', headers: AUTH, payload: { repoId: repo.id } });
    const [one, two] = await Promise.all([save(), save()]);
    expect(one.statusCode).toBe(200);
    expect(two.json()).toEqual(one.json());
    expect(PanelSchema.parse(one.json())).toMatchObject({
      id: repo.id,
      name: repo.name,
      repoPath: repo.path,
      available: true,
    });
    const listing = await ctx.app.inject({ url: '/api/panels', headers: AUTH });
    expect(listing.json()).toHaveLength(1);
    expect(listing.body).not.toContain('segredo-sintetico');
    expect(fake.ptys).toHaveLength(0);
    const restarted = await reopen();
    expect((await restarted.app.inject({ url: '/api/panels', headers: AUTH })).json()).toEqual(listing.json());
    expect(
      (await restarted.app.inject({ method: 'DELETE', url: `/api/panels/${repo.id}`, headers: AUTH })).statusCode,
    ).toBe(204);
    expect((await restarted.app.inject({ url: '/api/panels', headers: AUTH })).json()).toEqual([]);
    expect(restarted.actions.get(action.id).name).toBe('Ação preservada');
    expect((await restarted.repos.listFresh()).repos.some((r) => r.id === repo.id)).toBe(true);
    expect(fake.ptys).toHaveLength(0);
  });

  it('mantém projetos indisponíveis, recupera após varredura e não depende da seleção de importados', async () => {
    const { ctx, repos, root } = await setup();
    const repo = repos[0]!;
    await ctx.app.inject({ method: 'POST', url: '/api/panels', headers: AUTH, payload: { repoId: repo.id } });
    await ctx.repos.setSelection({ paths: [] });
    expect((await ctx.app.inject({ url: '/api/panels', headers: AUTH })).json()[0].available).toBe(true);
    await ctx.repos.updateSettings({ roots: [], maxDepth: 1 });
    expect((await ctx.app.inject({ url: '/api/panels', headers: AUTH })).json()[0]).toMatchObject({
      id: repo.id,
      available: false,
    });
    await ctx.repos.updateSettings({ roots: [root], maxDepth: 1 });
    expect((await ctx.app.inject({ url: '/api/panels', headers: AUTH })).json()[0].available).toBe(true);
  });

  it('valida entradas, exige autenticação/Origin/Host e limita a quantidade salva', async () => {
    const { ctx, repos } = await setup();
    for (const payload of [{}, { repoId: '' }, { repoId: 42 }, { repoId: 'x'.repeat(65) }]) {
      expect((await ctx.app.inject({ method: 'POST', url: '/api/panels', headers: AUTH, payload })).statusCode).toBe(
        400,
      );
    }
    expect(
      (await ctx.app.inject({ method: 'POST', url: '/api/panels', headers: AUTH, payload: { repoId: '/etc/passwd' } }))
        .statusCode,
    ).toBe(404);
    for (const method of ['GET', 'POST', 'DELETE'] as const) {
      const url = method === 'DELETE' ? `/api/panels/${repos[0]!.id}` : '/api/panels';
      const opts = { method, url, ...(method === 'POST' ? { payload: { repoId: repos[0]!.id } } : {}) };
      expect((await ctx.app.inject({ ...opts, headers: { host: '127.0.0.1:7777' } })).statusCode).toBe(401);
      expect(
        (await ctx.app.inject({ ...opts, headers: { ...AUTH, origin: 'https://malicioso.invalid' } })).statusCode,
      ).toBe(403);
      expect((await ctx.app.inject({ ...opts, headers: { ...AUTH, host: 'malicioso.invalid' } })).statusCode).toBe(421);
    }
    new SettingsStore(ctx.db).set(
      'panels.saved',
      Array.from({ length: 200 }, (_, i) => ({
        id: `synthetic-${i}`,
        name: `Projeto ${i}`,
        repoPath: `/synthetic/${i}`,
        savedAt: 1,
      })),
    );
    expect(
      (await ctx.app.inject({ method: 'POST', url: '/api/panels', headers: AUTH, payload: { repoId: repos[0]!.id } }))
        .statusCode,
    ).toBe(409);
  });
});
