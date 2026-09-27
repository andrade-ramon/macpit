import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunEvent } from '@macpit/shared';
import { buildApp } from '../src/app.js';
import { openDb } from '../src/db/index.js';
import { ActionStore } from '../src/modules/actions/store.js';
import { RunManager } from '../src/modules/runs/manager.js';
import { RunStore } from '../src/modules/runs/store.js';
import { fakeRunDeps } from './fake-pty.js';
import { AUTH, HOST, TOKEN, testConfig } from './helpers.js';

const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bm-act-')));

function setup(opts: Partial<ConstructorParameters<typeof RunManager>[2]> = {}) {
  const db = openDb(':memory:');
  const runs = new RunStore(db);
  const actions = new ActionStore(db, runs);
  const home = tmp();
  const fake = fakeRunDeps(home);
  const audit = vi.fn();
  const manager = new RunManager(
    runs,
    fake.deps,
    { shell: '/bin/bash', logsDir: path.join(tmp(), 'runs'), flushMs: 1, ...opts },
    audit,
  );
  return { db, runs, actions, manager, home, audit, ...fake };
}

const wait = (ms = 5) => new Promise((r) => setTimeout(r, ms));

describe('ActionStore', () => {
  it('CRUD com normalização e ordenação (favoritas primeiro)', () => {
    const { actions } = setup();
    const a = actions.create({
      name: 'Túnel DB',
      command: 'ssh -L 5432:db:5432 bastion',
      cwd: '',
      group: 'Infra',
      icon: '🔌',
      env: { AWS_PROFILE: 'dev' },
    });
    expect(a).toMatchObject({
      name: 'Túnel DB',
      group: 'Infra',
      favorite: false,
      env: { AWS_PROFILE: 'dev' },
      lastRun: null,
      runningCount: 0,
    });
    expect(a.cwd).toBeUndefined();
    const b = actions.create({ name: 'build', command: 'make', favorite: true });
    expect(actions.list().map((x) => x.id)).toEqual([b.id, a.id]);
    const up = actions.update(a.id, { name: 'Túnel', command: 'ssh x', favorite: true });
    expect(up).toMatchObject({ name: 'Túnel', env: {}, favorite: true });
    expect(up.group).toBeUndefined();
    actions.delete(a.id);
    expect(() => actions.get(a.id)).toThrow(expect.objectContaining({ statusCode: 404 }));
  });

  it('valida entrada', () => {
    const { actions } = setup();
    expect(() => actions.create({ name: '', command: 'x' })).toThrow();
    expect(() => actions.create({ name: 'a', command: 'x', env: { 'BAD-KEY': '1' } })).toThrow();
  });
});

