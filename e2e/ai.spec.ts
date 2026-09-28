import { expect, test, type Page } from '@playwright/test';
import type { AiResult } from '@macpit/shared';
import { E2E_TOKEN } from './env';

const auth = { Authorization: `Bearer ${E2E_TOKEN}` };
const key = 'chave-sintetica-apenas-e2e';
const draft: AiResult = {
  status: 'draft',
  explanation: 'Mostra o texto recebido. Nenhum processo foi iniciado.',
  questions: [],
  requirements: ['printf do shell'],
  warnings: ['Confira o conteúdo antes de executar.'],
  action: {
    name: 'IA E2E texto',
    command: 'printf "%s\\n" {{texto}}',
    group: 'IA E2E',
    icon: null,
    persistent: false,
    expectedPort: null,
    params: [{ name: 'texto', label: 'Texto', type: 'text', secret: false, default: null }],
  },
};

async function login(page: Page) {
  await page.goto(`/auth?token=${E2E_TOKEN}`);
}

test.beforeEach(async ({ request }) => {
  await request.put('/api/ai/settings', { headers: auth, data: { provider: 'gemini', model: 'gemini-3.5-flash' } });
  await request.delete('/api/ai/credential', { headers: auth });
});
test.afterEach(async ({ request }) => {
  await request.delete('/api/ai/credential', { headers: auth });
  const actions = await (await request.get('/api/actions', { headers: auth })).json();
  for (const action of actions)
    if (action.group === 'IA E2E') await request.delete(`/api/actions/${action.id}`, { headers: auth });
});

test('IA: sem configuração, salva chave, testa, substitui e remove sem expor no navegador', async ({ page }) => {
  await page.route('**/api/ai/test', (route) => route.fulfill({ json: { ok: true } }));
  await login(page);
  await page.goto('/actions');
  await page.getByRole('button', { name: 'Criar com IA', exact: true }).click();
  await page.getByRole('link', { name: 'Configurar IA', exact: true }).click();
  const settings = page.locator('#settings-ai');
  await settings.getByLabel('API key', { exact: true }).fill(key);
  await settings.getByRole('button', { name: 'Salvar configuração de IA' }).click();
  await expect(settings.getByLabel('API key', { exact: true })).toHaveValue('');
  await expect(settings).toContainText('Chave configurada · sessão do servidor');
  await settings.getByRole('button', { name: 'Testar conexão' }).click();
  await expect(settings.getByRole('status')).toContainText('Conexão verificada');
  await settings.getByLabel('API key', { exact: true }).fill(`${key}-nova`);
  await settings.getByLabel('Armazenamento da nova chave').selectOption('disk');
  await settings.getByRole('button', { name: 'Salvar configuração de IA' }).click();
  await expect(settings).toContainText('Chave configurada · lembrada neste computador');
  await page.reload();
  await expect(settings.getByLabel('API key', { exact: true })).toHaveValue('');
  expect(
    await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } })),
  ).not.toContain(key);
  await settings.getByRole('button', { name: 'Remover chave' }).click();
  await expect(settings).toContainText('Nenhuma chave configurada');
});

