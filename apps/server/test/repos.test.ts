import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { openDb } from '../src/db/index.js';
import { SettingsStore } from '../src/db/settings.js';
import {
  parseGitFile,
  parseGitRemotes,
  parseGithubRemote,
  parseHead,
  primaryRemote,
} from '../src/modules/repos/git.js';
import { scanRepos } from '../src/modules/repos/scanner.js';
import { RepoService } from '../src/modules/repos/service.js';
import { fakeRunDeps } from './fake-pty.js';
import { AUTH, TOKEN, testConfig } from './helpers.js';

const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bm-repos-')));

/** Cria um repositório git sintético (só os arquivos que lemos). */
function fakeRepo(dir: string, opts: { remote?: string; branch?: string } = {}) {
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.git', 'HEAD'), `ref: refs/heads/${opts.branch ?? 'main'}\n`);
  fs.writeFileSync(
    path.join(dir, '.git', 'config'),
    `[core]\n\tbare = false\n${opts.remote ? `[remote "origin"]\n\turl = ${opts.remote}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n` : ''}`,
  );
}

describe('parsers de git', () => {
  it('remotes do config (origin primeiro; aspas; comentários)', () => {
    const cfg = `# comentário\n[core]\n\turl = nao-e-remote\n[remote "upstream"]\n\turl = git@github.com:up/x.git\n[remote "origin"]\n  url = "https://github.com/eu/x.git"\n  url = ignorada\n`;
    const r = parseGitRemotes(cfg);
    expect([...r]).toEqual([
      ['upstream', 'git@github.com:up/x.git'],
      ['origin', 'https://github.com/eu/x.git'],
    ]);
    expect(primaryRemote(r)).toBe('https://github.com/eu/x.git');
    expect(primaryRemote(parseGitRemotes('[remote "a"]\nurl = u1'))).toBe('u1');
    expect(primaryRemote(new Map())).toBeNull();
  });

  it.each([
    ['git@github.com:org/api.git', 'org/api'],
    ['https://github.com/org/api', 'org/api'],
    ['https://user@github.com/org/api.git/', 'org/api'],
    ['ssh://git@github.com:22/org/api.git', 'org/api'],
    ['git@github.com-trabalho:org/api.git', 'org/api'],
    ['git@gitlab.com:org/api.git', null],
    ['https://bitbucket.org/org/api', null],
    ['/caminho/local', null],
  ])('github remote %s → %s', (url, expected) => {
    expect(parseGithubRemote(url)).toBe(expected);
  });

  it('HEAD e arquivo .git', () => {
    expect(parseHead('ref: refs/heads/feat/x\n')).toBe('feat/x');
    expect(parseHead('a'.repeat(40))).toBe('aaaaaaa');
    expect(parseHead('lixo')).toBeNull();
    expect(parseGitFile('gitdir: ../.git/worktrees/w\n')).toBe('../.git/worktrees/w');
  });
});

describe('scanRepos', () => {
  it('acha repos até a profundidade, sem descer em repos, pastas ocultas ou node_modules', async () => {
    const root = tmp();
    fakeRepo(path.join(root, 'api'), { remote: 'git@github.com:org/api.git', branch: 'develop' });
    fakeRepo(path.join(root, 'org', 'web'), { remote: 'https://github.com/org/web' });
    fakeRepo(path.join(root, 'local-only'));
    fakeRepo(path.join(root, 'api', 'sub')); // dentro de outro repo: ignorado
    fakeRepo(path.join(root, 'node_modules', 'pkg'));
    fakeRepo(path.join(root, '.cache', 'x'));
    fakeRepo(path.join(root, 'a', 'b', 'c', 'fundo'));
    // worktree: .git é arquivo e o config fica no commondir
    const wt = path.join(root, 'api-wt');
    fs.mkdirSync(path.join(root, 'api', '.git', 'worktrees', 'wt'), { recursive: true });
    fs.writeFileSync(path.join(root, 'api', '.git', 'worktrees', 'wt', 'HEAD'), 'ref: refs/heads/hotfix\n');
    fs.writeFileSync(path.join(root, 'api', '.git', 'worktrees', 'wt', 'commondir'), '../..\n');
    fs.mkdirSync(wt);
    fs.writeFileSync(path.join(wt, '.git'), `gitdir: ${path.join(root, 'api', '.git', 'worktrees', 'wt')}\n`);

    const { repos, errors } = await scanRepos([root, path.join(root, 'nao-existe')], 2);
    expect(errors).toEqual([`pasta não encontrada: ${path.join(root, 'nao-existe')}`]);
    expect(repos.map((r) => [r.name, r.github, r.branch])).toEqual([
      ['api', 'org/api', 'develop'],
      ['api-wt', 'org/api', 'hotfix'],
      ['local-only', null, 'main'],
      ['web', 'org/web', 'main'],
    ]);
    const deep = await scanRepos([root], 4);
    expect(deep.repos.map((r) => r.name)).toContain('fundo');
  });
});

