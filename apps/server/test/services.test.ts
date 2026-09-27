import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDb } from '../src/db/index.js';
import { ActionStore } from '../src/modules/actions/store.js';
import { RunManager } from '../src/modules/runs/manager.js';
import { RunStore } from '../src/modules/runs/store.js';
import { probeLocalPort, ServiceSupervisor, type ServiceEvent } from '../src/modules/services/supervisor.js';
import { fakeRunDeps } from './fake-pty.js';

afterEach(() => vi.useRealTimers());

function setup() {
  const db = openDb(':memory:');
  const runs = new RunStore(db);
  const actions = new ActionStore(db, runs);
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bm-svc-')));
  const fake = fakeRunDeps(home);
  const manager = new RunManager(runs, fake.deps, { shell: '/bin/bash', logsDir: path.join(home, 'runs'), flushMs: 1 });
  const clock = { now: 1_000_000 };
  const portOpen = { value: false };
  const events: ServiceEvent[] = [];
  const supervisor = new ServiceSupervisor(
    manager,
    actions,
    { probe: async () => portOpen.value, now: () => clock.now },
    { graceMs: 10_000, backoffBaseMs: 1_000, backoffMaxMs: 8_000, stableMs: 60_000 },
    (e) => events.push(e),
  );
  return { actions, manager, supervisor, clock, portOpen, events, ...fake };
}

const size = { cols: 80, rows: 24 };

