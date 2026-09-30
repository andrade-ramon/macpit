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

test('painéis salvos: salvar, abrir pela aba, persistir, recuperar indisponível e remover', async ({
  page,
  request,
}) => {
  await request.put('/api/settings/repos', {
    headers: auth,
    data: { roots: [`${E2E_DATA_DIR}/projetos`], maxDepth: 2 },
  });
  const { repos } = await (await request.get('/api/repos', { headers: auth })).json();
  const loja = repos.find((r: { name: string }) => r.name === 'loja');
  await login(page);
  const nav = page.getByRole('navigation', { name: 'Principal', exact: true });
  await nav.getByRole('link', { name: 'Painéis', exact: true }).click();
  const main = page.getByRole('main', { name: 'Painéis', exact: true });
  await expect(main.getByRole('heading', { name: 'Nenhum painel salvo' })).toBeVisible();
  await page.goto(`/repos?project=${loja.id}`);
  await page.getByRole('button', { name: 'Salvar painel', exact: true }).click();
  await expect(page.getByRole('button', { name: '✓ Painel salvo', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('button', { name: '✓ Painel salvo', exact: true })).toBeDisabled();
  await nav.getByRole('link', { name: 'Painéis', exact: true }).click();
  const panel = main.getByRole('article', { name: 'Painel acme/loja' });
  await expect(panel).toBeVisible();
  await main.getByLabel('Buscar painéis').fill('inexistente');
  await expect(main.getByText('Nenhum painel com esse filtro.')).toBeVisible();
  await main.getByLabel('Buscar painéis').fill('loja');
  await panel.getByRole('button', { name: 'Abrir painel', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/panels\\?project=${loja.id}`));
  await expect(nav.getByRole('link', { name: 'Painéis', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(main.getByRole('region', { name: 'Execuções do projeto', exact: true })).toContainText(
    'Nenhuma execução registrada neste projeto.',
  );
  await page.reload();
  await expect(main.getByRole('heading', { name: 'acme/loja', exact: true })).toBeVisible();
  await main.getByRole('link', { name: '← Painéis salvos', exact: true }).click();
  await page.screenshot({ path: 'test-results/paineis-salvos.png', fullPage: true });
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(panel.getByRole('button', { name: 'Abrir painel' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await request.put('/api/settings/repos', { headers: auth, data: { roots: [], maxDepth: 2 } });
  await main.getByRole('button', { name: 'Atualizar lista' }).click();
  await expect(panel).toContainText('Repositório indisponível');
  await panel.getByRole('button', { name: 'Ver detalhes' }).click();
  await expect(main.getByRole('heading', { name: 'Repositório indisponível' })).toBeVisible();
  await request.put('/api/settings/repos', {
    headers: auth,
    data: { roots: [`${E2E_DATA_DIR}/projetos`], maxDepth: 2 },
  });
  await main.getByRole('button', { name: 'Procurar repositórios novamente' }).click();
  await expect(main.getByRole('heading', { name: 'acme/loja', exact: true })).toBeVisible();
  await main.getByRole('link', { name: '← Painéis salvos' }).click();
  await panel.getByRole('button', { name: 'Remover', exact: true }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Remover painel salvo?' });
  await confirm.getByRole('button', { name: 'Cancelar' }).click();
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Remover', exact: true }).click();
  await confirm.getByRole('button', { name: 'Remover painel', exact: true }).click();
  await expect(main.getByRole('heading', { name: 'Nenhum painel salvo' })).toBeVisible();
  expect((await (await request.get('/api/runs', { headers: auth })).json()).length).toBe(0);
  expect((await (await request.get('/api/repos', { headers: auth })).json()).repos.length).toBe(2);
  await page.goto(`/repos?project=${loja.id}`);
  await expect(page.getByRole('button', { name: 'Salvar painel', exact: true })).toBeEnabled();
  await request.put('/api/settings/repos', { headers: auth, data: { roots: [], maxDepth: 3 } });
});

test('painel de projeto: vínculo, serviços, portas, histórico e formulário no projeto escolhido', async ({
  page,
  request,
}) => {
  await request.put('/api/settings/repos', {
    headers: auth,
    data: { roots: [`${E2E_DATA_DIR}/projetos`], maxDepth: 2 },
  });
  const { repos } = await (await request.get('/api/repos', { headers: auth })).json();
  const loja = repos.find((r: { name: string }) => r.name === 'loja');
  const rascunho = repos.find((r: { name: string }) => r.name === 'rascunho');
  await request.put('/api/repos/selection', {
    headers: auth,
    data: { paths: repos.map((r: { path: string }) => r.path) },
  });
  const service = await createAction(request, {
    name: 'E2E serviço por projeto',
    persistent: true,
    command: `node -e 'const s=require("node:http").createServer((q,r)=>r.end("ok"));s.listen(0,"127.0.0.1",()=>console.log("projeto-pronto"))'`,
    params: [{ name: 'repo', type: 'repo', default: loja.id }],
  });
  await createAction(request, {
    name: 'E2E projeto com campo',
    command: 'echo "projeto=$MACPIT_REPO_NAME valor={{valor}}"',
    params: [
      { name: 'repo', type: 'repo' },
      { name: 'valor', label: 'Valor do projeto' },
    ],
  });
  await login(page);
  await page.goto('/repos');
  await page.getByRole('button', { name: '◧ Filtros', exact: true }).click();
  await page.getByRole('button', { name: 'Só GitHub', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir projeto rascunho', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`project=${rascunho.id}`));
  const main = page.getByRole('main');
  const svc = main.getByRole('article', { name: 'E2E serviço por projeto' });
  await svc.getByRole('button', { name: 'Iniciar aqui' }).click();
  await expect(terminal(page)).toContainText('projeto-pronto');
  const overviewUrl = `/api/repos/${rascunho.id}/project`;
  await expect
    .poll(async () => (await (await request.get(overviewUrl, { headers: auth })).json()).ports.length)
    .toBe(1);
  await expect(
    main.getByRole('region', { name: 'Portas do projeto', exact: true }).getByRole('link', { name: /^TCP/ }),
  ).toBeVisible();
  await page.reload();
  await expect(svc.getByRole('button', { name: 'Parar serviço' })).toBeVisible();
  await page.getByRole('button', { name: '◧ Filtros', exact: true }).click();
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(svc.getByRole('button', { name: 'Parar serviço' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.screenshot({ path: 'test-results/painel-projeto.png', fullPage: true });
  const overview = await (await request.get(overviewUrl, { headers: auth })).json();
  expect(overview.runs[0].repoPath).toBe(rascunho.path);
  await page
    .getByRole('navigation', { name: 'Projetos', exact: true })
    .getByRole('button', { name: /acme\/loja/ })
    .click();
  await expect(svc.getByText('Ativo em outro projeto')).toBeVisible();
  await expect(svc.getByRole('button', { name: 'Iniciar aqui' })).toBeDisabled();
  await expect(main.getByRole('region', { name: 'Execuções do projeto', exact: true })).not.toContainText(
    'E2E serviço por projeto',
  );
  await page
    .getByRole('navigation', { name: 'Projetos', exact: true })
    .getByRole('button', { name: /rascunho/ })
    .click();
  await svc.getByRole('button', { name: 'Parar serviço' }).click();
  await expect(svc.getByRole('button', { name: 'Iniciar aqui' })).toBeVisible();
  const history = main.getByRole('region', { name: 'Execuções do projeto', exact: true });
  await history.getByRole('button', { name: /E2E serviço por projeto/ }).click();
  await expect(terminal(page)).toContainText('projeto-pronto');
  await main
    .getByRole('article', { name: 'E2E projeto com campo' })
    .getByRole('button', { name: 'Executar aqui' })
    .click();
  await expect(page).toHaveURL(new RegExp(`repo=${rascunho.id}`));
  const actionDetails = details(page, 'Ações');
  await actionDetails.getByLabel('Valor do projeto').fill('teste');
  await actionDetails.getByRole('button', { name: /Executar/ }).click();
  await expect(terminal(page)).toContainText('projeto=rascunho valor=teste');
  await page.goto('/repos?project=inexistente');
  await expect(main.getByRole('alert')).toContainText('repositório não encontrado');
  await request.delete(`/api/actions/${service.id}`, { headers: auth });
  await request.put('/api/settings/repos', { headers: auth, data: { roots: [], maxDepth: 3 } });
});

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
    // Node (já aquecido) em vez de python3: no runner macOS do CI o 1º python3 levou > 15 s para abrir a porta
    command: `exec node -e "require('node:net').createServer().listen(${port}, '127.0.0.1')"`,
    persistent: true,
    expectedPort: port,
  });
  await login(page);
  await page.goto('/actions');
  const svc = card(page, 'E2E serviço');
  await svc.getByRole('button', { name: /Iniciar/ }).click();
  await expect(svc.getByText(`conectado :${port}`)).toBeVisible({ timeout: 30_000 });
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
  await page.getByRole('button', { name: '◧ Filtros', exact: true }).click();
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
  await page.getByRole('button', { name: '◧ Filtros', exact: true }).click();
  await expect(page.getByText('Repositórios novos entram desmarcados.')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByLabel('Buscar comandos').fill('loja');
  await expect(page.getByRole('option').filter({ hasText: 'abrir ↗' })).toHaveCount(0);
});

test('reiniciar macpit: confirmação, encerramento ordenado e reconexão com dados preservados', async ({
  page,
  request,
}) => {
  const before = await (await request.get('/api/server', { headers: auth })).json();
  expect(before.canRestart).toBe(true);
  const { repos } = await (await request.get('/api/repos', { headers: auth })).json();
  const repo = repos[0];
  const saved = await request.post('/api/panels', { headers: auth, data: { repoId: repo.id } });
  expect(saved.ok()).toBe(true);
  const action = await createAction(request, {
    name: 'E2E reinício seguro',
    command: 'echo reinicio-pronto; read -r valor',
    cwd: E2E_DATA_DIR,
  });
  const run = await (await request.post(`/api/actions/${action.id}/run`, { headers: auth, data: {} })).json();
  await login(page);
  await page.goto('/settings');
  const main = page.getByRole('main', { name: 'Configurações', exact: true });
  const restart = main.getByRole('button', { name: 'Reiniciar macpit', exact: true });
  await restart.click();
  const dialog = page.getByRole('alertdialog', { name: 'Reiniciar o macpit?' });
  await expect(dialog).toContainText('O macOS não será reiniciado');
  await expect(dialog).toContainText('Execuções ativas agora: 1');
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  expect((await (await request.get('/api/server', { headers: auth })).json()).instanceId).toBe(before.instanceId);
  await restart.click();
  await page.screenshot({ path: 'test-results/reiniciar-macpit.png', fullPage: true });
  const reload = page.waitForEvent('load');
  await dialog.getByRole('button', { name: 'Reiniciar macpit', exact: true }).click();
  await reload;
  await expect(restart).toBeEnabled();
  const after = await (await request.get('/api/server', { headers: auth })).json();
  expect(after.instanceId).not.toBe(before.instanceId);
  expect(after.pid).toBe(before.pid); // execve preserva o processo supervisionado pelo launchd
  expect(after.activeRuns).toBe(0);
  expect((await (await request.get(`/api/runs/${run.id}`, { headers: auth })).json()).status).toBe('killed');
  expect(
    (await (await request.get('/api/panels', { headers: auth })).json()).some((p: { id: string }) => p.id === repo.id),
  ).toBe(true);
  await request.delete(`/api/panels/${repo.id}`, { headers: auth });
  await request.delete(`/api/actions/${action.id}`, { headers: auth });
});
