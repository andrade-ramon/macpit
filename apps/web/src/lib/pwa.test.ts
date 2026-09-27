import { describe, expect, it } from 'vitest';
import { manualInstallHint } from './pwa';

describe('manualInstallHint', () => {
  it('instruções por navegador', () => {
    const safari =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
    const chrome =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
    const edge = chrome + ' Edg/140.0';
    expect(manualInstallHint(safari)).toMatch(/Adicionar ao Dock/);
    expect(manualInstallHint(chrome)).toMatch(/Chrome/);
    expect(manualInstallHint(edge)).toMatch(/Edge/);
    expect(manualInstallHint('Firefox/130')).toMatch(/Chrome, Edge ou Safari/);
  });
});
