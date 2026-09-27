import net from 'node:net';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { E2E_DATA_DIR, E2E_TOKEN } from './env';

const auth = { Authorization: `Bearer ${E2E_TOKEN}` };

async function login(page: Page) {
  await page.goto(`/auth?token=${E2E_TOKEN}`);
  await expect(page).toHaveURL(/\/$/);
}

async function createAction(request: APIRequestContext, body: object): Promise<{ id: string }> {
  const res = await request.post('/api/actions', { headers: auth, data: body });
  expect(res.status()).toBe(201);
  return res.json();
}

/** Texto visível do terminal xterm (as linhas ficam em .xterm-rows). */
const terminal = (page: Page) => page.locator('.xterm-rows');
/** Terminal fixo no rodapé (abas das execuções). */
const dock = (page: Page) => page.getByRole('region', { name: 'Terminal' });
/** Card de uma ação na grade. */
const card = (page: Page, name: string) => page.locator(`[aria-label="${name}"]`).first();
/** Coluna de detalhes da página. */
const details = (page: Page, label: string) => page.getByRole('complementary', { name: `${label} · detalhes` });

test.describe.configure({ mode: 'serial' });

test('sem token mostra a tela de acesso; com token entra na Visão geral com métricas ao vivo', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Entrar no macpit' })).toBeVisible();
  await login(page);
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
  await expect(page.getByText('CPU', { exact: true })).toBeVisible();
  await expect(page.getByText(/^conectado/)).toBeVisible();
});

test('ações: criar pelo editor, executar, interagir pelo terminal e ver o resultado', async ({ page }) => {
  await login(page);
  await page.goto('/actions');
  await page.getByRole('button', { name: '+ Nova ação' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('Túnel banco produção').fill('E2E interativa');
  await dialog.locator('textarea').fill('echo "pronto-e2e"; read -r x; echo "recebi:$x"');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toBeHidden();

  await card(page, 'E2E interativa')
    .getByRole('button', { name: /Executar/ })
    .click();
  await expect(dock(page).getByRole('tab', { name: /E2E interativa/ })).toBeVisible();
  await expect(terminal(page)).toContainText('pronto-e2e');

  await page.locator('.xterm').click();
  await page.keyboard.type('ola-do-e2e');
  await page.keyboard.press('Enter');
  await expect(terminal(page)).toContainText('recebi:ola-do-e2e');
  await expect(dock(page).getByText('concluída', { exact: true })).toBeVisible();
});

test('parâmetros: formulário antes de executar; valor malicioso chega como texto', async ({ page, request }) => {
  await createAction(request, {
    name: 'E2E parâmetro',
    command: 'echo "valor=[{{nome}}]"',
    params: [{ name: 'nome', label: 'Nome' }],
  });
  await login(page);
  await page.goto('/actions');
  // com parâmetros, "Executar" abre o formulário nos detalhes
  await card(page, 'E2E parâmetro')
    .getByRole('button', { name: /Executar/ })
    .click();
  const form = details(page, 'Ações');
  await form.getByRole('textbox').fill('$(echo INJETADO); `id`');
  await form.getByRole('textbox').press('Enter');
  await expect(terminal(page)).toContainText('valor=[$(echo INJETADO); `id`]');
  await expect(terminal(page)).not.toContainText('valor=[INJETADO');
});

test('serviço: porta esperada → "conectado"; parar libera', async ({ page, request }) => {
  const port = 7811;
  await createAction(request, {
    name: 'E2E serviço',
    command: `exec python3 -m http.server ${port} --bind 127.0.0.1`,
    persistent: true,
    expectedPort: port,
  });
  await login(page);
  await page.goto('/actions');
  const svc = card(page, 'E2E serviço');
  await svc.getByRole('button', { name: /Iniciar/ }).click();
  await expect(svc.getByText(`conectado :${port}`)).toBeVisible({ timeout: 15_000 });
  await svc.getByRole('button', { name: /Parar/ }).click();
  await expect(svc.getByText(/^parado/)).toBeVisible({ timeout: 10_000 });
});

test('portas: um servidor aberto pelo teste aparece e a busca filtra', async ({ page }) => {
  const srv = net.createServer().listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  const port = (srv.address() as net.AddressInfo).port;
  try {
    await login(page);
    await page.goto(`/ports?q=${port}`);
    await expect(page.getByRole('main').getByText(String(port), { exact: true })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Buscar portas' })).toHaveValue(String(port));
  } finally {
    srv.close();
  }
});

test('paleta ⌘K navega e atalhos de teclado funcionam', async ({ page }) => {
  await login(page);
  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog', { name: 'Paleta de comandos' });
  await palette.getByRole('textbox', { name: 'Buscar comandos' }).fill('processos');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/processes$/);
  await expect(page.getByRole('heading', { name: 'Processos' })).toBeVisible();

  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('g');
  await page.keyboard.press('d');
  await expect(page).toHaveURL(/\/disk$/);

  const palette0 = await page.evaluate(() => document.documentElement.dataset.palette);
  await page.keyboard.press('t');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.palette)).not.toBe(palette0);
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Atalhos de teclado' })).toBeVisible();
});

