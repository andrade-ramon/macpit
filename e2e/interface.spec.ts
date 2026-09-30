import { expect, test } from '@playwright/test';
import { E2E_TOKEN } from './env';

test('interface: seleção, filtros, confirmação e terminal de celular a ultrawide', async ({ page }) => {
  const process = {
    pid: 91001,
    ppid: 1,
    uid: 501,
    user: 'exemplo',
    cpuPct: 2.3,
    memPct: 1,
    rssBytes: 148 * 1024 * 1024,
    vszBytes: 200 * 1024 * 1024,
    state: 'S',
    elapsedSec: 60,
    startedAt: Date.now() - 60000,
    name: 'Servidor de exemplo',
    path: '/exemplo/node',
    command: 'node servidor-exemplo.js',
  };
  await page.routeWebSocket('**/ws', (socket) => {
    socket.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === 'subscribe' && message.channel === 'processes') {
        socket.send(
          JSON.stringify({
            type: 'snapshot',
            channel: 'processes',
            data: {
              ts: Date.now(),
              selfPid: 91002,
              processes: [process],
            },
          }),
        );
      }
    });
  });
  await page.route('**/api/processes/91001', (route) => route.fulfill({ json: { process, children: [], files: [] } }));
  await page.route('**/api/processes', (route) =>
    route.fulfill({ json: { ts: Date.now(), selfPid: 91002, processes: [process] } }),
  );
  let kills = 0;
  await page.route('**/api/processes/*/kill', (route) => {
    kills++;
    return route.abort();
  });
  await page.goto(`/auth?token=${E2E_TOKEN}`);
  await page.goto('/processes');
  const nav = page.getByRole('navigation', { name: 'Principal', exact: true });
  const details = page.getByRole('complementary', { name: 'Processos · detalhes' });
  const filters = page.getByRole('complementary', { name: 'Processos · filtros' });
  await expect(details).toHaveCount(0);
  await expect(filters).toHaveCount(0);
  await page.getByRole('button', { name: 'Ver detalhes de Servidor de exemplo, PID 91001' }).click();
  await expect(details).toContainText('node servidor-exemplo.js');
  for (const width of [390, 1024, 1440, 1920, 3440, 5120]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(nav.getByRole('link', { name: 'Processos', exact: true })).toBeVisible();
    await expect(details).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Buscar processos' })).toBeVisible();
    const bounds = await page.locator('.workspace').boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(1680);
    const mainBounds = await page.getByRole('main', { name: 'Processos', exact: true }).boundingBox();
    const detailBounds = await details.boundingBox();
    if (width >= 1200) expect(detailBounds!.x).toBeGreaterThan(mainBounds!.x + mainBounds!.width - 2);
    else expect(detailBounds!.y).toBeGreaterThanOrEqual(mainBounds!.y + mainBounds!.height - 2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if ([1024, 3440].includes(width)) await page.screenshot({ path: `test-results/interface-${width}.png` });
  }
  await page.setViewportSize({ width: 1024, height: 1000 });
  await details.getByRole('button', { name: 'Encerrar TERM', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar' }).click();
  await details.getByText('Mais sinais', { exact: true }).click();
  await details.getByRole('button', { name: 'Forçar KILL', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('SIGKILL');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar' }).click();
  expect(kills).toBe(0);
  await page.getByRole('button', { name: '◧ Filtros', exact: true }).click();
  await expect(filters.getByLabel('Ordenar processos')).toBeVisible();
  await filters.getByLabel('Ordenar processos').selectOption('user');
  await page.getByRole('button', { name: 'Detalhes ◨', exact: true }).click();
  await expect(details).toBeVisible();
  await page.getByRole('button', { name: 'Expandir terminal' }).click();
  await expect(page.getByRole('region', { name: 'Terminal', exact: true })).toContainText('Nenhuma execução aberta');
  await page.getByRole('button', { name: 'Recolher terminal' }).click();
  await page.getByRole('searchbox', { name: 'Buscar processos' }).fill('inexistente');
  await expect(page.getByText('Nenhum processo encontrado para')).toBeVisible();
});
