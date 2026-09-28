import { z } from 'zod';
import { HttpError } from '../../../lib/http.js';
import { providerJson } from './http.js';
import type { AiGenerate } from './types.js';

const ResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        finishReason: z.string(),
        content: z.object({
          parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })),
        }),
      }),
    )
    .min(1),
  usageMetadata: z
    .object({ promptTokenCount: z.number().int().nonnegative(), candidatesTokenCount: z.number().int().nonnegative() })
    .optional(),
});

export function geminiProvider(fetcher: typeof fetch = fetch): AiGenerate {
  return async (r) => {
    const response = ResponseSchema.safeParse(
      await providerJson(
        fetcher,
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(r.model)}:generateContent`,
        {
          method: 'POST',
          signal: r.signal,
          headers: { 'content-type': 'application/json', 'x-goog-api-key': r.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: r.system }] },
            contents: [{ role: 'user', parts: [{ text: r.input }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseJsonSchema: r.schema,
              maxOutputTokens: 8192,
            },
          }),
        },
      ),
    );
    if (!response.success || response.data.candidates[0]?.finishReason !== 'STOP') {
      throw new HttpError(502, 'o provedor não retornou uma resposta completa; ajuste o pedido', 'ai_invalid_response');
    }
    const { candidates, usageMetadata: usage } = response.data;
    return {
      text: candidates[0]!.content.parts
        .filter((p) => !p.thought)
        .map((p) => p.text ?? '')
        .join(''),
      ...(usage ? { usage: { inputTokens: usage.promptTokenCount, outputTokens: usage.candidatesTokenCount } } : {}),
    };
  };
}