test('processos: busca pela URL e estado vazio', async ({ page }) => {
  await login(page);
  await page.goto('/processes?q=nenhum-processo-com-esse-nome-xyz');
  await expect(page.getByText(/Nenhum processo encontrado para/)).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(page.getByRole('grid')).toBeVisible();
});

test('repositórios: pasta de projetos, variáveis do repo e ação que escolhe o repo', async ({ page, request }) => {
  await login(page);
  await page.goto('/repos');
  await page.getByLabel('Nova pasta de projetos').fill(`${E2E_DATA_DIR}/projetos`);
  await page.getByRole('button', { name: '+ Pasta' }).click();
  await page.getByRole('button', { name: 'Salvar e procurar' }).click();
  // só GitHub por padrão: "rascunho" (sem remote) fica escondido
  const main = page.getByRole('main');
  await expect(main.getByText('acme/loja')).toBeVisible();
  await expect(main.getByText('rascunho')).toHaveCount(0);

  await main.getByRole('button', { name: '+ Variáveis' }).first().click();
  const repo = details(page, 'Repositórios');
  await repo.getByRole('button', { name: '+ Variável' }).click();
  await repo.getByLabel('Nome da variável do repositório').fill('DB_HOST');
  await repo.getByLabel('Valor da variável do repositório').fill('prod-db.acme');
  await repo.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(repo.getByText('salvo', { exact: true })).toBeVisible();
  await expect(main.getByRole('button', { name: '1 variável' })).toBeVisible();

  await createAction(request, {
    name: 'E2E túnel do repo',
    command: 'echo "host=[{{DB_HOST}}] repo=[$MACPIT_REPO_GITHUB] em=[$(basename "$PWD")]"',
    params: [
      { name: 'repo', label: 'Repositório', type: 'repo' },
      { name: 'DB_HOST', default: 'localhost' },
    ],
  });
  await page.goto('/actions');
  // repositório sem padrão: "Executar" abre o popup com a lista; escolher executa
  await card(page, 'E2E túnel do repo')
    .getByRole('button', { name: /Executar/ })
    .click();
  const picker = page.getByRole('dialog', { name: 'Escolher repositório' });
  await picker.getByLabel('Buscar repositório').fill('loja');
  await picker.getByRole('option', { name: /acme\/loja/ }).click();
  await expect(picker).toBeHidden();
  await expect(terminal(page)).toContainText('host=[prod-db.acme] repo=[acme/loja] em=[loja]');

  // paleta ⌘K: o repositório aparece com link para o GitHub
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByLabel('Buscar comandos').fill('loja');
  const gh = page.getByRole('option').filter({ hasText: 'abrir ↗' });
  await expect(gh).toHaveText(/acme\/loja/);
  const [popup] = await Promise.all([page.waitForEvent('popup'), gh.click()]);
  expect(popup.url()).toBe('https://github.com/acme/loja');
  await popup.close();

  // desmarcar "importar": some da paleta e do formulário
  await page.keyboard.press('Escape');
  await page.goto('/repos');
  await page.getByLabel('Importar acme/loja').click();
  await expect(page.getByLabel('Importar acme/loja')).not.toBeChecked();
  await expect(page.getByText('Repositórios novos entram desmarcados.')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByLabel('Buscar comandos').fill('loja');
  await expect(page.getByRole('option').filter({ hasText: 'abrir ↗' })).toHaveCount(0);
});
