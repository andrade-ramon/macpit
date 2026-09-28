import {
  AiSettingsSchema,
  DEFAULT_AI_SETTINGS,
  type AiSettings,
  type AiPublicSettings,
  type AiCredential,
  type AiDraftRequest,
  type AiDraftResponse,
} from '@macpit/shared';
import type { SettingsStore } from '../../db/settings.js';
import type { Audit } from '../../lib/audit.js';
import { HttpError } from '../../lib/http.js';
import { AiCredentials } from './credentials.js';
import { anthropicProvider } from './providers/anthropic.js';
import { geminiProvider } from './providers/gemini.js';
import type { AiGenerate } from './providers/types.js';
import { aiSystemPrompt, aiUserPrompt } from './prompts.js';
import { AI_OUTPUT_JSON_SCHEMA, parseAiResult } from './validation.js';

export interface AiDeps {
  generate?: AiGenerate;
  now?: () => number;
  timeoutMs?: number;
}

export class AiService {
  private readonly credentials: AiCredentials;
  private readonly generate: AiGenerate;
  private readonly now: () => number;
  private active?: AbortController;
  private calls: number[] = [];
  constructor(
    private readonly store: SettingsStore,
    directory: string,
    private readonly shell: string,
    private readonly audit: Audit,
    private readonly deps: AiDeps = {},
  ) {
    this.credentials = new AiCredentials(directory);
    const gemini = geminiProvider();
    const anthropic = anthropicProvider();
    this.generate = deps.generate ?? ((r) => (r.provider === 'gemini' ? gemini(r) : anthropic(r)));
    this.now = deps.now ?? Date.now;
  }

  private configuration(): AiSettings {
    return this.store.get('ai', AiSettingsSchema, DEFAULT_AI_SETTINGS);
  }

  settings(): AiPublicSettings {
    const settings = this.configuration();
    const key = this.credentials.get();
    const hasApiKey = key?.provider === settings.provider;
    return { ...settings, hasApiKey, storage: hasApiKey ? key.storage : null };
  }

  private idle() {
    if (this.active) throw new HttpError(409, 'há uma solicitação de IA em andamento; cancele ou aguarde', 'ai_busy');
  }

  configure(settings: AiSettings) {
    this.idle();
    if (this.configuration().provider !== settings.provider) this.credentials.remove();
    this.store.set('ai', settings);
    this.audit('ai', 'settings', { provider: settings.provider, model: settings.model });
    return this.settings();
  }

  setCredential(credential: AiCredential) {
    this.idle();
    if (credential.provider !== this.configuration().provider)
      throw new HttpError(409, 'o provedor mudou; atualize a configuração', 'ai_provider_changed');
    this.credentials.set(credential);
    this.audit('ai', 'credential', {
      operation: 'replace',
      provider: credential.provider,
      storage: credential.storage,
    });
    return this.settings();
  }

  removeCredential() {
    this.idle();
    this.credentials.remove();
    this.audit('ai', 'credential', { operation: 'remove' });
    return this.settings();
  }

  async draft(
    request: AiDraftRequest,
    signal: AbortSignal,
    operation: 'draft' | 'test' = 'draft',
  ): Promise<AiDraftResponse> {
    this.idle();
    if (signal.aborted) throw new HttpError(408, 'solicitação de IA cancelada', 'ai_cancelled');
    const settings = this.configuration();
    if (request.configuration.provider !== settings.provider || request.configuration.model !== settings.model) {
      throw new HttpError(
        409,
        'a configuração de IA mudou; reabra o assistente antes de enviar',
        'ai_configuration_changed',
      );
    }
    const credential = this.credentials.get();
    if (!credential || credential.provider !== settings.provider)
      throw new HttpError(409, 'configure a API key em Configurações → IA', 'ai_not_configured');
    const input = aiUserPrompt(request);
    if (input.includes(credential.apiKey))
      throw new HttpError(400, 'remova a API key do pedido antes de enviar', 'ai_secret_in_prompt');
    const started = this.now();
    this.calls = this.calls.filter((t) => started - t < 60_000);
    if (this.calls.length >= 10)
      throw new HttpError(429, 'limite local de dez chamadas por minuto atingido', 'ai_rate_limit');
    this.calls.push(started);
    const controller = new AbortController();
    this.active = controller;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.deps.timeoutMs ?? 45_000);
    timer.unref();
    const cancel = () => controller.abort();
    signal.addEventListener('abort', cancel, { once: true });
    let rejectAbort: () => void = () => {};
    try {
      const aborted = new Promise<never>((_, reject) => {
        rejectAbort = () =>
          reject(
            new HttpError(
              timedOut ? 504 : 408,
              timedOut ? 'a IA demorou mais que o limite; tente novamente' : 'solicitação de IA cancelada',
              timedOut ? 'ai_timeout' : 'ai_cancelled',
            ),
          );
        controller.signal.addEventListener('abort', rejectAbort, { once: true });
      });
      const output = await Promise.race([
        this.generate({
          ...settings,
          apiKey: credential.apiKey,
          signal: controller.signal,
          system: aiSystemPrompt(this.shell),
          input,
          schema: AI_OUTPUT_JSON_SCHEMA,
        }),
        aborted,
      ]);
      if (output.text.includes(credential.apiKey))
        throw new HttpError(502, 'resposta inválida do provedor', 'ai_invalid_response');
      const result = parseAiResult(output.text);
      this.audit('ai', operation, {
        ...settings,
        outcome: result.status,
        durationMs: this.now() - started,
        usage: output.usage,
      });
      return { result, ...(output.usage ? { usage: output.usage } : {}) };
    } catch (error) {
      const safe =
        error instanceof HttpError
          ? error
          : new HttpError(
              502,
              'não foi possível consultar o provedor; confira a conexão e tente novamente',
              'ai_network',
            );
      this.audit('ai', operation, { ...settings, outcome: safe.code, durationMs: this.now() - started });
      throw safe;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      controller.signal.removeEventListener('abort', rejectAbort);
      controller.abort();
      this.active = undefined;
    }
  }

  close() {
    this.active?.abort();
    this.credentials.close();
  }
}
