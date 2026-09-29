import { describe, expect, it } from 'vitest';
import {
  AiDraftRequestSchema,
  AiResultSchema,
  AiSettingsSchema,
  DEFAULT_AI_SETTINGS,
  aiActionInput,
  type AiResult,
} from './ai.js';

const draft: AiResult = {
  status: 'draft',
  explanation: 'Mostra o texto informado.',
  questions: [],
  requirements: [],
  warnings: [],
  action: {
    name: 'Mostrar texto',
    command: 'printf "%s\\n" {{texto}}',
    group: null,
    icon: null,
    persistent: false,
    expectedPort: null,
    params: [{ name: 'texto', label: 'Texto', type: 'text', secret: false, default: null }],
  },
};

describe('contratos de IA', () => {
  it('converte rascunho para ação com automações e ambiente desligados', () => {
    const result = AiResultSchema.parse(draft);
    expect(aiActionInput(result.action!)).toMatchObject({
      autoStart: false,
      autoRestart: false,
      env: {},
      params: [{ name: 'texto' }],
    });
  });
  it.each([
    { ...draft, status: 'needs_input' },
    { ...draft, action: null },
    { ...draft, questions: ['Pergunta indevida'] },
    { ...draft, action: { ...draft.action, command: "echo '{{texto}}'" } },
    { ...draft, action: { ...draft.action, autoStart: true } },
    { ...draft, action: { ...draft.action, env: { TOKEN: 'segredo-sintetico' } } },
    {
      ...draft,
      action: {
        ...draft.action,
        params: [{ name: 'texto', label: 'Senha', type: 'text', secret: true, default: 'segredo' }],
      },
    },
    {
      ...draft,
      action: {
        ...draft.action,
        params: [{ name: 'texto', label: 'Repo', type: 'repo', secret: false, default: '/tmp/projeto' }],
      },
    },
  ])('rejeita saída incoerente ou fora do escopo %#', (value) => {
    expect(AiResultSchema.safeParse(value).success).toBe(false);
  });
  it('aceita esclarecimento e recusa sem ação', () => {
    expect(
      AiResultSchema.safeParse({ ...draft, status: 'needs_input', action: null, questions: ['Qual serviço?'] }).success,
    ).toBe(true);
    expect(AiResultSchema.safeParse({ ...draft, status: 'unsupported', action: null }).success).toBe(true);
  });
  it('limita pedidos, histórico e contexto total', () => {
    expect(AiDraftRequestSchema.safeParse({ configuration: DEFAULT_AI_SETTINGS, prompt: 'x' }).success).toBe(true);
    expect(
      AiDraftRequestSchema.safeParse({ configuration: DEFAULT_AI_SETTINGS, prompt: 'a'.repeat(8001) }).success,
    ).toBe(false);
    expect(
      AiDraftRequestSchema.safeParse({
        configuration: DEFAULT_AI_SETTINGS,
        prompt: 'x',
        history: Array(7).fill({ prompt: 'x', result: draft }),
      }).success,
    ).toBe(false);
    expect(
      AiDraftRequestSchema.safeParse({
        configuration: DEFAULT_AI_SETTINGS,
        prompt: 'x',
        history: Array(5).fill({ prompt: 'x'.repeat(8000), result: draft }),
      }).success,
    ).toBe(false);
  });
  it('modelo precisa pertencer ao provedor e endpoints não são configuráveis', () => {
    expect(AiSettingsSchema.safeParse({ provider: 'gemini', model: 'claude-sonnet-4-6' }).success).toBe(false);
    expect(
      AiSettingsSchema.safeParse({ provider: 'gemini', model: 'gemini-3.5-flash', url: 'http://localhost' }).success,
    ).toBe(false);
  });
});
