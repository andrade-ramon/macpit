import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseEtime, parseLsofFields, parsePs, processName } from '../src/modules/processes/parser.js';

const fx = (f: string) => fs.readFileSync(path.join(import.meta.dirname, 'fixtures', f), 'utf8');
const NOW = 1_800_000_000_000;

describe('parseEtime', () => {
  it.each([
    ['00:41', 41],
    ['04:55:00', 4 * 3600 + 55 * 60],
    ['01-12:56:36', 86400 + 12 * 3600 + 56 * 60 + 36],
    ['3-01:00:00', 3 * 86400 + 3600],
    ['lixo', 0],
  ])('%s → %d', (input, expected) => expect(parseEtime(input)).toBe(expected));
});

describe('processName', () => {
  it.each([
    ['/sbin/launchd', 'launchd'],
    ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'Google Chrome'],
    ['-zsh', 'zsh'],
    ['(git)', 'git'],
    ['node', 'node'],
  ])('%s → %s', (input, expected) => expect(processName(input)).toBe(expected));
});

describe('parsePs', () => {
  const list = parsePs(fx('ps-stats.txt'), fx('ps-args.txt'), NOW);
  const byPid = (pid: number) => list.find((p) => p.pid === pid)!;

  it('lê todas as linhas', () => {
    expect(list).toHaveLength(9);
  });

  it('interpreta campos e vírgula decimal', () => {
    expect(byPid(1200)).toMatchObject({
      ppid: 1,
      uid: 501,
      user: 'alice',
      cpuPct: 12.3,
      memPct: 2.5,
      rssBytes: 420000 * 1024,
      state: 'S',
      elapsedSec: 4 * 3600 + 55 * 60,
      startedAt: NOW - (4 * 3600 + 55 * 60) * 1000,
      name: 'Google Chrome',
      path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      command: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --flag=a b',
    });
    expect(byPid(339).cpuPct).toBe(0);
  });

  it('comm com espaços e parênteses', () => {
    expect(byPid(1201).name).toBe('Google Chrome Helper (Renderer)');
    expect(byPid(1201).command).toMatch(/--type=renderer$/);
  });

  it('uid negativo, zumbi e shell de login', () => {
    expect(byPid(3000)).toMatchObject({ uid: -2, user: 'nobody', elapsedSec: 3 * 86400 + 3600 });
    expect(byPid(2002)).toMatchObject({ state: 'Z', name: 'git', rssBytes: 0 });
    expect(byPid(2000).name).toBe('zsh');
    expect(byPid(2001)).toMatchObject({ state: 'R+', cpuPct: 99.9, command: 'node server.js --port 3000' });
  });

  it('usa comm quando args não existe', () => {
    const [p] = parsePs('  7  1  0 root 0.0 0.0 1 1 S 00:01 /bin/x', '', NOW);
    expect(p!.command).toBe('/bin/x');
  });
});

describe('parseLsofFields', () => {
  const files = parseLsofFields(fx('lsof-p.txt'));
  const byFd = (fd: string) => files.find((f) => f.fd === fd)!;

  it('lê todos os descritores', () => {
    expect(files.map((f) => f.fd)).toEqual(['cwd', 'txt', '0', '1', '2', '5', '22', '23', '24', '30']);
  });

  it('classifica stdout/stderr redirecionados como log', () => {
    expect(byFd('1')).toMatchObject({ kind: 'stdout', access: 'w', tailable: true, looksLikeLog: true });
    expect(byFd('2')).toMatchObject({ kind: 'stderr', looksLikeLog: true });
  });

  it('heurística de log em arquivos comuns', () => {
    expect(byFd('5')).toMatchObject({ kind: 'file', name: '/Users/alice/Library/data file.db', looksLikeLog: false });
    expect(byFd('30')).toMatchObject({ kind: 'file', looksLikeLog: true });
    expect(byFd('txt')).toMatchObject({ kind: 'file', tailable: true, looksLikeLog: false });
  });

  it('rede, cwd e outros', () => {
    expect(byFd('22')).toMatchObject({ kind: 'network', type: 'IPv4', name: '127.0.0.1:3000' });
    expect(byFd('23').name).toBe('[::1]:52100->[::1]:5432');
    expect(byFd('cwd')).toMatchObject({ kind: 'cwd', tailable: false });
    expect(byFd('0')).toMatchObject({ kind: 'other', type: 'CHR', access: 'r' });
    expect(byFd('24')).toMatchObject({ kind: 'other', type: 'unix' });
    expect(byFd('cwd').access).toBeUndefined();
  });

  it('saída vazia', () => {
    expect(parseLsofFields('')).toEqual([]);
  });
});
