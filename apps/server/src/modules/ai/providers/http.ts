import { HttpError } from '../../../lib/http.js';

/** Não lê/devolve erros externos: eles podem repetir o prompt ou headers de autenticação. */
export async function providerJson(fetcher: typeof fetch, url: string, init: RequestInit): Promise<unknown> {
  const response = await fetcher(url, { ...init, redirect: 'error' });
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 401 || response.status === 403)
      throw new HttpError(422, 'chave inválida ou sem permissão no provedor', 'ai_auth');
    if (response.status === 429)
      throw new HttpError(429, 'cota ou limite do provedor atingido; tente mais tarde', 'ai_quota');
    if (response.status === 400 || response.status === 404)
      throw new HttpError(
        422,
        'o provedor recusou a chave, modelo ou formato; confira a configuração',
        'ai_configuration',
      );
    throw new HttpError(502, 'provedor indisponível; tente novamente', 'ai_provider');
  }
  if (!response.body) throw new HttpError(502, 'resposta vazia do provedor', 'ai_invalid_response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 128 * 1024) throw new HttpError(502, 'resposta do provedor excedeu o limite', 'ai_invalid_response');
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new HttpError(502, 'resposta inválida do provedor', 'ai_invalid_response');
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
