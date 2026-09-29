import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiActionInput, DEFAULT_AI_SETTINGS } from '@macpit/shared';
import { buildApp } from '../src/app.js';
import { AiService } from '../src/modules/ai/service.js';
import { SettingsStore } from '../src/db/settings.js';
import type { AiGenerate } from '../src/modules/ai/providers/types.js';
import { fakeRunDeps } from './fake-pty.js';
import { AI_DRAFT, AI_KEY } from './fixtures/ai.js';
import { AUTH, HOST, TOKEN, testConfig } from './helpers.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
async function setup(generate: AiGenerate = async () => ({ text: JSON.stringify(AI_DRAFT) }), timeoutMs = 1000) {
  const config = testConfig();
  const fake = fakeRunDeps(config.dataDir);
  const audit = vi.fn();
  const provider = vi.fn(generate);
  const app = await buildApp(config, TOKEN, { runDeps: fake.deps, aiDeps: { generate: provider, timeoutMs }, audit });
  cleanup.push(async () => {
    await app.app.close();
    fs.rmSync(config.dataDir, { recursive: true, force: true });
  });
  const request = (method: 'GET' | 'PUT' | 'POST' | 'DELETE', url: string, payload?: object) =>
    app.app.inject({
      method,
      url,
      headers: AUTH,
      ...(payload
        ? { payload: url === '/api/ai/drafts' ? { configuration: DEFAULT_AI_SETTINGS, ...payload } : payload }
        : {}),
    });
  const configure = () =>
    request('PUT', '/api/ai/credential', { provider: 'gemini', apiKey: AI_KEY, storage: 'session' });
  return { ...app, ...fake, config, audit, provider, request, configure };
}

