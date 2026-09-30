import { defineConfig } from '@playwright/test';
import { E2E_DATA_DIR, E2E_PORT } from './e2e/env';

/**
 * E2E: sobe o servidor de produção (build) com dados temporários e um token conhecido (e2e/prepare-data.mjs).
 * NODE_ENV=test desliga amostragem de disco, início automático de serviços e notificações do macOS.
 * Usa o Google Chrome instalado (channel: 'chrome') — sem baixar navegador.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${E2E_PORT}`,
    channel: 'chrome',
    // conteúdo e detalhes lado a lado; testes de interface também cobrem normal e ultrawide
    viewport: { width: 1600, height: 1000 },
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node e2e/prepare-data.mjs && node apps/server/dist/index.js',
    url: `http://127.0.0.1:${E2E_PORT}/favicon.svg`,
    reuseExistingServer: false,
    timeout: 20_000,
    env: {
      NODE_ENV: 'test',
      MACPIT_PORT: String(E2E_PORT),
      MACPIT_DATA_DIR: E2E_DATA_DIR,
      MACPIT_SHELL: '/bin/bash',
    },
  },
});
