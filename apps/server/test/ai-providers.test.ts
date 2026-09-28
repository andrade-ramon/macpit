import { describe, expect, it, vi } from 'vitest';
import { anthropicProvider } from '../src/modules/ai/providers/anthropic.js';
import { geminiProvider } from '../src/modules/ai/providers/gemini.js';
import { providerJson } from '../src/modules/ai/providers/http.js';
import type { AiProviderRequest } from '../src/modules/ai/providers/types.js';
import { AI_OUTPUT_JSON_SCHEMA, parseAiResult } from '../src/modules/ai/validation.js';
import { AI_DRAFT, AI_KEY } from './fixtures/ai.js';

const request: AiProviderRequest = {
  provider: 'gemini',
  model: 'gemini-3.5-flash',
  apiKey: AI_KEY,
  input: 'pedido sintético',
  system: 'sistema sintético',
  schema: AI_OUTPUT_JSON_SCHEMA,
  signal: new AbortController().signal,
};

describe('adaptadores de IA', () => {
  it('Gemini usa endpoint fixo, chave no header, schema, limites e sem ferramentas', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        candidates: [
          {
            finishReason: 'STOP',
            content: { parts: [{ thought: true, text: 'não incluir' }, { text: JSON.stringify(AI_DRAFT) }] },
          },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
      }),
    );
    const result = await geminiProvider(fetcher)(request);
    expect(parseAiResult(result.text)).toEqual(AI_DRAFT);
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent');
    expect(String(url)).not.toContain(AI_KEY);
    expect(options).toMatchObject({ redirect: 'error', signal: request.signal, headers: { 'x-goog-api-key': AI_KEY } });
    const body = JSON.parse(options!.body as string);
    expect(body.generationConfig.responseJsonSchema).toEqual(AI_OUTPUT_JSON_SCHEMA);
    expect(body.generationConfig.maxOutputTokens).toBe(8192);
    expect(body.tools).toBeUndefined();
    expect(options!.body).not.toContain(AI_KEY);
  });

  it('Anthropic usa Messages com output_config e autenticação só no header', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(AI_DRAFT) }],
        usage: { input_tokens: 5, output_tokens: 15 },
      }),
    );
    const result = await anthropicProvider(fetcher)({ ...request, provider: 'anthropic', model: 'claude-sonnet-4-6' });
    expect(parseAiResult(result.text)).toEqual(AI_DRAFT);
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(options).toMatchObject({
      redirect: 'error',
      headers: { 'x-api-key': AI_KEY, 'anthropic-version': '2023-06-01' },
    });
    const body = JSON.parse(options!.body as string);
    expect(body.output_config.format).toEqual({ type: 'json_schema', schema: AI_OUTPUT_JSON_SCHEMA });
    expect(body.max_tokens).toBe(4096);
    expect(body.tools).toBeUndefined();
    expect(options!.body).not.toContain(AI_KEY);
  });

  it.each([
    [401, 'ai_auth'],
    [403, 'ai_auth'],
    [429, 'ai_quota'],
    [400, 'ai_configuration'],
    [404, 'ai_configuration'],
    [503, 'ai_provider'],
  ] as const)('normaliza HTTP %s sem ler corpo externo', async (status, code) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(`segredo ${AI_KEY}`, { status }));
    await expect(geminiProvider(fetcher)(request)).rejects.toMatchObject({ code });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('recusa resposta truncada, ferramentas e JSON inválido', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{}' }] } }] }),
      );
    await expect(geminiProvider(fetcher)(request)).rejects.toMatchObject({ code: 'ai_invalid_response' });
    fetcher.mockResolvedValueOnce(
      Response.json({ stop_reason: 'end_turn', content: [{ type: 'tool_use', text: '{}' }] }),
    );
    await expect(anthropicProvider(fetcher)(request)).rejects.toMatchObject({ code: 'ai_invalid_response' });
    fetcher.mockResolvedValueOnce(new Response('não é JSON'));
    await expect(geminiProvider(fetcher)(request)).rejects.toMatchObject({ code: 'ai_invalid_response' });
    expect(() => parseAiResult('```json\n{}\n```')).toThrow('rascunho inválido');
  });

  it('limita bytes de resposta mesmo sem content-length', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('x'.repeat(128 * 1024 + 1)));
    await expect(providerJson(fetcher, 'https://api.anthropic.com/v1/messages', {})).rejects.toMatchObject({
      code: 'ai_invalid_response',
    });
    expect(() => parseAiResult('x'.repeat(48 * 1024 + 1))).toThrow('rascunho inválido');
  });
});
