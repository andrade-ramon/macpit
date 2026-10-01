import { expect, test } from '@playwright/test';
import { E2E_TOKEN } from './env';

const plan = () => ({
  id: '00000000-0000-4000-8000-000000000001',
  root: '/Users/exemplo/Downloads',
  expiresAt: Date.now() + 600_000,
  files: [
    {
      id: '00000000-0000-4000-8000-000000000002',
      path: '/Users/exemplo/Downloads/arquivo-antigo.zip',
      bytes: 1024,
      modifiedAt: Date.now() - 40 * 86400_000,
      category: 'manual',
      reason: 'Download antigo; revisão manual.',
      impact: 'Pode ser importante.',
    },
    {
      id: '00000000-0000-4000-8000-000000000003',
      path: '/Users/exemplo/Downloads/preservar.zip',
      bytes: 2048,
      modifiedAt: Date.now() - 40 * 86400_000,
      category: 'manual',
      reason: 'Download antigo; revisão manual.',
      impact: 'Pode ser importante.',
    },
  ],
  warnings: [],
  partial: false,
});

test('limpeza: tamanho mínimo em MB é enviado em bytes e valor negativo bloqueia análise', async ({ page }) => {
  await page.route('**/api/disk/cleanup/scan', (route) => {
    expect(route.request().postDataJSON()).toEqual({ path: '~/Downloads', maxFiles: 10000, minFileBytes: 100_000_000 });
    return route.fulfill({ json: { ...plan(), files: [] } });
  });
  await page.goto(`/auth?token=${E2E_TOKEN}`);
  await page.goto('/disk');
  const cleanup = page.getByRole('region', { name: 'Limpeza assistida' });
  await cleanup.getByLabel('Tamanho mínimo (MB)', { exact: true }).fill('-1');
  await expect(cleanup.getByRole('button', { name: 'Analisar para limpeza' })).toBeDisabled();
  await cleanup.getByLabel('Tamanho mínimo (MB)', { exact: true }).fill('100');
  await cleanup.getByRole('button', { name: 'Analisar para limpeza' }).click();
  await expect(cleanup).toContainText('Nenhum candidato encontrado');
});

