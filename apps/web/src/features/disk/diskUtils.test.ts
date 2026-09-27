import { describe, expect, it } from 'vitest';
import { breadcrumbs, parentPath, usageLevel } from './diskUtils';

describe('usageLevel', () => {
  it('faixas relativas ao limite', () => {
    expect(usageLevel(70, 90)).toBe('ok');
    expect(usageLevel(80, 90)).toBe('warn');
    expect(usageLevel(90, 90)).toBe('alert');
  });
});

describe('breadcrumbs / parentPath', () => {
  it('monta trilha', () => {
    expect(breadcrumbs('/Users/alice/my dir')).toEqual([
      { label: '/', path: '/' },
      { label: 'Users', path: '/Users' },
      { label: 'alice', path: '/Users/alice' },
      { label: 'my dir', path: '/Users/alice/my dir' },
    ]);
    expect(breadcrumbs('/')).toEqual([{ label: '/', path: '/' }]);
  });

  it('pasta pai', () => {
    expect(parentPath('/Users/alice')).toBe('/Users');
    expect(parentPath('/Users')).toBe('/');
    expect(parentPath('/')).toBeUndefined();
  });
});

describe('tendência', () => {
  it('bytes por dia entre a 1ª e a última amostra', async () => {
    const { growthPerDay } = await import('./DiskHistoryChart');
    const GB = 1024 ** 3;
    const h = (pts: Array<[number, number]>) => ({
      mount: '/',
      range: '24h' as const,
      sampleIntervalMs: 300_000,
      points: pts.map(([ts, used]) => ({ ts, usedBytes: used, totalBytes: 100 * GB })),
    });
    expect(
      growthPerDay(
        h([
          [0, 10 * GB],
          [43_200_000, 11 * GB],
        ]),
      ),
    ).toBe(2 * GB);
    expect(growthPerDay(h([[0, 10 * GB]]))).toBeUndefined();
    expect(growthPerDay(undefined)).toBeUndefined();
  });
});
