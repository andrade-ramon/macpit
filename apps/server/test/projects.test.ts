import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectOverviewSchema, type ProcessInfo, type Run } from '@macpit/shared';
import { buildApp } from '../src/app.js';
import { projectPids } from '../src/modules/repos/project.js';
import { fakeRunDeps } from './fake-pty.js';
import { AUTH, TOKEN, testConfig } from './helpers.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});

async function setup() {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'macpit-project-')));
  for (const name of ['um', 'dois']) {
    const git = path.join(home, name, '.git');
    fs.mkdirSync(git, { recursive: true });
    fs.writeFileSync(path.join(git, 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(path.join(git, 'config'), '[core]\n');
  }
  const fake = fakeRunDeps(home);
  const ctx = await buildApp(testConfig(), TOKEN, { runDeps: fake.deps });
  cleanups.push(async () => {
    await ctx.app.close();
    fs.rmSync(home, { recursive: true, force: true });
  });
  await ctx.repos.updateSettings({ roots: [home], maxDepth: 1 });
  const repos = (await ctx.repos.listFresh()).repos;
  const one = repos.find((r) => r.name === 'um')!;
  const two = repos.find((r) => r.name === 'dois')!;
  const get = (id: string) => ctx.app.inject({ url: `/api/repos/${id}/project`, headers: AUTH });
  return { ...ctx, ...fake, one, two, get, home };
}

describe('painel de projeto', () => {
  it('persiste o vínculo, isola histórico e não reclassifica execuções ao editar ou apagar ações', async () => {
    const { actions, manager, runs, one, two, ptys, get, app } = await setup();
    const a = actions.create({ name: 'Verificar', command: 'echo ok', params: [{ name: 'repo', type: 'repo' }] });
    const r1 = manager.start(a, { cols: 80, rows: 24, params: { repo: one.id } });
    ptys.at(-1)!.exit(0);
    const r2 = manager.start(a, { cols: 80, rows: 24, params: { repo: two.id } });
    ptys.at(-1)!.exit(0);
    expect(runs.get(r1.id)?.repoPath).toBe(one.path);
    expect(runs.get(r2.id)?.repoPath).toBe(two.path);
    actions.update(a.id, {
      name: 'Outro nome',
      command: 'echo novo',
      params: [{ name: 'repo', type: 'repo', default: two.id }],
    });
    const body = ProjectOverviewSchema.parse((await get(one.id)).json());
    expect(body.runs.map((r) => r.id)).toEqual([r1.id]);
    expect(body.runs[0]!.actionName).toBe('Verificar');
    expect(body.actions[0]!.action.lastRun?.id).toBe(r1.id);
    actions.delete(a.id);
    expect((await get(one.id)).json().runs[0]).toMatchObject({ id: r1.id, actionId: null, repoPath: one.path });
    expect((await get('ausente')).statusCode).toBe(404);
    expect(
      (await app.inject({ url: `/api/repos/${one.id}/project`, headers: { host: '127.0.0.1:7777' } })).statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ url: `/api/repos/${one.id}/project`, headers: { ...AUTH, origin: 'https://evil.invalid' } }))
        .statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ url: `/api/repos/${one.id}/project`, headers: { ...AUTH, host: 'evil.invalid' } }))
        .statusCode,
    ).toBe(421);
  });

  it('não infere vínculo pelo cwd; mantém ativas fora da janela de 50 recentes e mascara segredos', async () => {
    const { actions, manager, runs, one, ptys, get, repos } = await setup();
    await repos.setVars(one.id, { vars: [{ name: 'PASSWORD', value: 'segredo-sintetico', secret: true }] });
    const legacy = actions.create({ name: 'Sem projeto', command: 'echo ok', cwd: one.path });
    const unlinked = manager.start(legacy, { cols: 80, rows: 24 });
    ptys.at(-1)!.exit(0);
    expect(unlinked.repoPath).toBeNull();
    const a = actions.create({ name: 'Com projeto', command: 'echo ok', params: [{ name: 'repo', type: 'repo' }] });
    const active = manager.start(a, { cols: 80, rows: 24, params: { repo: one.id } });
    for (let i = 0; i < 55; i++)
      runs.insert({
        ...runs.get(active.id)!,
        id: `recent-${i}`,
        status: 'exited',
        startedAt: active.startedAt + i + 1,
      });
    const body = (await get(one.id)).json();
    expect(body.runs).toHaveLength(51);
    expect(body.runs.some((r: Run) => r.id === active.id)).toBe(true);
    expect(body.runs.some((r: Run) => r.id === unlinked.id)).toBe(false);
    expect(JSON.stringify(body)).not.toContain('segredo-sintetico');
    expect(body.repo.vars[0]).toMatchObject({ value: '', hasValue: true });
    await repos.setSelection({ paths: [] });
    expect((await get(one.id)).json().repo.imported).toBe(false);
  });

  it('serviço pertence a um projeto; bloqueia troca ativa e durante reinício pendente', async () => {
    const { actions, supervisor, manager, one, two, ptys, get, processes, ports, app } = await setup();
    vi.spyOn(processes, 'snapshot').mockResolvedValue({ ts: Date.now(), selfPid: 1, processes: [] });
    vi.spyOn(ports, 'list').mockResolvedValue({ ts: Date.now(), entries: [], limited: true });
    const a = actions.create({
      name: 'Servidor',
      command: 'node app.js',
      persistent: true,
      autoRestart: true,
      params: [{ name: 'repo', type: 'repo' }],
    });
    const size = { cols: 80, rows: 24 };
    const r = supervisor.start(a, size, { repo: one.id });
    expect(supervisor.start(a, size, { repo: one.id }).id).toBe(r.id);
    expect(() => supervisor.start(a, size, { repo: two.id })).toThrow(/outro projeto/);
    expect((await get(one.id)).json().actions[0]).toMatchObject({
      busyElsewhere: false,
      action: { service: { state: 'running' } },
    });
    expect((await get(two.id)).json().actions[0]).toMatchObject({
      busyElsewhere: true,
      action: { service: null, lastRun: null },
    });
    ptys.at(-1)!.exit(1);
    expect(() => supervisor.start(a, size, { repo: two.id })).toThrow(/outro projeto/);
    expect((await get(one.id)).json().actions[0].action.service.state).toBe('restarting');
    supervisor.stop(a.id);
    expect(supervisor.start(a, size, { repo: two.id }).repoPath).toBe(two.path);
    expect(manager.get(r.id).repoPath).toBe(one.path);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/actions/${a.id}/stop`,
          headers: AUTH,
          payload: { repoPath: one.path },
        })
      ).statusCode,
    ).toBe(409);
    expect(actions.get(a.id).service?.state).toBe('running');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/actions/${a.id}/stop`,
          headers: AUTH,
          payload: { repoPath: two.path },
        })
      ).statusCode,
    ).toBe(200);
  });

  it('inclui portas dos filhos e degrada sem perder histórico quando a coleta falha', async () => {
    const { actions, manager, one, get, processes, ports, ptys } = await setup();
    const a = actions.create({ name: 'Servidor', command: 'node app.js', params: [{ name: 'repo', type: 'repo' }] });
    const r = manager.start(a, { cols: 80, rows: 24, params: { repo: one.id } });
    const root = proc(r.pid!, 1, r.startedAt);
    const child = proc(r.pid! + 100, r.pid!, r.startedAt);
    vi.spyOn(processes, 'snapshot').mockResolvedValue({ ts: Date.now(), selfPid: 1, processes: [root, child] });
    const listener = {
      protocol: 'TCP' as const,
      port: 3456,
      pid: child.pid,
      command: 'node',
      user: 'teste',
      uid: 501,
      bindings: [{ address: '127.0.0.1', family: 'IPv4' as const }],
      scope: 'local' as const,
    };
    const spy = vi
      .spyOn(ports, 'list')
      .mockResolvedValue({
        ts: Date.now(),
        entries: [listener, { ...listener, pid: 999999, port: 3457 }],
        limited: true,
      });
    expect((await get(one.id)).json().ports).toEqual([listener]);
    spy.mockRejectedValue(new Error('lsof indisponível'));
    expect((await get(one.id)).json()).toMatchObject({
      runs: [{ id: r.id }],
      ports: [],
      warnings: [expect.stringContaining('Não foi possível')],
    });
    spy.mockImplementation(async () => {
      ptys.at(-1)!.exit(0);
      return { ts: Date.now(), entries: [listener], limited: true };
    });
    expect((await get(one.id)).json().ports).toEqual([]);
  });
});

function proc(pid: number, ppid: number, startedAt: number): ProcessInfo {
  return {
    pid,
    ppid,
    startedAt,
    uid: 501,
    user: 'teste',
    cpuPct: 0,
    memPct: 0,
    rssBytes: 0,
    vszBytes: 0,
    state: 'S',
    elapsedSec: 0,
    name: 'node',
    path: '/synthetic/node',
    command: 'node app.js',
  };
}

it('descarta PID reutilizado, execuções terminadas e processos externos; inclui descendentes', () => {
  const r = { pid: 100, status: 'running', startedAt: 10000 } as Run;
  const processes = [proc(102, 101, 10000), proc(101, 100, 10000), proc(100, 1, 10000), proc(200, 1, 10000)];
  expect([...projectPids([r], processes)].sort()).toEqual([100, 101, 102]);
  expect(projectPids([{ ...r, startedAt: 1000 }], processes).size).toBe(0);
  expect(projectPids([{ ...r, status: 'exited' }], processes).size).toBe(0);
});