test('limpeza: prévia sem seleção, cancelar não executa e confirmar envia somente os IDs selecionados', async ({
  page,
}) => {
  const preview = plan();
  let executions = 0;
  await page.route('**/api/disk/cleanup/scan', (route) => route.fulfill({ json: preview }));
  await page.route('**/api/disk/cleanup/execute', (route) => {
    executions++;
    expect(route.request().postDataJSON()).toEqual({
      planId: preview.id,
      fileIds: [preview.files[0]!.id],
      confirm: true,
    });
    return route.fulfill({
      json: {
        items: [
          { id: preview.files[0]!.id, path: preview.files[0]!.path, status: 'moved', message: 'Enviado à Lixeira.' },
        ],
        movedBytes: 1024,
      },
    });
  });
  await page.goto(`/auth?token=${E2E_TOKEN}`);
  await page.goto('/disk');
  const cleanup = page.getByRole('region', { name: 'Limpeza assistida' });
  await cleanup.getByLabel('Limite de arquivos').fill('20000');
  const scanRequest = page.waitForRequest('**/api/disk/cleanup/scan');
  await cleanup.getByRole('button', { name: 'Analisar para limpeza' }).click();
  expect((await scanRequest).postDataJSON()).toEqual({ path: '~/Downloads', maxFiles: 20000, minFileBytes: 0 });
  await expect(cleanup.getByRole('checkbox')).toHaveCount(2);
  await expect(cleanup.getByRole('checkbox').first()).not.toBeChecked();
  const rows = cleanup.locator('[aria-label="Arquivos da prévia"] > div');
  await rows.first().getByText('Motivo e impacto', { exact: true }).click();
  const first = await rows.first().boundingBox();
  const second = await rows.nth(1).boundingBox();
  const finder = await rows.first().getByRole('button', { name: 'Mostrar no Finder' }).boundingBox();
  expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
  expect(finder!.y + finder!.height).toBeLessThanOrEqual(first!.y + first!.height);
  await page.screenshot({ path: 'test-results/limpeza-previa.png', fullPage: true });
  await expect(cleanup.getByRole('button', { name: 'Revisar limpeza' })).toBeDisabled();
  for (const width of [390, 1024, 1600, 3440, 5120]) {
    await page.setViewportSize({ width, height: 1000 });
    await cleanup.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await cleanup.getByRole('checkbox').first().check();
  await cleanup.getByRole('button', { name: 'Revisar limpeza' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText(preview.files[0]!.path);
  await expect(confirm).not.toContainText(preview.files[1]!.path);
  await confirm.getByRole('button', { name: 'Cancelar' }).click();
  expect(executions).toBe(0);
  await cleanup.getByRole('button', { name: 'Revisar limpeza' }).click();
  await confirm.getByRole('button', { name: 'Confirmar e mover para a Lixeira' }).click();
  await expect(cleanup).toContainText('Resultado da limpeza');
  await expect(cleanup.getByRole('checkbox')).toHaveCount(0);
  expect(executions).toBe(1);
  await page.screenshot({ path: 'test-results/limpeza-resultado.png', fullPage: true });
});

test('limpeza: análise parcial, filtro e nova análise descartam a seleção antiga', async ({ page }) => {
  const preview = { ...plan(), partial: true, warnings: ['Pasta sem acesso.'] };
  await page.route('**/api/disk/cleanup/scan', (route) => route.fulfill({ json: preview }));
  await page.goto(`/auth?token=${E2E_TOKEN}`);
  await page.goto('/disk');
  const cleanup = page.getByRole('region', { name: 'Limpeza assistida' });
  await cleanup.getByRole('button', { name: 'Analisar para limpeza' }).click();
  await expect(cleanup).toContainText('Análise parcial');
  await cleanup.getByRole('checkbox').first().check();
  await cleanup.getByLabel('Filtrar prévia').fill('preservar');
  await expect(cleanup.getByRole('checkbox')).toHaveCount(1);
  await expect(cleanup).toContainText('1 arquivos selecionados');
  await cleanup.getByRole('button', { name: 'Analisar para limpeza' }).click();
  await expect(cleanup.getByRole('checkbox')).toHaveCount(2);
  await expect(cleanup.getByRole('button', { name: 'Revisar limpeza' })).toBeDisabled();
});

test('limpeza: erro da execução impede repetir um plano de resultado incerto', async ({ page }) => {
  await page.route('**/api/disk/cleanup/scan', (route) => route.fulfill({ json: plan() }));
  await page.route('**/api/disk/cleanup/execute', (route) =>
    route.fulfill({ status: 409, json: { error: 'Prévia expirada.' } }),
  );
  await page.goto(`/auth?token=${E2E_TOKEN}`);
  await page.goto('/disk');
  const cleanup = page.getByRole('region', { name: 'Limpeza assistida' });
  await cleanup.getByRole('button', { name: 'Analisar para limpeza' }).click();
  await cleanup.getByRole('checkbox').first().check();
  await cleanup.getByRole('button', { name: 'Revisar limpeza' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmar e mover para a Lixeira' }).click();
  await expect(cleanup.getByRole('alert')).toContainText('Confira a Lixeira');
  await expect(cleanup.getByRole('checkbox')).toHaveCount(0);
});

test('limpeza: paginação mantém seleção e limite inválido bloqueia análise', async ({ page }) => {
  const preview = plan();
  const files = Array.from({ length: 101 }, (_, index) => ({
    ...preview.files[0]!,
    id: `item-${index}`,
    path: `/Users/exemplo/Downloads/arquivo-${index}.zip`,
  }));
  await page.route('**/api/disk/cleanup/scan', (route) => route.fulfill({ json: { ...preview, files } }));
  await page.goto(`/auth?token=${E2E_TOKEN}`);
  await page.goto('/disk');
  const cleanup = page.getByRole('region', { name: 'Limpeza assistida' });
  await cleanup.getByLabel('Limite de arquivos').fill('20001');
  await expect(cleanup.getByRole('button', { name: 'Analisar para limpeza' })).toBeDisabled();
  await cleanup.getByLabel('Limite de arquivos').fill('10000');
  await cleanup.getByRole('button', { name: 'Analisar para limpeza' }).click();
  await expect(cleanup.getByRole('checkbox')).toHaveCount(100);
  await cleanup.getByRole('checkbox').first().check();
  await cleanup.getByRole('button', { name: 'Próxima página' }).click();
  await expect(cleanup.getByRole('checkbox')).toHaveCount(1);
  await expect(cleanup).toContainText('1 arquivos selecionados');
  await cleanup.getByRole('button', { name: 'Página anterior' }).click();
  await expect(cleanup.getByRole('checkbox').first()).toBeChecked();
});
