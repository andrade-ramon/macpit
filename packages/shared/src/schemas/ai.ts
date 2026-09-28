import { z } from 'zod';
import { ActionInputSchema, ActionParamSchema } from './actions.js';

export const AI_MODELS = {
  gemini: ['gemini-3.5-flash', 'gemini-2.5-flash'],
  anthropic: ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
} as const;
export const AiProviderSchema = z.enum(['gemini', 'anthropic']);
export const AiSettingsSchema = z
  .strictObject({
    provider: AiProviderSchema,
    model: z.string().min(1).max(100),
  })
  .refine((s) => (AI_MODELS[s.provider] as readonly string[]).includes(s.model), {
    path: ['model'],
    message: 'modelo não disponível para este provedor',
  });
export const DEFAULT_AI_SETTINGS = { provider: 'gemini', model: AI_MODELS.gemini[0] } as const;
export const AiCredentialSchema = z.strictObject({
  provider: AiProviderSchema,
  apiKey: z
    .string()
    .trim()
    .min(8)
    .max(1024)
    .regex(/^[\x21-\x7e]+$/, 'chave inválida'),
  storage: z.enum(['session', 'disk']),
});
export type AiSettings = z.infer<typeof AiSettingsSchema>;
export type AiProvider = z.infer<typeof AiProviderSchema>;
export type AiCredential = z.infer<typeof AiCredentialSchema>;
export interface AiPublicSettings extends AiSettings {
  hasApiKey: boolean;
  storage: AiCredential['storage'] | null;
}

/** Subconjunto deliberado: o provedor não escolhe env, cwd ou início/reinício automático. */
export const AiActionSchema = z.strictObject({
  name: ActionInputSchema.shape.name,
  command: ActionInputSchema.shape.command,
  group: z.string().max(40).nullable(),
  icon: z.string().max(8).nullable(),
  persistent: z.boolean(),
  expectedPort: z.number().int().min(1).max(65535).nullable(),
  params: z
    .array(
      z.strictObject({
        name: ActionParamSchema.shape.name,
        label: z.string().max(60),
        type: z.enum(['text', 'repo']),
        secret: z.boolean(),
        default: z.string().max(1000).nullable(),
      }),
    )
    .max(20),
});
export type AiAction = z.infer<typeof AiActionSchema>;

export function aiActionInput(action: AiAction): z.infer<typeof ActionInputSchema> {
  return ActionInputSchema.parse({
    name: action.name,
    command: action.command,
    ...(action.group ? { group: action.group } : {}),
    ...(action.icon ? { icon: action.icon } : {}),
    persistent: action.persistent,
    ...(action.expectedPort !== null ? { expectedPort: action.expectedPort } : {}),
    autoStart: false,
    autoRestart: false,
    env: {},
    favorite: false,
    params: action.params.map(({ default: value, ...param }) => ({
      ...param,
      ...(value !== null ? { default: value } : {}),
    })),
  });
}

/** Formato comum enviado aos provedores; regras cruzadas continuam locais. */
export const AiOutputShapeSchema = z.strictObject({
  status: z.enum(['needs_input', 'draft', 'unsupported']),
  explanation: z.string().trim().min(1).max(4000),
  questions: z.array(z.string().trim().min(1).max(500)).max(5),
  requirements: z.array(z.string().trim().min(1).max(500)).max(10),
  warnings: z.array(z.string().trim().min(1).max(500)).max(10),
  action: AiActionSchema.nullable(),
});
export const AiResultSchema = AiOutputShapeSchema.superRefine((result, ctx) => {
  const invalid = (message: string) => ctx.addIssue({ code: 'custom', message });
  if ((result.status === 'draft') !== (result.action !== null)) invalid('rascunho exige uma ação; outros estados não');
  if ((result.status === 'needs_input') !== result.questions.length > 0) invalid('perguntas exigem needs_input');
  if (result.action) {
    if (result.action.params.some((p) => p.secret && p.default !== null)) invalid('segredo não pode ter padrão');
    // O projeto será escolhido localmente; nunca aceitar um caminho fornecido pelo modelo como padrão.
    if (result.action.params.some((p) => p.type === 'repo' && p.default !== null))
      invalid('repositório deve ser escolhido no editor');
    try {
      aiActionInput(result.action);
    } catch {
      invalid('ação ou template inválido');
    }
  }
});
export type AiResult = z.infer<typeof AiResultSchema>;
export const AiDraftRequestSchema = z
  .strictObject({
    configuration: AiSettingsSchema,
    prompt: z.string().trim().min(1).max(8000),
    history: z
      .array(z.strictObject({ prompt: z.string().trim().min(1).max(8000), result: AiResultSchema }))
      .max(6)
      .default([]),
  })
  .refine((r) => JSON.stringify(r).length <= 32000, 'contexto excede 32 mil caracteres; inicie outro pedido');
export type AiDraftRequest = z.infer<typeof AiDraftRequestSchema>;
export const AiUsageSchema = z.strictObject({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});
export interface AiDraftResponse {
  result: AiResult;
  usage?: z.infer<typeof AiUsageSchema>;
}