describe('RunManager (pty falso)', () => {
  afterEach(() => vi.useRealTimers());

  it('inicia com shell -lc, cwd resolvido e variáveis', () => {
    const { actions, manager, ptys, home, audit } = setup();
    const a = actions.create({ name: 't', command: 'echo $FOO', env: { FOO: 'bar' } });
    const run = manager.start(a, { cols: 100, rows: 30 });
    expect(run).toMatchObject({ status: 'running', actionId: a.id, cwd: home, pid: ptys[0]!.pid });
    expect(ptys[0]!.file).toBe('/bin/bash');
    expect(ptys[0]!.args).toEqual(['-lc', 'echo $FOO']);
    expect(ptys[0]!.opts).toMatchObject({ cols: 100, rows: 30, cwd: home });
    expect(ptys[0]!.opts.env).toMatchObject({
      FOO: 'bar',
      MACPIT_RUN_ID: run.id,
      MACPIT_ACTION_ID: a.id,
      TERM: 'xterm-256color',
    });
    expect(audit).toHaveBeenCalledWith('run', 't', expect.objectContaining({ command: 'echo $FOO' }));
    expect(actions.get(a.id).runningCount).toBe(1);
  });

  it('cwd inexistente ou relativo → 400', () => {
    const { actions, manager } = setup();
    expect(() =>
      manager.start(actions.create({ name: 'a', command: 'x', cwd: '/nao/existe' }), { cols: 80, rows: 24 }),
    ).toThrow(expect.objectContaining({ statusCode: 400, code: 'bad_cwd' }));
    expect(() =>
      manager.start(actions.create({ name: 'b', command: 'x', cwd: 'rel' }), { cols: 80, rows: 24 }),
    ).toThrow(expect.objectContaining({ code: 'bad_cwd' }));
  });

  it('saída: agrupada ao vivo, replay para quem chega depois, log 0600 e status final', async () => {
    const { actions, manager, ptys, runs } = setup();
    const a = actions.create({ name: 't', command: 'x' });
    const run = manager.start(a, { cols: 80, rows: 24 });
    const producer = manager.resolver(`run:${run.id}`)!;
    const events: RunEvent[] = [];
    const stop = producer.start((e) => events.push(e as RunEvent));

    ptys[0]!.emit('ola ');
    ptys[0]!.emit('mundo\r\n');
    await wait();
    expect(events).toEqual([{ kind: 'output', data: 'ola mundo\r\n' }]);
    expect(producer.initial!()).toMatchObject({
      kind: 'replay',
      data: 'ola mundo\r\n',
      truncated: false,
      run: { status: 'running' },
    });

    ptys[0]!.exit(0);
    await wait();
    expect(events.at(-1)).toMatchObject({ kind: 'status', run: { status: 'exited', exitCode: 0 } });
    stop();
    const stored = runs.get(run.id)!;
    expect(stored).toMatchObject({ status: 'exited', logBytes: 11 });
    await wait(20);
    expect(fs.readFileSync(stored.logPath, 'utf8')).toBe('ola mundo\r\n');
    expect(fs.statSync(stored.logPath).mode & 0o777).toBe(0o600);
    // execução terminada: replay vem do arquivo
    expect(manager.resolver(`run:${run.id}`)!.initial!()).toMatchObject({
      kind: 'replay',
      data: 'ola mundo\r\n',
      run: { status: 'exited' },
    });
    expect(manager.resolver('run:nada')).toBeUndefined();
  });

  it('quem assina com saída ainda no lote não recebe nada duplicado', async () => {
    const { actions, manager, ptys } = setup({ flushMs: 20 });
    const run = manager.start(actions.create({ name: 't', command: 'x' }), { cols: 80, rows: 24 });
    ptys[0]!.emit('Conectando...\r\nSenha: '); // ainda não liberado para o WS
    const producer = manager.resolver(`run:${run.id}`)!;
    const collect = () => {
      let text = (producer.initial!() as { data: string }).data;
      return {
        add: (e: unknown) => (text += (e as RunEvent).kind === 'output' ? (e as { data: string }).data : ''),
        text: () => text,
      };
    };
    const first = collect();
    producer.start(first.add); // 1º inscrito
    const second = collect(); // 2º inscrito recebe só o initial; ao vivo vem pelo broadcast
    await wait(40);
    expect(first.text()).toBe('Conectando...\r\nSenha: ');
    // o broadcast do lote pendente também chega ao 2º (o hub repassa a todos)
    second.add({ kind: 'output', data: 'Conectando...\r\nSenha: ' });
    expect(second.text()).toBe('Conectando...\r\nSenha: ');
  });

  it('buffer limitado marca truncated', () => {
    const { actions, manager, ptys } = setup({ bufferBytes: 10 });
    const run = manager.start(actions.create({ name: 't', command: 'x' }), { cols: 80, rows: 24 });
    ptys[0]!.emit('0123456789ABCDEF');
    expect(manager.resolver(`run:${run.id}`)!.initial!()).toMatchObject({ data: '6789ABCDEF', truncated: true });
  });

  it('exit code ≠ 0 e sinal viram failed', async () => {
    const { actions, manager, ptys } = setup();
    const a = actions.create({ name: 't', command: 'x' });
    const r1 = manager.start(a, { cols: 80, rows: 24 });
    ptys[0]!.exit(2);
    const r2 = manager.start(a, { cols: 80, rows: 24 });
    ptys[1]!.exit(0, 15);
    expect(manager.get(r1.id)).toMatchObject({ status: 'failed', exitCode: 2, signal: null });
    expect(manager.get(r2.id)).toMatchObject({ status: 'failed', signal: 'SIGTERM' });
  });

  it('stop: SIGTERM no grupo, SIGKILL após o prazo, status killed; 409 se já terminou', async () => {
    vi.useFakeTimers();
    const { actions, manager, ptys, kills, audit } = setup({ killGraceMs: 1000 });
    const run = manager.start(actions.create({ name: 't', command: 'sleep 99' }), { cols: 80, rows: 24 });
    manager.stop(run.id);
    manager.stop(run.id); // idempotente
    expect(kills).toEqual([[ptys[0]!.pid, 'SIGTERM']]);
    vi.advanceTimersByTime(1000);
    expect(kills).toEqual([
      [ptys[0]!.pid, 'SIGTERM'],
      [ptys[0]!.pid, 'SIGKILL'],
    ]);
    ptys[0]!.exit(0, 9);
    expect(manager.get(run.id)).toMatchObject({ status: 'killed', signal: 'SIGKILL' });
    expect(audit).toHaveBeenCalledWith('stop', 't', expect.anything());
    expect(() => manager.stop(run.id)).toThrow(expect.objectContaining({ statusCode: 409 }));
  });

  it('input e resize só com execução ativa', () => {
    const { actions, manager, ptys } = setup();
    const run = manager.start(actions.create({ name: 't', command: 'x' }), { cols: 80, rows: 24 });
    expect(manager.input(run.id, 'senha\r')).toBeUndefined();
    manager.resize(run.id, 132, 40);
    expect(ptys[0]!.written).toEqual(['senha\r']);
    expect(ptys[0]!.size).toEqual([132, 40]);
    ptys[0]!.exit(0);
    expect(manager.input(run.id, 'x')).toMatch(/não está rodando/);
  });

  it('mantém só as últimas N execuções por ação e apaga os logs', async () => {
    const { actions, manager, ptys, runs } = setup({ keepRuns: 2 });
    const a = actions.create({ name: 't', command: 'x' });
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      ids.push(manager.start(a, { cols: 80, rows: 24 }).id);
      ptys[i]!.emit(`run ${i}`);
      await wait(2);
      ptys[i]!.exit(0);
    }
    expect(runs.list({ actionId: a.id, limit: 10 }).map((r) => r.id)).toEqual([ids[3], ids[2]]);
  });

  it('shutdown: grava killed, SIGTERM e SIGKILL só em quem sobrevive; recusa novas execuções', async () => {
    const { actions, manager, runs, kills, ptys, stubborn } = setup({ killGraceMs: 150 });
    const a = actions.create({ name: 't', command: 'x' });
    const r1 = manager.start(a, { cols: 80, rows: 24 });
    const r2 = manager.start(a, { cols: 80, rows: 24 });
    stubborn.add(ptys[1]!.pid); // ignora SIGTERM
    await manager.shutdown();
    expect(kills).toEqual([
      [ptys[0]!.pid, 'SIGTERM'],
      [ptys[1]!.pid, 'SIGTERM'],
      [ptys[1]!.pid, 'SIGKILL'],
    ]);
    expect(runs.get(r1.id)!.status).toBe('killed');
    expect(runs.get(r2.id)!.status).toBe('killed');
    ptys[0]!.exit(0); // callback tardio é ignorado
    expect(runs.get(r1.id)!.status).toBe('killed');
    expect(() => manager.start(a, { cols: 80, rows: 24 })).toThrow(expect.objectContaining({ statusCode: 503 }));
  });

  it('recoverInterrupted: marca interrompidas e reporta as que ainda estão vivas', () => {
    const { actions, manager, runs, ptys } = setup();
    const a = actions.create({ name: 'tunel', command: 'x' });
    const r1 = manager.start(a, { cols: 80, rows: 24 });
    const r2 = manager.start(a, { cols: 80, rows: 24 });
    expect(manager.runningIds()).toHaveLength(2);
    // simula queda do servidor: nova instância com o mesmo banco; só o 1º processo ainda existe
    const deps = { ...fakeRunDeps('/tmp').deps, isAlive: (pid: number) => pid === ptys[0]!.pid };
    const next = new RunManager(runs, deps, { shell: '/bin/bash', logsDir: path.join(tmp(), 'runs') });
    const { count, survivors } = next.recoverInterrupted();
    expect(count).toBe(2);
    expect(survivors).toEqual([{ runId: r1.id, pid: ptys[0]!.pid, actionName: 'tunel' }]);
    expect(runs.get(r2.id)!.status).toBe('interrupted');
  });

  it('limite de execuções simultâneas → 429', () => {
    const { actions, manager } = setup({ maxConcurrent: 2 });
    const a = actions.create({ name: 't', command: 'x' });
    manager.start(a, { cols: 80, rows: 24 });
    manager.start(a, { cols: 80, rows: 24 });
    expect(() => manager.start(a, { cols: 80, rows: 24 })).toThrow(
      expect.objectContaining({ statusCode: 429, code: 'too_many_runs' }),
    );
  });

  it('canal aberto de execução apagada pela retenção não quebra (replay "gone")', () => {
    const { actions, manager, ptys, db } = setup();
    const run = manager.start(actions.create({ name: 't', command: 'x' }), { cols: 80, rows: 24 });
    const producer = manager.resolver(`run:${run.id}`)!;
    ptys[0]!.exit(0);
    db.prepare('DELETE FROM runs WHERE id = ?').run(run.id);
    expect(producer.initial!()).toEqual({ kind: 'gone' });
  });
});

