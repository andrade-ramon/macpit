import { z } from 'zod';
import { HttpError } from '../../../lib/http.js';
import { providerJson } from './http.js';
import type { AiGenerate } from './types.js';

const ResponseSchema = z.object({
  stop_reason: z.string(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  usage: z
    .object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() })
    .optional(),
});

export function anthropicProvider(fetcher: typeof fetch = fetch): AiGenerate {
  return async (r) => {
    const response = ResponseSchema.safeParse(
      await providerJson(fetcher, 'https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: r.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': r.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: r.model,
          max_tokens: 4096,
          system: r.system,
          messages: [{ role: 'user', content: r.input }],
          output_config: { format: { type: 'json_schema', schema: r.schema } },
        }),
      }),
    );
    if (
      !response.success ||
      response.data.stop_reason !== 'end_turn' ||
      response.data.content.some((b) => b.type !== 'text')
    ) {
      throw new HttpError(502, 'o provedor não retornou uma resposta completa; ajuste o pedido', 'ai_invalid_response');
    }
    const { content, usage } = response.data;
    return {
      text: content.map((b) => b.text ?? '').join(''),
      ...(usage ? { usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens } } : {}),
    };
  };
}
