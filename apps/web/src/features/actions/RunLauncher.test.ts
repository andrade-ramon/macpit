import type { Action, Repo } from '@macpit/shared';
import { describe, expect, it } from 'vitest';
import { missingAfterRepo, repoToPick } from './RunLauncher';

const action = (params: Action['params']) => ({ id: 'a', name: 'x', params }) as Action;
const repo = (vars: Repo['vars'] = []) =>
  ({ id: 'r', name: 'api', path: '/c/api', github: null, remote: null, branch: 'main', vars, imported: true }) as Repo;

describe('escolher repositório ao executar', () => {
  it('só abre o popup para parâmetro repositório sem padrão', () => {
    expect(repoToPick(action([{ name: 'repo', type: 'repo', secret: false }]))).toBeTruthy();
    expect(repoToPick(action([{ name: 'repo', type: 'repo', secret: false, default: 'org/api' }]))).toBeUndefined();
    expect(repoToPick(action([{ name: 'x', type: 'text', secret: false }]))).toBeUndefined();
  });

  it('parâmetro sem padrão e sem variável no repo manda para o formulário', () => {
    const a = action([
      { name: 'repo', type: 'repo', secret: false },
      { name: 'DB_HOST', type: 'text', secret: false },
      { name: 'porta', type: 'text', secret: false, default: '5432' },
    ]);
    expect(missingAfterRepo(a, repo())).toBe(true);
    expect(missingAfterRepo(a, repo([{ name: 'db_host', value: 'x', secret: false, hasValue: true }]))).toBe(false);
    const secret = action([
      { name: 'repo', type: 'repo', secret: false },
      { name: 'senha', type: 'text', secret: true },
    ]);
    expect(missingAfterRepo(secret, repo())).toBe(true);
    expect(missingAfterRepo(secret, repo([{ name: 'senha', value: '', secret: true, hasValue: true }]))).toBe(false);
  });
});