describe('rotas de ações', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => close?.());

  async function app() {
    const home = tmp();
    const fake = fakeRunDeps(home);
    const built = await buildApp(testConfig(), TOKEN, { db: openDb(':memory:'), audit: () => {}, runDeps: fake.deps });
    close = () => built.app.close();
    return { ...built, ...fake };
  }

  it('CRUD, execução, histórico, log e stop', async () => {
    const { app: a, ptys } = await app();
    const req = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
      a.inject({ method, url, headers: AUTH, ...(payload ? { payload } : {}) });

    expect((await a.inject({ url: '/api/actions', headers: HOST })).statusCode).toBe(401);
    expect((await req('POST', '/api/actions', { name: '' })).statusCode).toBe(400);
    const created = await req('POST', '/api/actions', { name: 'Túnel', command: 'ssh -N bastion' });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;

    expect(
      (await req('PUT', `/api/actions/${id}`, { name: 'Túnel DB', command: 'ssh -N bastion', group: 'Infra' })).json()
        .group,
    ).toBe('Infra');
    expect((await req('GET', '/api/actions')).json()).toHaveLength(1);

    const started = await req('POST', `/api/actions/${id}/run`, { cols: 90, rows: 20 });
    expect(started.statusCode).toBe(201);
    const runId = started.json().id as string;
    expect(ptys[0]!.opts).toMatchObject({ cols: 90, rows: 20 });
    ptys[0]!.emit('conectado\r\n');
    await wait(20);

    expect((await req('GET', `/api/actions/${id}`)).json()).toMatchObject({
      runningCount: 1,
      lastRun: { id: runId, status: 'running' },
    });
    expect((await req('GET', `/api/runs?actionId=${id}`)).json()).toHaveLength(1);
    expect((await req('POST', `/api/runs/${runId}/stop`)).json().status).toBe('running');
    ptys[0]!.exit(0, 15);
    expect((await req('GET', `/api/runs/${runId}`)).json()).toMatchObject({ status: 'killed' });
    expect((await req('POST', `/api/runs/${runId}/stop`)).statusCode).toBe(409);
    await wait(20);
    const log = await req('GET', `/api/runs/${runId}/log`);
    expect(log.headers['content-type']).toMatch(/text\/plain/);
    expect(log.body).toBe('conectado\r\n');
    expect((await req('GET', '/api/runs/nao-existe')).statusCode).toBe(404);

    expect((await req('DELETE', `/api/actions/${id}`)).statusCode).toBe(204);
    // execução continua no histórico, sem ação
    expect((await req('GET', `/api/runs/${runId}`)).json()).toMatchObject({ actionId: null, actionName: 'Túnel DB' });
  });
});
