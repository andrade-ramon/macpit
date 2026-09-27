import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RunEvent } from '@macpit/shared';
import { openDb } from '../src/db/index.js';
import { ActionStore } from '../src/modules/actions/store.js';
import { defaultKillGroup, groupAlive, loadPtySpawn, RunManager } from '../src/modules/runs/manager.js';
import { RunStore } from '../src/modules/runs/store.js';

async function setup() {
  const db = openDb(':memory:');
  const runs = new RunStore(db);
  const actions = new ActionStore(db, runs);
  const logsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-runs-'));
  const manager = new RunManager(
    runs,
    { spawn: await loadPtySpawn(), killGroup: defaultKillGroup, isAlive: groupAlive, now: Date.now, home: os.homedir },
    { shell: '/bin/bash', logsDir, killGraceMs: 1500 },
  );
  return { actions, manager };
}

function collect(manager: RunManager, runId: string) {
  const producer = manager.resolver(`run:${runId}`)!;
  let output = '';
  let final: RunEvent | undefined;
  const done = new Promise<RunEvent>((resolve) => {
    producer.start((e) => {
      const ev = e as RunEvent;
      if (ev.kind === 'output') output += ev.data;
      if (ev.kind === 'status') {
        final = ev;
        resolve(ev);
      }
    });
  });
  return { done, output: () => output, final: () => final };
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe.runIf(process.platform === 'darwin')('RunManager com pty real', () => {
  it('saída, variáveis e exit code', async () => {
    const { actions, manager } = await setup();
    const a = actions.create({ name: 'eco', command: 'echo "ola $NOME"; exit 3', env: { NOME: 'mundo' } });
    const run = manager.start(a, { cols: 80, rows: 24 });
    const c = collect(manager, run.id);
    const ev = await c.done;
    expect(c.output()).toContain('ola mundo');
    expect(ev).toMatchObject({ kind: 'status', run: { status: 'failed', exitCode: 3 } });
  });

  it('input interativo (ex.: senha)', async () => {
    const { actions, manager } = await setup();
    const run = manager.start(actions.create({ name: 'read', command: 'read -r x; echo "recebi:$x"' }), {
      cols: 80,
      rows: 24,
    });
    const c = collect(manager, run.id);
    await new Promise((r) => setTimeout(r, 300));
    manager.input(run.id, 'segredo\r');
    const ev = await c.done;
    expect(c.output()).toContain('recebi:segredo');
    expect(ev).toMatchObject({ run: { status: 'exited', exitCode: 0 } });
  });

  it('stop encerra o grupo inteiro, incluindo filhos (como um túnel ssh)', async () => {
    const { actions, manager } = await setup();
    const run = manager.start(actions.create({ name: 'tunel', command: 'sleep 60 & echo "filho:$!"; wait' }), {
      cols: 80,
      rows: 24,
    });
    const c = collect(manager, run.id);
    let child = 0;
    for (let i = 0; i < 50 && !child; i++) {
      await new Promise((r) => setTimeout(r, 50));
      child = Number(/filho:(\d+)/.exec(c.output())?.[1] ?? 0);
    }
    expect(alive(child)).toBe(true);
    manager.stop(run.id);
    const ev = await c.done;
    expect(ev).toMatchObject({ run: { status: 'killed' } });
    await new Promise((r) => setTimeout(r, 200));
    expect(alive(child)).toBe(false);
  });

  it('desligamento: processo que ignora SIGTERM leva SIGKILL após o prazo', async () => {
    const { actions, manager } = await setup();
    const run = manager.start(actions.create({ name: 'teimoso', command: "trap '' TERM; echo pronto; sleep 60" }), {
      cols: 80,
      rows: 24,
    });
    const c = collect(manager, run.id);
    for (let i = 0; i < 50 && !c.output().includes('pronto'); i++) await new Promise((r) => setTimeout(r, 50));
    const pid = manager.get(run.id).pid!;
    expect(groupAlive(pid)).toBe(true);
    await manager.shutdown(); // killGraceMs = 1500 neste setup
    await new Promise((r) => setTimeout(r, 200));
    expect(groupAlive(pid)).toBe(false);
  });

  it('comando instantâneo: quem abre o terminal no instante do fim vê a saída', async () => {
    const { actions, manager } = await setup();
    // assina no instante em que termina (antes de o stream do log gravar no disco)
    const replay = new Promise<{ kind: string; data: string }>((resolve) => {
      const off = manager.onFinish((r) => {
        off();
        resolve(manager.resolver(`run:${r.id}`)!.initial!() as { kind: string; data: string });
      });
    });
    manager.start(actions.create({ name: 'rapido', command: 'echo "saida-rapida"' }), { cols: 80, rows: 24 });
    const r = await replay;
    expect(r.kind).toBe('replay');
    expect(r.data).toContain('saida-rapida');
  });

  it('usa shell de login (-l): PATH do perfil disponível', async () => {
    const { actions, manager } = await setup();
    const run = manager.start(actions.create({ name: 'path', command: 'shopt -q login_shell && echo LOGIN' }), {
      cols: 80,
      rows: 24,
    });
    const c = collect(manager, run.id);
    await c.done;
    expect(c.output()).toContain('LOGIN');
    expect(execFileSync('/bin/bash', ['-c', 'echo ok']).toString().trim()).toBe('ok');
  });
});
