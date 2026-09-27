// Gera os ícones do PWA (apps/web/public/icons) a partir do desenho do favicon, renderizando com o
// Google Chrome instalado (Playwright). Uso: node scripts/gen-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const OUT = path.resolve('apps/web/public/icons');
// marca do design: quadrado verde-menta com ">_" escuro
const BG = '#5fe0a0';
const FG = '#06140c';
// o ">_" do favicon (coordenadas num quadro 32×32)
const GLYPH = `<path d="M8.5 11.5l5 4.5-5 4.5M16 21.5h7.5" stroke="${FG}" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;

/** `scale` < 1 encolhe o glifo para dentro da "zona segura" (ícones maskable são recortados pelo SO). */
const svg = ({ rounded, scale }) => {
  const t = 16 - 16 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="100%" height="100%">
    <rect width="32" height="32" ${rounded ? 'rx="9"' : ''} fill="${BG}"/>
    <g transform="translate(${t} ${t}) scale(${scale})">${GLYPH}</g></svg>`;
};

const ICONS = [
  { file: 'icon-192.png', size: 192, rounded: true, scale: 1 },
  { file: 'icon-512.png', size: 512, rounded: true, scale: 1 },
  // maskable: fundo sangrando até a borda; conteúdo nos 80% centrais (o SO aplica a máscara)
  { file: 'icon-maskable-512.png', size: 512, rounded: false, scale: 0.72 },
  // iOS/macOS arredondam sozinhos e não aceitam transparência
  { file: 'apple-touch-icon.png', size: 180, rounded: false, scale: 0.8 },
];

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const icon of ICONS) {
    const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size }, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg(icon)}</body></html>`);
    await page.screenshot({ path: path.join(OUT, icon.file), omitBackground: !icon.file.startsWith('apple') });
    await page.close();
    console.log(`✔ ${icon.file} (${icon.size}px)`);
  }
} finally {
  await browser.close();
}
