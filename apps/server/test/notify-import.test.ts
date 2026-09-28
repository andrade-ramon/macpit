import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Action, DiskVolume, Run } from '@macpit/shared';
import { buildApp } from '../src/app.js';
import { openDb } from '../src/db/index.js';
import { SettingsStore } from '../src/db/settings.js';
import {
  parseAliasOutput,
  parseFunctionSources,
  readShellEntries,
  unquoteShell,
} from '../src/modules/actions/shellImport.js';
import { Notifier } from '../src/modules/notify/notifier.js';
import { fakeRunDeps } from './fake-pty.js';
import { AUTH, TOKEN, testConfig } from './helpers.js';

const run = (over: Partial<Run>): Run => ({
  id: 'r',
  actionId: 'a',
  actionName: 'Build',
  command: 'make',
  cwd: '/',
  pid: 1,
  status: 'exited',
  exitCode: 0,
  signal: null,
  startedAt: 0,
  endedAt: 1,
  logBytes: 0,
  repoPath: null,
  ...over,
});

describe('Notifier', () => {
  function setup() {
    const send = vi.fn(async () => {});
    return { send, n: new Notifier(new SettingsStore(openDb(':memory:')), send) };
  }

  it('padrão: só falhas; nunca paradas pelo usuário nem serviços', () => {
    const { send, n } = setup();
    n.runFinished(run({}), false);
    n.runFinished(run({ status: 'killed' }), false);
    n.runFinished(run({ status: 'failed', exitCode: 2 }), true);
    expect(send).not.toHaveBeenCalled();
    n.runFinished(run({ status: 'failed', exitCode: 2 }), false);
    expect(send).toHaveBeenCalledWith('macpit', 'Build: falhou (código 2)');
  });

  it('respeita configurações', () => {
    const { send, n } = setup();
    n.update({ enabled: true, runs: 'all', services: false, disk: true });
    n.runFinished(run({}), false);
    expect(send).toHaveBeenLastCalledWith('macpit', 'Build: concluída');
    n.serviceEvent({ kind: 'up', action: { name: 'T' } as Action, port: 1 });
    expect(send).toHaveBeenCalledTimes(1);
    n.update({ enabled: false, runs: 'all', services: true, disk: true });
    n.runFinished(run({ status: 'failed' }), false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('serviço e disco (só na transição)', () => {
    const { send, n } = setup();
    n.serviceEvent({ kind: 'down', action: { name: 'Túnel' } as Action, run: run({}), willRestartInMs: 4000 });
    expect(send).toHaveBeenLastCalledWith('macpit', 'Túnel caiu — reiniciando em 4s');
    const vol = (alert: boolean) => ({ mount: '/', name: 'Disco do sistema', usedPct: 91.2, alert }) as DiskVolume;
    n.diskVolumes([vol(true)]);
    n.diskVolumes([vol(true)]);
    expect(send).toHaveBeenCalledTimes(2);
    n.diskVolumes([vol(false)]);
    n.diskVolumes([vol(true)]);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('falha ao enviar não propaga', async () => {
    const log = vi.fn();
    const n = new Notifier(new SettingsStore(openDb(':memory:')), async () => Promise.reject(new Error('x')), log);
    n.runFinished(run({ status: 'failed' }), false);
    await new Promise((r) => setTimeout(r, 5));
    expect(log).toHaveBeenCalled();
  });
});

describe('importação do shell', () => {
  it('unquoteShell', () => {
    expect(unquoteShell("'ls -la'")).toBe('ls -la');
    expect(unquoteShell("'it'\\''s'")).toBe("it's");
    expect(unquoteShell('git')).toBe('git');
    expect(unquoteShell("$'a\\nb'")).toBeUndefined();
    expect(unquoteShell("'aberto")).toBeUndefined();
  });

  it('aliases do zsh e do bash, filtrando navegação', () => {
    const zsh = "-='cd -'\n...=../..\ng=git\nll='ls -la'\ngst='git status'\nnada=''\nlixo sem igual\n";
    expect(parseAliasOutput(zsh)).toEqual([
      { name: 'g', value: 'git' },
      { name: 'll', value: 'ls -la' },
      { name: 'gst', value: 'git status' },
    ]);
    expect(parseAliasOutput("alias dbt='ssh -N -L 5432:db:5432 bastion'\n")).toEqual([
      { name: 'dbt', value: 'ssh -N -L 5432:db:5432 bastion' },
    ]);
  });

  it('funções só dos seus arquivos, fora de frameworks', () => {
    const text = [
      'dbopen\t/Users/a/.zsh_aliases',
      '_priv\t/Users/a/.zshrc',
      'omz_x\t/Users/a/.oh-my-zsh/lib/x.zsh',
      'nvm_x\t/Users/a/.nvm/nvm.sh',
      'brew_x\t/opt/homebrew/share/x',
      'semfonte\t',
      'kill_port\t/Users/a/.zshrc',
    ].join('\n');
    expect(parseFunctionSources(text, '/Users/a')).toEqual([
      { name: 'dbopen', file: '/Users/a/.zsh_aliases' },
      { name: 'kill_port', file: '/Users/a/.zshrc' },
    ]);
  });

  it('readShellEntries gera comandos seguros para funções', async () => {
    const r = await readShellEntries({
      shell: '/bin/zsh',
      home: '/Users/a',
      runInteractive: async (_s, script) =>
        script === 'alias' ? "tunel='ssh -N bastion'\n" : 'dbopen\t/Users/a/.zsh_aliases\n',
    });
    expect(r.entries).toEqual([
      { kind: 'alias', name: 'tunel', command: 'ssh -N bastion', detail: 'ssh -N bastion' },
      { kind: 'function', name: 'dbopen', command: `/bin/zsh -ic 'dbopen "$@"' _`, detail: '~/.zsh_aliases' },
    ]);
    const bash = await readShellEntries({ shell: '/bin/bash', home: '/h', runInteractive: async () => '' });
    expect(bash.warning).toMatch(/zsh/);
  });
});

describe('rotas da fase 6', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => close?.());

  async function setup() {
    const fake = fakeRunDeps('/tmp');
    const send = vi.fn(async () => {});
    const built = await buildApp(testConfig(), TOKEN, {
      db: openDb(':memory:'),
      audit: () => {},
      runDeps: fake.deps,
      notify: send,
      supervisorDeps: { probe: async () => true, now: Date.now },
      shellImport: () => ({
        shell: '/bin/zsh',
        home: '/h',
        runInteractive: async (_s, c) => (c === 'alias' ? "t='echo oi'\n" : ''),
      }),
    });
    close = () => built.app.close();
    const req = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
      built.app.inject({ method, url, headers: AUTH, ...(payload ? { payload } : {}) });
    return { ...built, ...fake, send, req };
  }

  it('template inválido → 400 com mensagem; parâmetros na execução', async () => {
    const { req, ptys } = await setup();
    const bad = await req('POST', '/api/actions', { name: 'x', command: "ssh '{{host}}'", params: [{ name: 'host' }] });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toMatch(/aspas simples/);
    const a = (
      await req('POST', '/api/actions', {
        name: 'x',
        command: 'ssh {{host}}',
        params: [{ name: 'host', secret: true }],
      })
    ).json();
    expect((await req('POST', `/api/actions/${a.id}/run`, {})).json().error).toMatch(/informe um valor/);
    const r = await req('POST', `/api/actions/${a.id}/run`, { params: { host: 'b; id' } });
    expect(r.statusCode).toBe(201);
    expect(ptys[0]!.args).toEqual(['-lc', 'ssh "${MACPIT_PARAM_HOST}"']);
    expect(ptys[0]!.opts.env.MACPIT_PARAM_HOST).toBe('b; id');
    expect(r.json().command).toBe('ssh {{host}}'); // guarda o template, não o valor
  });

  it('serviço: run via supervisor, estado e stop', async () => {
    const { req, supervisor } = await setup();
    const a = (
      await req('POST', '/api/actions', { name: 'T', command: 'ssh -N', persistent: true, expectedPort: 5432 })
    ).json();
    expect(a.service).toMatchObject({ state: 'stopped', port: 5432 });
    await req('POST', `/api/actions/${a.id}/run`, {});
    await supervisor.check();
    expect((await req('GET', `/api/actions/${a.id}`)).json().service.state).toBe('up');
    expect((await req('POST', `/api/actions/${a.id}/stop`)).statusCode).toBe(200);
    const plain = (await req('POST', '/api/actions', { name: 'P', command: 'ls' })).json();
    expect((await req('POST', `/api/actions/${plain.id}/stop`)).statusCode).toBe(400);
    expect((await req('POST', '/api/actions', { name: 'Z', command: 'ls', autoRestart: true })).statusCode).toBe(400);
  });

  it('exportar e importar (pula nomes existentes e reporta inválidas)', async () => {
    const { req } = await setup();
    await req('POST', '/api/actions', {
      name: 'A',
      command: 'echo {{x}}',
      params: [{ name: 'x', default: '1' }],
      group: 'G',
    });
    const exp = await req('GET', '/api/actions/export');
    expect(exp.headers['content-disposition']).toMatch(/attachment; filename="macpit-acoes-\d{4}-\d{2}-\d{2}\.json"/);
    const body = exp.json();
    expect(body).toMatchObject({ format: 'macpit/actions', version: 1 });
    expect(body.actions[0]).toEqual({
      name: 'A',
      command: 'echo {{x}}',
      env: {},
      group: 'G',
      favorite: false,
      persistent: false,
      autoRestart: false,
      autoStart: false,
      params: [{ name: 'x', default: '1', secret: false, type: 'text' }],
    });
    const imp = await req('POST', '/api/actions/import', {
      actions: [...body.actions, { name: 'B', command: 'ls' }, { name: 'C', command: '' }],
    });
    expect(imp.json()).toEqual({
      created: 1,
      skipped: [
        { name: 'A', reason: 'já existe uma ação com esse nome' },
        { name: 'C', reason: expect.stringMatching(/inválida/) },
      ],
    });
    expect(
      (await req('POST', '/api/actions/import', { actions: body.actions, onConflict: 'duplicate' })).json().created,
    ).toBe(1);
    expect((await req('POST', '/api/actions/import', { actions: [] })).statusCode).toBe(400);
  });

  it('importação do shell e configurações de notificação', async () => {
    const { req, send } = await setup();
    expect((await req('POST', '/api/import/shell')).json().entries).toEqual([
      { kind: 'alias', name: 't', command: 'echo oi', detail: 'echo oi' },
    ]);
    expect((await req('GET', '/api/settings/notifications')).json()).toEqual({
      enabled: true,
      runs: 'failures',
      services: true,
      disk: true,
    });
    expect((await req('PUT', '/api/settings/notifications', { enabled: true })).statusCode).toBe(400);
    const next = { enabled: true, runs: 'all', services: false, disk: false };
    expect((await req('PUT', '/api/settings/notifications', next)).json()).toEqual(next);
    expect((await req('POST', '/api/settings/notifications/test')).json()).toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith('macpit', expect.stringContaining('funcionando'));
  });
});
