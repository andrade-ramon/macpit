import type { Action, ActionParam, Repo, ServiceState } from '@macpit/shared';
import { describe, expect, it } from 'vitest';
import {
  applyRepoVars,
  describeRun,
  findRepo,
  envToRows,
  groupActions,
  initialParamValues,
  missingParams,
  repoProvided,
  rowsToEnv,
  runDurationMs,
  serviceBadge,
} from './actionUtils';

const a = (name: string, extra: Partial<Action> = {}): Action => ({
  id: name,
  name,
  command: 'x',
  env: {},
  favorite: false,
  persistent: false,
  autoRestart: false,
  autoStart: false,
  params: [],
  createdAt: 0,
  updatedAt: 0,
  lastRun: null,
  runningCount: 0,
  service: null,
  ...extra,
});

describe('groupActions', () => {
  it('favoritas, grupos em ordem e "Sem grupo" por último', () => {
    const groups = groupActions([
      a('z-sem'),
      a('túnel', { group: 'Infra' }),
      a('build', { group: 'Dev' }),
      a('deploy', { group: 'Infra', favorite: true }),
      a('api', { group: 'Dev' }),
    ]);
    expect(groups.map((g) => [g.title, g.items.map((i) => i.name)])).toEqual([
      ['Favoritas', ['deploy']],
      ['Dev', ['api', 'build']],
      ['Infra', ['túnel']],
      ['Sem grupo', ['z-sem']],
    ]);
  });
});

describe('describeRun', () => {
  it.each([
    [{ status: 'exited', exitCode: 0, signal: null }, 'concluída'],
    [{ status: 'failed', exitCode: 2, signal: null }, 'falhou (código 2)'],
    [{ status: 'failed', exitCode: 0, signal: 'SIGSEGV' }, 'falhou (SIGSEGV)'],
    [{ status: 'killed', exitCode: 0, signal: 'SIGTERM' }, 'parada (SIGTERM)'],
    [{ status: 'running', exitCode: null, signal: null }, 'rodando'],
  ] as const)('%o → %s', (run, expected) => expect(describeRun(run)).toBe(expected));
});

describe('env e duração', () => {
  it('converte linhas', () => {
    expect(
      rowsToEnv([
        { key: ' A ', value: '1' },
        { key: '', value: 'x' },
        { key: 'A', value: '2' },
      ]),
    ).toEqual({ A: '2' });
    expect(envToRows({ B: 'x' })).toEqual([{ key: 'B', value: 'x' }]);
  });

  it('duração usa agora enquanto roda', () => {
    expect(runDurationMs({ startedAt: 1000, endedAt: 4000 })).toBe(3000);
    expect(runDurationMs({ startedAt: 1000, endedAt: null }, 1500)).toBe(500);
  });
});

describe('serviceBadge / params', () => {
  const s = (over: Partial<ServiceState>): ServiceState => ({
    state: 'stopped',
    runId: null,
    port: 5432,
    restartAt: null,
    restarts: 0,
    lastCheckAt: null,
    lastExit: null,
    ...over,
  });

  it('textos por estado', () => {
    expect(serviceBadge(s({ state: 'up' })).text).toBe('conectado :5432');
    expect(serviceBadge(s({ state: 'unhealthy' }))).toMatchObject({ text: 'sem resposta :5432', active: true });
    expect(serviceBadge(s({ state: 'restarting', restartAt: 10_000, restarts: 3 }), 2_500).text).toBe(
      'reiniciando em 8s (3ª)',
    );
    expect(serviceBadge(s({ lastExit: 'failed (código 255)' }))).toMatchObject({
      text: 'parado · failed (código 255)',
      active: false,
    });
    expect(serviceBadge(s({ state: 'running', port: null })).text).toBe('rodando');
  });

  it('parâmetros faltando e valores iniciais', () => {
    expect(missingParams('ssh -L {{port}}:db {{host}}', [{ name: 'PORT' }])).toEqual(['host']);
    expect(
      initialParamValues([
        { name: 'a', default: '1', secret: false, type: 'text' },
        { name: 's', default: 'x', secret: true, type: 'text' },
        { name: 'b', secret: false, type: 'text' },
      ]),
    ).toEqual({
      a: '1',
      s: '',
      b: '',
    });
  });

  it('repositórios: achar pela referência e preencher com as variáveis', () => {
    const repo = (name: string, extra: Partial<Repo> = {}): Repo => ({
      id: `id-${name}`,
      name,
      path: `/code/${name}`,
      remote: null,
      github: null,
      branch: 'main',
      vars: [],
      imported: true,
      ...extra,
    });
    const api = repo('api', {
      github: 'Org/API',
      vars: [
        { name: 'DB_HOST', value: 'prod.db', secret: false, hasValue: true },
        { name: 'db_pass', value: '', secret: true, hasValue: true },
      ],
    });
    const repos = [api, repo('web'), repo('dup'), repo('dup', { id: 'id-dup2', path: '/x/dup' })];
    expect(findRepo(repos, 'id-web')?.name).toBe('web');
    expect(findRepo(repos, 'org/api')).toBe(api);
    expect(findRepo(repos, '/code/web')?.id).toBe('id-web');
    expect(findRepo(repos, 'dup')).toBeUndefined(); // ambíguo
    expect(findRepo(repos, undefined)).toBeUndefined();

    const params: ActionParam[] = [
      { name: 'repo', type: 'repo', secret: false },
      { name: 'DB_HOST', type: 'text', secret: false, default: 'localhost' },
      { name: 'DB_PASS', type: 'text', secret: true },
      { name: 'porta', type: 'text', secret: false, default: '5432' },
    ];
    expect(applyRepoVars(params, { repo: 'id-api', porta: '6000' }, api)).toEqual({
      repo: 'id-api',
      DB_HOST: 'prod.db',
      DB_PASS: '',
      porta: '5432',
    });
    expect(applyRepoVars(params, { repo: 'id-web', DB_HOST: 'prod.db' }, repos[1]).DB_HOST).toBe('localhost');
    expect([...repoProvided(params, api)]).toEqual(['db_host', 'db_pass']);
  });
});
