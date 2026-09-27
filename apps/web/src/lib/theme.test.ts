import { describe, expect, it } from 'vitest';
import { nextPalette, parseDensity, parsePalette, PALETTES } from './theme';

describe('aparência', () => {
  it('valores desconhecidos caem no padrão', () => {
    expect(parsePalette(null)).toBe('carbono');
    expect(parsePalette('light')).toBe('carbono'); // tema claro antigo
    expect(parsePalette('meia-noite')).toBe('meia-noite');
    expect(parseDensity('x')).toBe('comfortable');
    expect(parseDensity('compact')).toBe('compact');
  });

  it('`t` percorre as três paletas em ciclo', () => {
    let p = PALETTES[0]!.id;
    const seen = [p];
    for (let i = 0; i < 3; i++) seen.push((p = nextPalette(p)));
    expect(seen).toEqual(['carbono', 'grafite', 'meia-noite', 'carbono']);
  });
});
