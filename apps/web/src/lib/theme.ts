import { useSyncExternalStore } from 'react';

/** Paletas do design (todas escuras; o terminal fica sempre preto). */
export type Palette = 'carbono' | 'grafite' | 'meia-noite';
export type Density = 'comfortable' | 'compact';

export const PALETTES: Array<{ id: Palette; name: string; desc: string; swatch: [string, string, string] }> = [
  { id: 'carbono', name: 'Carbono', desc: 'neutro, verde-menta', swatch: ['#0b0c0f', '#191c24', '#5fe0a0'] },
  { id: 'grafite', name: 'Grafite quente', desc: 'quente, âmbar', swatch: ['#121110', '#23201c', '#f5b94d'] },
  { id: 'meia-noite', name: 'Meia-noite', desc: 'azulado, ciano', swatch: ['#090d1a', '#161e34', '#5ec2f5'] },
];

const PALETTE_KEY = 'macpit-palette';
const DENSITY_KEY = 'macpit-density';
const listeners = new Set<() => void>();

const read = (key: string): string | null => {
  try {
    // `bm-*`: chaves da época do bash-monitor
    return localStorage.getItem(key) ?? localStorage.getItem(key.replace(/^macpit-/, 'bm-'));
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* sem localStorage: vale só nesta sessão */
  }
};

export function parsePalette(v: string | null | undefined): Palette {
  return PALETTES.some((p) => p.id === v) ? (v as Palette) : 'carbono';
}
export const parseDensity = (v: string | null | undefined): Density => (v === 'compact' ? 'compact' : 'comfortable');

export const getPalette = () => parsePalette(read(PALETTE_KEY));
export const getDensity = () => parseDensity(read(DENSITY_KEY));

/** Próxima paleta no ciclo (tecla `t` e botão ◐). */
export function nextPalette(p: Palette): Palette {
  const i = PALETTES.findIndex((x) => x.id === p);
  return PALETTES[(i + 1) % PALETTES.length]!.id;
}

/** Aplica no <html>: `data-palette` (cores em styles/palettes.css) e `data-density` (altura das linhas). */
export function applyAppearance(palette = getPalette(), density = getDensity()): void {
  const root = document.documentElement;
  root.dataset.palette = palette;
  root.dataset.density = density;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', getComputedStyle(root).getPropertyValue('--panel').trim() || '#12141a');
}

export function setPalette(p: Palette): void {
  write(PALETTE_KEY, p);
  applyAppearance(p, getDensity());
  listeners.forEach((l) => l());
}

export function setDensity(d: Density): void {
  write(DENSITY_KEY, d);
  applyAppearance(getPalette(), d);
  listeners.forEach((l) => l());
}

export const cyclePalette = () => setPalette(nextPalette(getPalette()));

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function useAppearance(): { palette: Palette; density: Density } {
  const palette = useSyncExternalStore(subscribe, getPalette);
  const density = useSyncExternalStore(subscribe, getDensity);
  return { palette, density };
}
