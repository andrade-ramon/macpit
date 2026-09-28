import { z } from 'zod';
import { AiOutputShapeSchema, AiResultSchema, type AiResult } from '@macpit/shared';
import { HttpError } from '../../lib/http.js';

/** Provedores suportam subconjuntos de JSON Schema; limites continuam obrigatórios na validação local. */
function portableSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(portableSchema);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([k]) =>
            !['$schema', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'minItems', 'maxItems'].includes(k),
        )
        .map(([k, v]) => [k, portableSchema(v)]),
    );
  }
  return value;
}
export const AI_OUTPUT_JSON_SCHEMA = portableSchema(z.toJSONSchema(AiOutputShapeSchema)) as Record<string, unknown>;

export function parseAiResult(text: string): AiResult {
  try {
    if (Buffer.byteLength(text) > 48 * 1024) throw new Error('limite');
    return AiResultSchema.parse(JSON.parse(text));
  } catch {
    // Erros zod podem conter valores recebidos. Nunca devolvê-los ou registrá-los.
    throw new HttpError(
      502,
      'a IA retornou um rascunho inválido; ajuste o pedido e tente novamente',
      'ai_invalid_response',
    );
  }
}