test('IA: falha, esclarece, gera, refina e cria somente após revisão', async ({ page, request }) => {
  await request.put('/api/ai/credential', {
    headers: auth,
    data: { provider: 'gemini', apiKey: key, storage: 'session' },
  });
  const runsBefore = await (await request.get('/api/runs', { headers: auth })).json();
  const calls: Array<{ prompt: string; history: unknown[] }> = [];
  await page.route('**/api/ai/drafts', async (route) => {
    calls.push(route.request().postDataJSON());
    if (calls.length === 1)
      return route.fulfill({ status: 502, json: { error: 'Provedor temporariamente indisponível' } });
    if (calls.length === 2)
      return route.fulfill({
        json: {
          result: {
            ...draft,
            status: 'needs_input',
            action: null,
            questions: ['Deseja informar o texto ao executar?'],
          },
        },
      });
    return route.fulfill({
      json: {
        result: calls.length === 3 ? draft : { ...draft, action: { ...draft.action, name: 'IA E2E texto revisado' } },
      },
    });
  });
  await login(page);
  await page.goto('/actions');
  await page.getByRole('button', { name: 'Criar com IA', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Criar ação com IA' });
  await dialog.getByLabel('O que você quer fazer?').fill('Quero mostrar um texto');
  await dialog.getByRole('button', { name: 'Gerar rascunho' }).click();
  await expect(dialog.getByRole('alert')).toContainText('indisponível');
  await expect(dialog.getByLabel('O que você quer fazer?')).toHaveValue('Quero mostrar um texto');
  await dialog.getByRole('button', { name: 'Gerar rascunho' }).click();
  await expect(dialog).toContainText('Deseja informar o texto ao executar?');
  await dialog.getByLabel('Deseja informar o texto ao executar?').fill('Sim, como parâmetro');
  await dialog.getByRole('button', { name: 'Revisar respostas', exact: true }).click();
  await dialog.getByRole('button', { name: 'Enviar respostas à IA' }).click();
  await expect(dialog.getByRole('heading', { name: draft.action!.name, exact: true })).toBeVisible();
  await dialog.getByLabel('Responda ou peça um ajuste').fill('Renomeie para texto revisado');
  await dialog.getByRole('button', { name: 'Enviar ajuste' }).click();
  await expect(dialog.getByRole('heading', { name: 'IA E2E texto revisado', exact: true })).toBeVisible();
  expect(calls[3]!.history).toHaveLength(2);
  expect(
    (await (await request.get('/api/actions', { headers: auth })).json()).some(
      (a: { group: string }) => a.group === 'IA E2E',
    ),
  ).toBe(false);
  await dialog.getByRole('button', { name: 'Revisar e criar ação' }).click();
  const editor = page.getByRole('dialog');
  await expect(editor.getByRole('heading', { name: 'Revisar ação da IA' })).toBeVisible();
  await expect(editor.getByLabel('Nome', { exact: true })).toHaveValue('IA E2E texto revisado');
  await editor.getByLabel('Nome', { exact: true }).fill('IA E2E editado localmente');
  await editor.getByRole('button', { name: 'Criar ação', exact: true }).click({ clickCount: 2 });
  await expect(editor).not.toBeVisible();
  const actions = await (await request.get('/api/actions', { headers: auth })).json();
  const created = actions.filter((a: { group: string }) => a.group === 'IA E2E');
  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({ name: 'IA E2E editado localmente', autoStart: false, autoRestart: false });
  expect(await (await request.get('/api/runs', { headers: auth })).json()).toEqual(runsBefore);
});

test('IA: perguntas em etapas preservam respostas, revisão e repetição após falha', async ({ page, request }) => {
  await request.put('/api/ai/credential', {
    headers: auth,
    data: { provider: 'gemini', apiKey: key, storage: 'session' },
  });
  const questions = [
    'O script requer argumentos?',
    'É uma tarefa pontual ou um serviço?',
    'Qual diretório deve ser usado?',
  ];
  const calls: Array<{ prompt: string }> = [];
  await page.route('**/api/ai/drafts', async (route) => {
    calls.push(route.request().postDataJSON());
    if (calls.length === 2) return route.fulfill({ status: 502, json: { error: 'Falha temporária, tente novamente' } });
    return route.fulfill({
      json: {
        result: {
          ...draft,
          status: 'needs_input',
          action: null,
          questions: calls.length === 1 ? questions : [questions[0]],
        },
      },
    });
  });
  await login(page);
  await page.goto('/actions');
  await page.getByRole('button', { name: 'Criar com IA', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Criar ação com IA' });
  await dialog.getByLabel('O que você quer fazer?').fill('Quero executar meu script');
  await dialog.getByRole('button', { name: 'Gerar rascunho' }).click();
  await expect(dialog).toContainText('Pergunta 1 de 3');
  await expect(dialog.getByLabel(questions[0]!)).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Próxima', exact: true })).toBeDisabled();
  await dialog.getByLabel(questions[0]!).fill('   ');
  await expect(dialog.getByRole('button', { name: 'Próxima', exact: true })).toBeDisabled();
  await dialog.getByLabel(questions[0]!).fill('Não');
  await dialog.getByRole('button', { name: 'Próxima', exact: true }).click();
  await dialog.getByLabel(questions[1]!).fill('Um serviço\nDeve continuar rodando');
  await dialog.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(dialog.getByLabel(questions[0]!)).toHaveValue('Não');
  await dialog.getByRole('button', { name: 'Próxima', exact: true }).click();
  await expect(dialog.getByLabel(questions[1]!)).toHaveValue('Um serviço\nDeve continuar rodando');
  await dialog.getByRole('button', { name: 'Próxima', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.getByLabel(questions[2]!).fill('Vou escolher o repositório no editor');
  expect(await dialog.evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/ia-perguntas-mobile.png' });
  await dialog.getByRole('button', { name: 'Revisar respostas', exact: true }).click();
  expect(calls).toHaveLength(1);
  await expect(dialog.getByRole('heading', { name: 'Tudo certo para enviar?' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Editar resposta 1' }).click();
  await dialog.getByLabel(questions[0]!).fill('Sim, --verbose');
  await dialog.getByRole('button', { name: 'Ir para pergunta 3' }).click();
  await dialog.getByRole('button', { name: 'Revisar respostas', exact: true }).click();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.screenshot({ path: 'test-results/ia-perguntas-revisao.png' });
  await dialog.getByRole('button', { name: 'Enviar respostas à IA' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Falha temporária');
  await expect(dialog).toContainText('Sim, --verbose');
  await expect(dialog).toContainText('Vou escolher o repositório no editor');
  await dialog.getByRole('button', { name: 'Enviar respostas à IA' }).click();
  await expect(dialog).toContainText('Pergunta 1 de 1');
  await expect(dialog.getByLabel(questions[0]!)).toHaveValue('');
  expect(calls[1]!.prompt).toBe(calls[2]!.prompt);
  for (const question of questions) expect(calls[1]!.prompt).toContain(question);
  expect(calls[1]!.prompt).toContain('Sim, --verbose');
  expect(calls[1]!.prompt).toContain('Um serviço\nDeve continuar rodando');
  await dialog.getByRole('button', { name: 'Novo pedido', exact: true }).click();
  await expect(dialog.getByLabel('O que você quer fazer?')).toHaveValue('');
});

test('IA: cancelamento ignora resposta antiga e mantém a sugestão nova', async ({ page, request }) => {
  await request.put('/api/ai/credential', {
    headers: auth,
    data: { provider: 'gemini', apiKey: key, storage: 'session' },
  });
  let release: () => void = () => {};
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  await page.route('**/api/ai/drafts', async (route) => {
    const first = ++calls === 1;
    if (first) await delayed;
    await route
      .fulfill({
        json: { result: { ...draft, action: { ...draft.action, name: first ? 'Resposta antiga' : 'Resposta atual' } } },
      })
      .catch(() => {});
  });
  await login(page);
  await page.goto('/actions');
  await page.getByRole('button', { name: 'Criar com IA', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Criar ação com IA' });
  await dialog.getByLabel('O que você quer fazer?').fill('Primeiro pedido');
  await dialog.getByRole('button', { name: 'Gerar rascunho' }).click();
  await expect.poll(() => calls).toBe(1);
  await dialog.getByRole('button', { name: 'Cancelar geração' }).click();
  await expect(dialog.getByRole('alert')).toContainText('cancelada');
  await dialog.getByLabel('O que você quer fazer?').fill('Segundo pedido');
  await dialog.getByRole('button', { name: 'Gerar rascunho' }).click();
  await expect(dialog.getByRole('heading', { name: 'Resposta atual' })).toBeVisible();
  release();
  await expect(dialog.getByRole('heading', { name: 'Resposta antiga' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Fechar criação com IA' }).click();
});

test('IA: rascunho e editor responsivos nas três paletas', async ({ page, request }) => {
  await request.put('/api/ai/credential', {
    headers: auth,
    data: { provider: 'gemini', apiKey: key, storage: 'session' },
  });
  await page.route('**/api/ai/drafts', (route) =>
    route.fulfill({
      json: { result: { ...draft, action: { ...draft.action, persistent: true, expectedPort: 5433 } } },
    }),
  );
  await login(page);
  await page.goto('/actions');
  await page.getByRole('button', { name: 'Criar com IA', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Criar ação com IA' });
  await dialog.getByLabel('O que você quer fazer?').fill('Mostre o exemplo');
  await dialog.getByRole('button', { name: 'Gerar rascunho' }).click();
  await expect(dialog.getByRole('heading', { name: draft.action!.name, exact: true })).toBeVisible();
  for (const palette of ['carbono', 'grafite', 'meia-noite']) {
    await page.evaluate((p) => (document.documentElement.dataset.palette = p), palette);
    await page.screenshot({ path: `test-results/ia-${palette}.png` });
    await expect(dialog.getByRole('button', { name: 'Revisar e criar ação' })).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/ia-mobile.png' });
  await dialog.getByRole('button', { name: 'Revisar e criar ação' }).click();
  const editor = page.getByRole('dialog');
  await expect(editor.getByRole('checkbox', { name: /Reiniciar automaticamente/ })).toBeDisabled();
  await expect(editor.getByRole('checkbox', { name: /Iniciar junto/ })).toBeDisabled();
  expect(await editor.evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(true);
  await editor.getByRole('button', { name: 'Voltar à IA' }).click();
  await expect(dialog.getByRole('heading', { name: draft.action!.name, exact: true })).toBeVisible();
});
