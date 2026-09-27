import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, formatPct } from './format';
import { mergeHistory } from './history';

describe('format', () => {
  it('formatBytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(16 * 1024 ** 3)).toBe('16.0 GB');
  });

  it('formatPct', () => {
    expect(formatPct(5.25)).toBe('5.3%');
    expect(formatPct(42.6)).toBe('43%');
  });

  it('formatDuration', () => {
    expect(formatDuration(70)).toBe('1m 10s');
    expect(formatDuration(3 * 3600 + 120)).toBe('3h 2m');
    expect(formatDuration(2 * 86400 + 5 * 3600)).toBe('2d 5h');
  });
});

describe('mergeHistory', () => {
  it('deduplica, ordena e recorta a janela', () => {
    const r = mergeHistory([{ ts: 1 }, { ts: 5 }, { ts: 3 }], [{ ts: 5 }, { ts: 12 }], 8);
    expect(r.map((s) => s.ts)).toEqual([5, 12]);
  });

  it('lida com listas vazias', () => {
    expect(mergeHistory([], [], 10)).toEqual([]);
  });
});

describe('formatos do design (pt-BR)', () => {
  it('números, bytes e durações', async () => {
    const { fmtNum, fmtBytes, fmtDur, fmtUptime } = await import('./format');
    expect(fmtNum(23.44)).toBe('23,4');
    expect(fmtNum(4.123, 2)).toBe('4,12');
    expect(fmtBytes(21.4 * 1024 ** 3)).toBe('21,4 GB');
    expect(fmtBytes(32 * 1024 ** 3, 0)).toBe('32 GB');
    expect(fmtBytes(412 * 1024 ** 2)).toBe('412 MB');
    expect(fmtBytes(96 * 1024)).toBe('96 KB');
    expect(fmtDur(5400)).toBe('1h 30min');
    expect(fmtDur(864000 + 4 * 3600)).toBe('10d 4h');
    expect(fmtDur(300)).toBe('5min');
    expect(fmtDur(12)).toBe('12s');
    expect(fmtUptime(864000)).toBe('10 dias');
  });
});
