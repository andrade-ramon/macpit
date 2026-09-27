import type { ProcessInfo } from '@macpit/shared';
import { describe, expect, it } from 'vitest';
import { flatRows, matchesQuery, stateLabel, treeRows, type RowOptions } from './processRows';

const p = (pid: number, ppid: number, name: string, extra: Partial<ProcessInfo> = {}): ProcessInfo => ({
  pid,
  ppid,
  uid: 501,
  user: 'alice',
  cpuPct: 0,
  memPct: 0,
  rssBytes: 0,
  vszBytes: 0,
  state: 'S',
  elapsedSec: 0,
  startedAt: 0,
  name,
  path: name,
  command: name,
  ...extra,
});

const LIST = [
  p(1, 0, 'launchd', { user: 'root', cpuPct: 1 }),
  p(10, 1, 'zsh', { cpuPct: 5 }),
  p(11, 10, 'node', { cpuPct: 50, command: 'node server.js' }),
  p(12, 10, 'vim', { cpuPct: 2 }),
  p(20, 1, 'Chrome', { cpuPct: 30 }),
  p(99, 98, 'orfão'),
];

const opts = (o: Partial<RowOptions> = {}): RowOptions => ({
  query: '',
  user: '',
  sortKey: 'cpuPct',
  sortDir: 'desc',
  ...o,
});

describe('matchesQuery', () => {
  it('por pid exato, nome, comando e usuário', () => {
    expect(matchesQuery(LIST[2]!, '11')).toBe(true);
    expect(matchesQuery(LIST[2]!, '1')).toBe(false);
    expect(matchesQuery(LIST[2]!, 'SERVER')).toBe(true);
    expect(matchesQuery(LIST[0]!, 'root')).toBe(true);
  });
});

describe('flatRows', () => {
  it('ordena e filtra', () => {
    expect(flatRows(LIST, opts()).map((r) => r.p.pid)).toEqual([11, 20, 10, 12, 1, 99]);
    expect(flatRows(LIST, opts({ sortKey: 'name', sortDir: 'asc' })).map((r) => r.p.name)).toEqual([
      'Chrome',
      'launchd',
      'node',
      'orfão',
      'vim',
      'zsh',
    ]);
    expect(flatRows(LIST, opts({ user: 'root' })).map((r) => r.p.pid)).toEqual([1]);
  });
});

describe('treeRows', () => {
  it('monta hierarquia ordenando irmãos; órfão vira raiz', () => {
    expect(treeRows(LIST, opts()).map((r) => `${r.depth}:${r.p.pid}`)).toEqual([
      '0:1',
      '1:20',
      '1:10',
      '2:11',
      '2:12',
      '0:99',
    ]);
  });

  it('com busca mostra ancestrais esmaecidos', () => {
    const rows = treeRows(LIST, opts({ query: 'node' }));
    expect(rows.map((r) => [r.p.pid, r.depth, Boolean(r.dimmed)])).toEqual([
      [1, 0, true],
      [10, 1, true],
      [11, 2, false],
    ]);
  });

  it('não entra em loop com ciclos', () => {
    const cyc = [p(5, 6, 'a'), p(6, 5, 'b')];
    expect(treeRows(cyc, opts({ query: 'a' })).length).toBeLessThanOrEqual(2);
  });
});

describe('stateLabel', () => {
  it('traduz a 1ª letra', () => {
    expect(stateLabel('Ss+')).toBe('dormindo');
    expect(stateLabel('Z')).toBe('zumbi');
    expect(stateLabel('?')).toBe('?');
  });
});