describe('IA HTTP e isolamento', () => {
  it('configura, gera, refina e salva sem executar; chave não chega ao pty', async () => {
    const s = await setup();
    expect((await s.request('POST', '/api/ai/drafts', { prompt: 'texto' })).json().code).toBe('ai_not_configured');
    const key = await s.configure();
    expect(key.statusCode).toBe(200);
    expect(key.body).not.toContain(AI_KEY);
    expect(key.headers['cache-control']).toBe('no-store');
    const generated = await s.request('POST', '/api/ai/drafts', { prompt: 'mostre um texto' });
    expect(generated.statusCode).toBe(200);
    expect(generated.json().result).toEqual(AI_DRAFT);
    expect(s.actions.list()).toEqual([]);
    expect(s.ptys).toEqual([]);
    expect(s.provider.mock.calls[0]?.[0].input).not.toContain(AI_KEY);
    expect(s.provider.mock.calls[0]?.[0].system).not.toContain(s.config.dataDir);
    await s.request('POST', '/api/ai/drafts', {
      prompt: 'mantenha assim',
      history: [{ prompt: 'mostre um texto', result: AI_DRAFT }],
    });
    expect(s.provider.mock.calls[1]?.[0].input).toContain('mantenha assim');
    const saved = await s.request('POST', '/api/actions', aiActionInput(AI_DRAFT.action!));
    expect(saved.statusCode).toBe(201);
    expect(s.ptys).toEqual([]);
    expect(s.runs.list({ limit: 50 })).toEqual([]);
    const exportActions = await s.request('GET', '/api/actions/export');
    expect(exportActions.body).not.toContain(AI_KEY);
    expect(JSON.stringify(s.audit.mock.calls)).not.toContain(AI_KEY);
    expect(JSON.stringify(s.audit.mock.calls)).not.toContain('mostre um texto');
    expect(JSON.stringify(s.audit.mock.calls)).not.toContain(AI_DRAFT.action!.command);
    await s.request('POST', `/api/actions/${saved.json().id}/run`, { params: { texto: 'teste sintético' } });
    expect(s.ptys).toHaveLength(1);
    expect(JSON.stringify(s.ptys[0]!.opts.env)).not.toContain(AI_KEY);
    s.ptys[0]!.exit(0);
  });

  it('chave vinculada ao provedor, trocar modelo preserva, trocar provedor remove', async () => {
    const s = await setup();
    await s.configure();
    const changedModel = await s.request('PUT', '/api/ai/settings', { provider: 'gemini', model: 'gemini-2.5-flash' });
    expect(changedModel.json().hasApiKey).toBe(true);
    const changedProvider = await s.request('PUT', '/api/ai/settings', {
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    });
    expect(changedProvider.json().hasApiKey).toBe(false);
    expect((await s.configure()).statusCode).toBe(409);
    expect(
      (await s.request('PUT', '/api/ai/settings', { provider: 'anthropic', model: 'gemini-2.5-flash' })).statusCode,
    ).toBe(400);
  });

  it('rejeita resposta inválida e erros externos sem vazar detalhes; permite repetir', async () => {
    const s = await setup();
    await s.configure();
    s.provider.mockRejectedValueOnce(new Error(`falha contendo ${AI_KEY}`));
    const failure = await s.request('POST', '/api/ai/drafts', { prompt: 'teste' });
    expect(failure.statusCode).toBe(502);
    expect(failure.body).not.toContain(AI_KEY);
    s.provider.mockResolvedValueOnce({
      text: JSON.stringify({ ...AI_DRAFT, action: { ...AI_DRAFT.action, autoStart: true } }),
    });
    expect((await s.request('POST', '/api/ai/drafts', { prompt: 'teste' })).json().code).toBe('ai_invalid_response');
    expect((await s.request('POST', '/api/ai/drafts', { prompt: 'teste' })).statusCode).toBe(200);
    expect(s.actions.list()).toEqual([]);
    expect(s.ptys).toEqual([]);
  });

  it('não envia a própria chave digitada no pedido', async () => {
    const s = await setup();
    await s.configure();
    expect((await s.request('POST', '/api/ai/drafts', { prompt: `use ${AI_KEY}` })).json().code).toBe(
      'ai_secret_in_prompt',
    );
    expect(s.provider).not.toHaveBeenCalled();
  });

  it('teste usa o mesmo formato, não salva e compartilha o limite de chamadas', async () => {
    const s = await setup();
    await s.configure();
    for (let n = 0; n < 10; n++) expect((await s.request('POST', '/api/ai/test')).statusCode).toBe(200);
    const limited = await s.request('POST', '/api/ai/drafts', { prompt: 'teste' });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().code).toBe('ai_rate_limit');
    expect(s.actions.list()).toEqual([]);
    expect(s.ptys).toEqual([]);
  });

  it('timeout libera o limite de concorrência e aborta o provedor', async () => {
    const s = await setup(() => new Promise(() => {}), 30);
    await s.configure();
    const response = await s.request('POST', '/api/ai/test');
    expect(response.statusCode).toBe(504);
    expect(s.provider.mock.calls[0]?.[0].signal.aborted).toBe(true);
    s.provider.mockResolvedValueOnce({ text: JSON.stringify(AI_DRAFT) });
    expect((await s.request('POST', '/api/ai/test')).statusCode).toBe(200);
  });

  it('cancela, rejeita concorrência e bloqueia alterações de configuração durante chamada', async () => {
    const s = await setup();
    const store = new SettingsStore(s.db);
    const pending = vi.fn<AiGenerate>(() => new Promise(() => {}));
    const service = new AiService(store, s.config.dataDir, '/bin/bash', s.audit, { generate: pending });
    service.setCredential({ provider: 'gemini', apiKey: AI_KEY, storage: 'session' });
    const controller = new AbortController();
    const request = service.draft(
      { configuration: DEFAULT_AI_SETTINGS, prompt: 'teste', history: [] },
      controller.signal,
    );
    await expect(
      service.draft({ configuration: DEFAULT_AI_SETTINGS, prompt: 'outra', history: [] }, controller.signal),
    ).rejects.toMatchObject({ code: 'ai_busy' });
    expect(() => service.removeCredential()).toThrow('em andamento');
    controller.abort();
    await expect(request).rejects.toMatchObject({ code: 'ai_cancelled' });
    expect(pending.mock.calls[0]?.[0].signal.aborted).toBe(true);
    service.removeCredential();
    service.close();
  });

  it('rejeita contexto excessivo e dados de segredo antes de chamar provedor', async () => {
    const s = await setup();
    await s.configure();
    expect((await s.request('POST', '/api/ai/drafts', { prompt: 'x'.repeat(8001) })).statusCode).toBe(400);
    expect((await s.request('POST', '/api/ai/drafts', { prompt: 'x', env: { TOKEN: 'segredo' } })).statusCode).toBe(
      400,
    );
    expect(
      (await s.request('PUT', '/api/ai/credential', { provider: 'gemini', apiKey: 'x\nsegredo', storage: 'disk' }))
        .body,
    ).not.toContain('x\nsegredo');
    expect(s.provider).not.toHaveBeenCalled();
  });

  it('configuração pública persistida não contém chave', async () => {
    const s = await setup();
    await s.request('PUT', '/api/ai/settings', { provider: 'gemini', model: 'gemini-3.5-flash' });
    await s.request('PUT', '/api/ai/credential', { provider: 'gemini', apiKey: AI_KEY, storage: 'disk' });
    expect(JSON.stringify(s.db.prepare('SELECT * FROM settings').all())).not.toContain(AI_KEY);
    expect(fs.existsSync(path.join(s.config.dataDir, 'ai-credential.json'))).toBe(true);
    await s.request('DELETE', '/api/ai/credential');
    expect(fs.existsSync(path.join(s.config.dataDir, 'ai-credential.json'))).toBe(false);
  });

  it('não envia dados quando o provedor/modelo mudou desde a revisão do destinatário', async () => {
    const s = await setup();
    await s.configure();
    const response = await s.request('POST', '/api/ai/drafts', {
      configuration: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
      prompt: 'pedido',
    });
    expect(response.json().code).toBe('ai_configuration_changed');
    expect(s.provider).not.toHaveBeenCalled();
  });

  it('desconexão HTTP aborta a chamada externa', async () => {
    const s = await setup(() => new Promise(() => {}));
    await s.configure();
    const address = await s.app.listen({ host: '127.0.0.1', port: 0 });
    const controller = new AbortController();
    const pending = http.request(
      `${address}/api/ai/drafts`,
      {
        method: 'POST',
        headers: { ...AUTH, 'content-type': 'application/json' },
        signal: controller.signal,
      },
      (response) => response.resume(),
    );
    pending.on('error', () => {});
    pending.end(JSON.stringify({ configuration: DEFAULT_AI_SETTINGS, prompt: 'teste' }));
    await vi.waitFor(() => expect(s.provider).toHaveBeenCalledTimes(1));
    controller.abort();
    await vi.waitFor(() => expect(s.provider.mock.calls[0]?.[0].signal.aborted).toBe(true));
  });

  it.each([
    ['GET', '/api/ai/settings'],
    ['PUT', '/api/ai/settings'],
    ['PUT', '/api/ai/credential'],
    ['DELETE', '/api/ai/credential'],
    ['POST', '/api/ai/test'],
    ['POST', '/api/ai/drafts'],
  ] as const)('protege %s %s com autenticação, Host e Origin', async (method, url) => {
    const s = await setup();
    expect((await s.app.inject({ method, url, headers: HOST })).statusCode).toBe(401);
    expect((await s.app.inject({ method, url, headers: { ...AUTH, host: 'malicioso.example' } })).statusCode).toBe(421);
    expect(
      (await s.app.inject({ method, url, headers: { ...AUTH, origin: 'https://malicioso.example' } })).statusCode,
    ).toBe(403);
    if (method !== 'GET')
      expect(
        (await s.app.inject({ method, url, headers: { ...AUTH, 'sec-fetch-site': 'cross-site' } })).statusCode,
      ).toBe(403);
    expect(s.provider).not.toHaveBeenCalled();
  });
});