describe('RepoService', () => {
  function setup() {
    const db = openDb(':memory:');
    const home = tmp();
    const audit = vi.fn();
    const svc = new RepoService(db, new SettingsStore(db), () => home, audit);
    return { db, home, svc, audit };
  }

  it('configuração com ~, variáveis por repo e segredos que não voltam', async () => {
    const { svc, home, audit } = setup();
    fakeRepo(path.join(home, 'github', 'api'), { remote: 'git@github.com:org/api.git' });
    await expect(svc.updateSettings({ roots: ['relativo'], maxDepth: 2 })).rejects.toMatchObject({ statusCode: 400 });
    expect(await svc.updateSettings({ roots: ['~/github/', '~/github'], maxDepth: 2 })).toEqual({
      roots: ['~/github'],
      maxDepth: 2,
    });
    const [repo] = (await svc.listFresh()).repos;
    expect(repo).toMatchObject({ name: 'api', path: path.join(home, 'github', 'api'), github: 'org/api', vars: [] });

    const saved = await svc.setVars(repo!.id, {
      vars: [
        { name: 'DB_HOST', value: 'prod.db.interno' },
        { name: 'DB_PASS', value: 's3gredo', secret: true },
      ],
    });
    expect(saved.vars).toEqual([
      { name: 'DB_HOST', value: 'prod.db.interno', secret: false, hasValue: true },
      { name: 'DB_PASS', value: '', secret: true, hasValue: true },
    ]);
    expect(JSON.stringify(audit.mock.calls)).not.toContain('s3gredo');
    // segredo sem valor mantém o salvo; variável nova sem valor → 400
    await svc.setVars(repo!.id, {
      vars: [
        { name: 'DB_HOST', value: 'x' },
        { name: 'DB_PASS', secret: true },
      ],
    });
    await expect(svc.setVars(repo!.id, { vars: [{ name: 'NOVA', secret: true }] })).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      svc.setVars(repo!.id, {
        vars: [
          { name: 'a', value: '1' },
          { name: 'A', value: '2' },
        ],
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(svc.setVars('nao-existe', { vars: [] })).rejects.toMatchObject({ statusCode: 404 });

    const action = {
      id: 'a1',
      cwd: undefined,
      params: [
        { name: 'repo', type: 'repo', secret: false },
        { name: 'DB_HOST', type: 'text', secret: false, default: 'localhost' },
        { name: 'db_pass', type: 'text', secret: true },
        { name: 'porta', type: 'text', secret: false, default: '5432' },
      ],
    } as never;
    // por nome da pasta, owner/nome ou id; valor digitado vence a variável do repo
    for (const ref of ['api', 'org/api', repo!.id]) {
      expect(svc.resolve(action, { repo: ref, DB_HOST: '' })).toEqual({
        values: { repo: repo!.path, DB_HOST: 'x', db_pass: 's3gredo', porta: undefined },
        cwd: repo!.path,
        env: {
          MACPIT_REPO_PATH: repo!.path,
          MACPIT_REPO_NAME: 'api',
          MACPIT_REPO_BRANCH: 'main',
          MACPIT_REPO_GITHUB: 'org/api',
          // nomes antigos (bash-monitor) continuam para ações já salvas
          BM_REPO_PATH: repo!.path,
          BM_REPO_NAME: 'api',
          BM_REPO_BRANCH: 'main',
          BM_REPO_GITHUB: 'org/api',
        },
        repo: repo!.path,
      });
    }
    expect(svc.resolve(action, { repo: 'api', DB_HOST: 'outro' }).values.DB_HOST).toBe('outro');
    expect(() => svc.resolve(action, {})).toThrow(/escolha um repositório/);
    expect(() => svc.resolve(action, { repo: 'nenhum' })).toThrow(/não encontrado/);
    // diretório próprio da ação é mantido
    expect(svc.resolve({ ...(action as object), cwd: '/tmp' } as never, { repo: 'api' }).cwd).toBeUndefined();
    // ação sem parâmetro repo passa intacta
    expect(svc.resolve({ params: [] } as never, { x: '1' })).toEqual({ values: { x: '1' }, env: {} });
  });

  it('seleção: sem escolha todos importados; depois só os marcados (e novos entram desmarcados)', async () => {
    const { svc, home } = setup();
    fakeRepo(path.join(home, 'api'), { remote: 'git@github.com:org/api.git' });
    fakeRepo(path.join(home, 'web'), { remote: 'git@github.com:org/web.git' });
    await svc.updateSettings({ roots: ['~'], maxDepth: 1 });
    let list = await svc.listFresh();
    expect(list.hasSelection).toBe(false);
    expect(list.repos.every((r) => r.imported)).toBe(true);

    const api = list.repos.find((r) => r.name === 'api')!;
    list = await svc.setSelection({ paths: [api.path, '/nao/existe'] });
    expect(list.hasSelection).toBe(true);
    expect(list.repos.map((r) => [r.name, r.imported])).toEqual([
      ['api', true],
      ['web', false],
    ]);
    expect(svc.find('org/api').name).toBe('api');
    expect(() => svc.find('org/web')).toThrow(/não importado/);

    fakeRepo(path.join(home, 'novo'));
    list = await svc.scan();
    expect(list.repos.find((r) => r.name === 'novo')?.imported).toBe(false);
    await expect(svc.setSelection({ paths: 'x' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('abrir pasta: só repositórios da varredura', async () => {
    const db = openDb(':memory:');
    const home = tmp();
    const opened: string[] = [];
    const svc = new RepoService(
      db,
      new SettingsStore(db),
      () => home,
      vi.fn(),
      Date.now,
      async (d) => {
        opened.push(d);
      },
    );
    fakeRepo(path.join(home, 'api'));
    await svc.updateSettings({ roots: ['~'], maxDepth: 1 });
    const [repo] = (await svc.listFresh()).repos;
    await svc.open(repo!.id);
    expect(opened).toEqual([repo!.path]);
    await expect(svc.open('../../etc')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('nome ambíguo exige escolher', async () => {
    const { svc, home } = setup();
    fakeRepo(path.join(home, 'a', 'api'));
    fakeRepo(path.join(home, 'b', 'api'));
    await svc.updateSettings({ roots: ['~'], maxDepth: 2 });
    expect(() => svc.find('api')).toThrow(/há 2 repositórios/);
  });
});

describe('rotas e execução', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => close?.());

  it('ação com parâmetro repo roda na pasta do repo com as variáveis dele', async () => {
    const home = tmp();
    const repoDir = path.join(home, 'code', 'api');
    fakeRepo(repoDir, { remote: 'git@github.com:org/api.git' });
    const fake = fakeRunDeps(home);
    const { app } = await buildApp(testConfig(), TOKEN, { runDeps: fake.deps });
    close = () => app.close();
    const req = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) =>
      app.inject({ method, url, headers: AUTH, ...(payload ? { payload: payload as object } : {}) });

    expect((await req('GET', '/api/settings/repos')).json()).toEqual({ roots: [], maxDepth: 3 });
    expect((await req('GET', '/api/repos')).json()).toMatchObject({ repos: [] });
    expect((await req('PUT', '/api/settings/repos', { roots: ['~/code'], maxDepth: 3 })).statusCode).toBe(200);
    const [repo] = (await req('GET', '/api/repos')).json().repos;
    expect(repo).toMatchObject({ name: 'api', github: 'org/api' });
    await req('PUT', `/api/repos/${repo.id}/vars`, { vars: [{ name: 'DB_HOST', value: 'prod.db' }] });

    const bad = await req('POST', '/api/actions', {
      name: 'x',
      command: 'echo',
      params: [
        { name: 'a', type: 'repo' },
        { name: 'b', type: 'repo' },
      ],
    });
    expect(bad.statusCode).toBe(400);
    const action = (
      await req('POST', '/api/actions', {
        name: 'Túnel prod',
        command: 'ssh -N -L 5432:{{DB_HOST}}:5432 bastion # {{repo}}',
        params: [
          { name: 'repo', type: 'repo', default: 'org/api' },
          { name: 'DB_HOST', default: 'localhost' },
        ],
      })
    ).json();
    expect(action.params[0]).toMatchObject({ type: 'repo' });

    const run = await req('POST', `/api/actions/${action.id}/run`, {});
    expect(run.statusCode).toBe(201);
    expect(run.json().cwd).toBe(repoDir);
    const pty = fake.ptys.at(-1)!;
    expect(pty.opts.cwd).toBe(repoDir);
    expect(pty.opts.env).toMatchObject({
      MACPIT_PARAM_DB_HOST: 'prod.db',
      MACPIT_REPO_NAME: 'api',
      MACPIT_REPO_GITHUB: 'org/api',
      BM_REPO_NAME: 'api',
      BM_RUN_ID: run.json().id,
    });
    expect(pty.args[1]).not.toContain('prod.db'); // valor vai por env, nunca no texto

    const missing = await req('POST', `/api/actions/${action.id}/run`, { params: { repo: 'nao-existe' } });
    expect(missing.statusCode).toBe(400);
  });
});
