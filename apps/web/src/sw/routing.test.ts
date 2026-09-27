import { describe, expect, it } from 'vitest';
import { assetsInHtml, strategyFor } from './routing';

const O = 'http://127.0.0.1:7777';
const req = (path: string, extra: Partial<{ method: string; mode: string }> = {}) => ({
  url: O + path,
  method: 'GET',
  mode: 'cors',
  ...extra,
});

describe('strategyFor', () => {
  it('nunca cacheia API, WebSocket nem login com token', () => {
    expect(strategyFor(req('/api/processes'), O)).toBe('bypass');
    expect(strategyFor(req('/api'), O)).toBe('bypass');
    expect(strategyFor(req('/ws'), O)).toBe('bypass');
    expect(strategyFor(req('/auth?token=abc', { mode: 'navigate' }), O)).toBe('bypass');
    expect(strategyFor(req('/api/runs/x/log', { mode: 'navigate' }), O)).toBe('bypass');
  });

  it('navegações usam a casca; assets com hash, cache primeiro', () => {
    expect(strategyFor(req('/actions?run=1', { mode: 'navigate' }), O)).toBe('shell');
    expect(strategyFor(req('/', { mode: 'navigate' }), O)).toBe('shell');
    expect(strategyFor(req('/assets/index-abc123.js'), O)).toBe('cache-first');
    expect(strategyFor(req('/icons/icon-192.png'), O)).toBe('stale-while-revalidate');
    expect(strategyFor(req('/manifest.webmanifest'), O)).toBe('stale-while-revalidate');
  });

  it('ignora outros métodos, outras origens e o resto', () => {
    expect(strategyFor(req('/assets/x.js', { method: 'POST' }), O)).toBe('bypass');
    expect(strategyFor({ url: 'https://fonts.example/x.css', method: 'GET', mode: 'cors' }, O)).toBe('bypass');
    expect(strategyFor(req('/sw.js'), O)).toBe('bypass');
    expect(strategyFor({ url: 'não é url', method: 'GET', mode: 'cors' }, O)).toBe('bypass');
  });
});

describe('assetsInHtml', () => {
  it('extrai chunks sem repetir', () => {
    const html =
      '<script src="/assets/index-a1.js"></script><link href="/assets/index-b2.css"><link rel="modulepreload" href="/assets/index-a1.js">';
    expect(assetsInHtml(html)).toEqual(['/assets/index-a1.js', '/assets/index-b2.css']);
  });
});
