import { describe, expect, it } from 'vitest';
import { resolveShortcut } from './shortcuts';

describe('resolveShortcut', () => {
  it('sequência g + tecla navega', () => {
    const first = resolveShortcut(null, 'g');
    expect(first).toEqual({ pending: 'g' });
    expect(resolveShortcut(first.pending, 'p')).toEqual({
      action: { kind: 'navigate', to: '/processes' },
      pending: null,
    });
    expect(resolveShortcut('g', 'o').action).toEqual({ kind: 'navigate', to: '/ports' });
  });

  it('g + tecla desconhecida cancela sem ação', () => {
    expect(resolveShortcut('g', 'z')).toEqual({ pending: null });
  });

  it('teclas simples', () => {
    expect(resolveShortcut(null, '/').action).toEqual({ kind: 'focusSearch' });
    expect(resolveShortcut(null, '?').action).toEqual({ kind: 'help' });
    expect(resolveShortcut(null, 't').action).toEqual({ kind: 'theme' });
    expect(resolveShortcut(null, 'x')).toEqual({ pending: null });
  });
});
