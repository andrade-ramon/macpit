import { expect, test, type Page } from '@playwright/test';
import { E2E_TOKEN } from './env';

async function login(page: Page) {
  await page.goto(`/auth?token=${E2E_TOKEN}`);
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
}

/** Largura/altura lidas do cabeçalho IHDR do PNG. */
function pngSize(buf: Buffer): [number, number] {
  expect(buf.subarray(1, 4).toString()).toBe('PNG');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

test.describe.configure({ mode: 'serial' });

test('manifest completo e ícones nos tamanhos declarados', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.headers()['content-type']).toMatch(/application\/manifest\+json/);
  const m = await res.json();
  expect(m).toMatchObject({ name: 'macpit', start_url: '/', scope: '/', display: 'standalone' });
  const purposes = new Set<string>();
  for (const icon of m.icons as Array<{ src: string; sizes: string; type: string; purpose: string }>) {
    const r = await request.get(icon.src);
    expect(r.status(), icon.src).toBe(200);
    purposes.add(icon.purpose);
    if (icon.type === 'image/png') {
      const [w, h] = pngSize(await r.body());
      expect(`${w}x${h}`, icon.src).toBe(icon.sizes);
    }
  }
  expect(purposes).toEqual(new Set(['any', 'maskable']));
  expect((await request.get('/icons/apple-touch-icon.png')).status()).toBe(200);
});

test('o Chrome considera o app instalável (sem erros de instalabilidade)', async ({ page, context }) => {
  await login(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as {
    installabilityErrors: Array<{ errorId: string }>;
  };
  // Contextos do Playwright são anônimos, e o Chrome nunca instala apps em janela anônima ("in-incognito").
  // Qualquer OUTRO erro (manifest, ícones, service worker, origem insegura…) é problema real do app.
  expect(installabilityErrors.map((e) => e.errorId).filter((id) => id !== 'in-incognito')).toEqual([]);
  const manifest = (await cdp.send('Page.getAppManifest')) as { errors: unknown[]; url: string };
  expect(manifest.errors).toEqual([]);
});

test('service worker controla a página; offline abre a casca e volta sozinho; API nunca vem do cache', async ({
  page,
  context,
}) => {
  await login(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  // visita uma página com chunk sob demanda para ele entrar no cache
  await page.goto('/actions');
  await expect(page.getByRole('heading', { name: 'Ações' })).toBeVisible();

  await context.setOffline(true);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'O servidor do macpit não está rodando' })).toBeVisible();
  const apiOffline = await page.evaluate(() =>
    fetch('/api/health').then(
      () => 'respondeu',
      () => 'falhou',
    ),
  );
  expect(apiOffline).toBe('falhou'); // dados nunca saem do cache

  await context.setOffline(false);
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible({ timeout: 12_000 });
});

test('sem sessão: entra colando o token (sem ele ir para a URL)', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Entrar no macpit' })).toBeVisible();
  await page.getByLabel('Ou cole o token aqui').fill('token-errado');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('token inválido')).toBeVisible();
  await page.getByLabel('Ou cole o token aqui').fill(E2E_TOKEN);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
  expect(page.url()).not.toContain(E2E_TOKEN);
  await ctx.close();
});

test('Configurações mostra a seção de instalação', async ({ page }) => {
  await login(page);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Instalar como app' })).toBeVisible();
});