describe('ServiceSupervisor', () => {
  it('estados: starting → up → unhealthy (avisa uma vez) → up', async () => {
    const { actions, supervisor, clock, portOpen, events } = setup();
    const a = actions.create({ name: 'Túnel', command: 'ssh -N x', persistent: true, expectedPort: 5432 });
    expect(actions.get(a.id).service?.state).toBe('stopped');
    supervisor.start(a, size);
    expect(actions.get(a.id).service).toMatchObject({ state: 'starting', port: 5432 });

    await supervisor.check(); // porta fechada, ainda na carência
    expect(actions.get(a.id).service?.state).toBe('starting');
    expect(events).toEqual([]);

    clock.now += 11_000;
    await supervisor.check(); // passou a carência sem responder
    expect(actions.get(a.id).service?.state).toBe('unhealthy');
    await supervisor.check();
    expect(events.map((e) => e.kind)).toEqual(['unhealthy']); // só uma vez

    portOpen.value = true;
    await supervisor.check();
    expect(actions.get(a.id).service?.state).toBe('up');
    expect(events.map((e) => e.kind)).toEqual(['unhealthy', 'up']);

    portOpen.value = false;
    await supervisor.check();
    expect(events.map((e) => e.kind)).toEqual(['unhealthy', 'up', 'unhealthy']);
  });

  it('sem porta configurada o estado é "running"; start repetido devolve a mesma execução', () => {
    const { actions, supervisor } = setup();
    const a = actions.create({ name: 'dev', command: 'npm run dev', persistent: true });
    const r1 = supervisor.start(a, size);
    const r2 = supervisor.start(a, size);
    expect(r2.id).toBe(r1.id);
    expect(actions.get(a.id).service?.state).toBe('running');
  });

  it('reinício automático com backoff exponencial; zera após rodar estável', async () => {
    vi.useFakeTimers();
    const { actions, supervisor, ptys, clock, events } = setup();
    const act = actions.create({
      name: 'T2',
      command: 'ssh {{h}}',
      persistent: true,
      autoRestart: true,
      params: [{ name: 'h' }],
    });
    supervisor.start(act, size, { h: 'bastion' });
    expect(ptys[0]!.opts.env.MACPIT_PARAM_H).toBe('bastion');

    ptys[0]!.exit(255); // caiu
    expect(actions.get(act.id).service).toMatchObject({
      state: 'restarting',
      restarts: 1,
      lastExit: 'failed (código 255)',
    });
    expect(events.at(-1)).toMatchObject({ kind: 'down', willRestartInMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(ptys).toHaveLength(2);
    expect(ptys[1]!.opts.env.MACPIT_PARAM_H).toBe('bastion'); // reusa os parâmetros

    ptys[1]!.exit(1);
    expect(events.at(-1)).toMatchObject({ willRestartInMs: 2000 });
    await vi.advanceTimersByTimeAsync(2000);
    ptys[2]!.exit(1);
    expect(events.at(-1)).toMatchObject({ willRestartInMs: 4000 });
    await vi.advanceTimersByTimeAsync(4000);
    ptys[3]!.exit(1);
    expect(events.at(-1)).toMatchObject({ willRestartInMs: 8000 }); // teto
    await vi.advanceTimersByTimeAsync(8000);

    // rodou bastante tempo antes de cair → backoff volta ao início
    clock.now += 120_000;
    vi.setSystemTime(Date.now() + 120_000);
    ptys[4]!.exit(1);
    expect(events.at(-1)).toMatchObject({ willRestartInMs: 1000 });
  });

  it('parar cancela reinício pendente; parada pelo usuário nunca reinicia', async () => {
    vi.useFakeTimers();
    const { actions, supervisor, ptys } = setup();
    const a = actions.create({ name: 'T', command: 'ssh', persistent: true, autoRestart: true });
    supervisor.start(a, size);
    ptys[0]!.exit(1);
    expect(actions.get(a.id).service?.state).toBe('restarting');
    supervisor.stop(a.id);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(ptys).toHaveLength(1);
    expect(actions.get(a.id).service?.state).toBe('stopped');

    supervisor.start(a, size);
    supervisor.stop(a.id); // SIGTERM → exit com sinal
    ptys[1]!.exit(0, 15);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(ptys).toHaveLength(2);
  });

  it('sem autoRestart: avisa a queda e fica parado', () => {
    const { actions, supervisor, ptys, events } = setup();
    const a = actions.create({ name: 'T', command: 'ssh', persistent: true });
    supervisor.start(a, size);
    ptys[0]!.exit(1);
    expect(events).toEqual([expect.objectContaining({ kind: 'down', willRestartInMs: null })]);
    expect(actions.get(a.id).service).toMatchObject({ state: 'stopped', lastExit: 'failed (código 1)' });
  });

  it('forget: para, cancela reinício e descarta o estado', async () => {
    vi.useFakeTimers();
    const { actions, supervisor, ptys } = setup();
    const a = actions.create({ name: 'T', command: 'ssh', persistent: true, autoRestart: true });
    supervisor.start(a, size);
    ptys[0]!.exit(1); // reinício agendado
    supervisor.forget(a.id);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(ptys).toHaveLength(1);
    expect(supervisor.state(a)).toMatchObject({ state: 'stopped', runId: null, restarts: 0 });
  });

  it('autoStartAll inicia só serviços marcados, com os padrões; falha de um não impede os outros', () => {
    const { actions, supervisor, ptys } = setup();
    actions.create({
      name: 'Túnel',
      command: 'ssh -L {{p}}:db:5432 b',
      persistent: true,
      autoStart: true,
      params: [{ name: 'p', default: '5433' }],
    });
    actions.create({ name: 'Manual', command: 'ssh', persistent: true });
    actions.create({ name: 'Quebrado', command: 'ssh', persistent: true, autoStart: true, cwd: '/nao/existe' });
    const r = supervisor.autoStartAll();
    expect(r.started).toEqual(['Túnel']);
    expect(r.failed).toEqual([{ name: 'Quebrado', error: expect.stringMatching(/não existe/) }]);
    expect(ptys).toHaveLength(1);
    expect(ptys[0]!.opts.env.MACPIT_PARAM_P).toBe('5433');
  });

  it('autoStart exige serviço e parâmetros com padrão não secreto', () => {
    const { actions } = setup();
    expect(() => actions.create({ name: 'a', command: 'ls', autoStart: true })).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
    expect(() =>
      actions.create({ name: 'b', command: 'ssh {{h}}', persistent: true, autoStart: true, params: [{ name: 'h' }] }),
    ).toThrow(/padrão/);
    expect(() =>
      actions.create({
        name: 'c',
        command: 'ssh {{h}}',
        persistent: true,
        autoStart: true,
        params: [{ name: 'h', default: 'x', secret: true }],
      }),
    ).toThrow(/padrão/);
  });

  it('recusa ação que não é serviço', () => {
    const { actions, supervisor } = setup();
    expect(() => supervisor.start(actions.create({ name: 'x', command: 'ls' }), size)).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });
});

describe('probeLocalPort', () => {
  it('porta aberta e fechada', async () => {
    const srv = net.createServer().listen(0, '127.0.0.1');
    await new Promise((r) => srv.once('listening', r));
    const port = (srv.address() as net.AddressInfo).port;
    expect(await probeLocalPort(port)).toBe(true);
    srv.close();
    await new Promise((r) => srv.once('close', r));
    expect(await probeLocalPort(port, 300)).toBe(false);
  });
});
