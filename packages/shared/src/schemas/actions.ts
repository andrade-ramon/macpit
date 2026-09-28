import { z } from 'zod';
import { PARAM_NAME_RE, validateTemplate } from '../template.js';

const EnvKey = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'nome de variável inválido');

export const ActionParamSchema = z.object({
  /** Usado como `{{nome}}` no comando. */
  name: z.string().regex(PARAM_NAME_RE, 'nome de parâmetro: letras, números e _ (até 40)'),
  label: z.string().trim().max(60).optional(),
  default: z.string().max(1000).optional(),
  /** Campo de senha no formulário; o valor nunca é salvo. */
  secret: z.boolean().default(false),
  /**
   * `repo`: escolhido numa lista de repositórios git. O valor vira o caminho do repo, a ação roda nele
   * (se não tiver diretório próprio) e os demais parâmetros são preenchidos com as variáveis do repo.
   */
  type: z.enum(['text', 'repo']).default('text'),
});

/** Campos de uma ação, sem as validações cruzadas (base para `ActionSchema`). */
const ActionFieldsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  /** Executado como `MACPIT_SHELL -lc "<command>"` num pseudo-terminal. Pode ter `{{parâmetros}}`. */
  command: z.string().trim().min(1).max(10_000),
  /** Diretório de trabalho (absoluto ou `~`). Padrão: home do usuário do servidor. */
  cwd: z.string().trim().max(4096).optional(),
  env: z.record(EnvKey, z.string().max(10_000)).default({}),
  group: z.string().trim().max(40).optional(),
  /** Emoji ou texto curto. */
  icon: z.string().trim().max(8).optional(),
  favorite: z.boolean().default(false),
  /** Serviço: processo de longa duração (ex.: túnel) com status e, opcionalmente, reinício automático. */
  persistent: z.boolean().default(false),
  /** Porta que o serviço deve abrir em localhost (health-check). */
  expectedPort: z.number().int().min(1).max(65535).optional(),
  autoRestart: z.boolean().default(false),
  /** Serviço iniciado automaticamente quando o macpit sobe (ex.: túnel ao fazer login). */
  autoStart: z.boolean().default(false),
  params: z.array(ActionParamSchema).max(20).default([]),
});

export const ActionInputSchema = ActionFieldsSchema.superRefine((a, ctx) => {
  const names = a.params.map((p) => p.name.toLowerCase());
  if (new Set(names).size !== names.length) {
    ctx.addIssue({ code: 'custom', path: ['params'], message: 'nomes de parâmetros repetidos' });
  }
  const repoParams = a.params.filter((p) => p.type === 'repo');
  if (repoParams.length > 1) {
    ctx.addIssue({ code: 'custom', path: ['params'], message: 'só pode haver um parâmetro do tipo repositório' });
  }
  if (repoParams.some((p) => p.secret)) {
    ctx.addIssue({ code: 'custom', path: ['params'], message: 'parâmetro do tipo repositório não pode ser segredo' });
  }
  const templateError = validateTemplate(a.command, a.params);
  if (templateError) ctx.addIssue({ code: 'custom', path: ['command'], message: templateError });
  if (!a.persistent && (a.autoRestart || a.autoStart || a.expectedPort !== undefined)) {
    ctx.addIssue({
      code: 'custom',
      path: ['persistent'],
      message: 'porta, reinício e início automáticos exigem "serviço"',
    });
  }
  // Ninguém para preencher o formulário no boot: todo parâmetro precisa de padrão (e segredo não tem como).
  // Com um repositório padrão, as variáveis dele também servem de padrão (conferido ao iniciar).
  const repoDefault = repoParams.some((p) => p.default !== undefined);
  const noDefault = a.params.filter((p) => p.type !== 'repo' && !repoDefault && (p.default === undefined || p.secret));
  if (a.autoStart && repoParams.some((p) => p.default === undefined)) {
    ctx.addIssue({
      code: 'custom',
      path: ['autoStart'],
      message: 'iniciar com o macpit exige um repositório padrão',
    });
  }
  if (a.autoStart && noDefault.length > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['autoStart'],
      message: `iniciar com o macpit exige valor padrão (e não secreto) em: ${noDefault.map((p) => p.name).join(', ')}`,
    });
  }
});

export const ServiceStateSchema = z.object({
  /**
   * stopped: parado · starting: rodando, aguardando a porta (carência inicial) · up: porta respondendo ·
   * unhealthy: rodando mas a porta não responde · running: rodando (sem porta configurada) ·
   * restarting: caiu e vai reiniciar em `restartAt`
   */
  state: z.enum(['stopped', 'starting', 'up', 'unhealthy', 'running', 'restarting']),
  runId: z.string().nullable(),
  port: z.number().int().nullable(),
  restartAt: z.number().nullable(),
  /** Reinícios automáticos seguidos (zera quando fica estável). */
  restarts: z.number().int(),
  lastCheckAt: z.number().nullable(),
  /** Última queda, ex.: `falhou (código 255)`. */
  lastExit: z.string().nullable(),
});

export const RunStatusSchema = z.enum(['running', 'exited', 'failed', 'killed', 'interrupted']);

export const RunSchema = z.object({
  id: z.string(),
  /** `null` se a ação foi apagada depois. */
  actionId: z.string().nullable(),
  actionName: z.string(),
  command: z.string(),
  cwd: z.string(),
  /** Projeto resolvido ao iniciar; null para execuções antigas ou sem parâmetro repo. */
  repoPath: z.string().nullable(),
  pid: z.number().int().nullable(),
  status: RunStatusSchema,
  exitCode: z.number().int().nullable(),
  signal: z.string().nullable(),
  startedAt: z.number(),
  endedAt: z.number().nullable(),
  /** Tamanho do log gravado, em bytes. */
  logBytes: z.number(),
});

export const ActionSchema = ActionFieldsSchema.extend({
  id: z.string(),
  env: z.record(z.string(), z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
  lastRun: RunSchema.nullable(),
  runningCount: z.number().int(),
  /** Só para `persistent`. */
  service: ServiceStateSchema.nullable(),
});

export const RunStartSchema = z.object({
  cols: z.number().int().min(10).max(500).default(120),
  rows: z.number().int().min(5).max(200).default(32),
  /** Valores dos `{{parâmetros}}` (os ausentes usam o padrão). */
  params: z.record(z.string(), z.string().max(10_000)).default({}),
});

/** Guarda de contexto opcional para parar pelo painel de um projeto. */
export const ServiceStopSchema = z.object({ repoPath: z.string().min(1).max(4096).optional() });

/** Arquivo de exportação/importação de ações. */
export const ActionsExportSchema = z.object({
  format: z.literal('macpit/actions'),
  version: z.literal(1),
  exportedAt: z.string(),
  actions: z.array(z.unknown()).max(500),
});

export const ActionsImportSchema = z.object({
  actions: z.array(z.unknown()).min(1).max(500),
  /** Ação com o mesmo nome já existente: pular (padrão) ou criar mesmo assim. */
  onConflict: z.enum(['skip', 'duplicate']).default('skip'),
});

export const ActionsImportResultSchema = z.object({
  created: z.number().int(),
  skipped: z.array(z.object({ name: z.string(), reason: z.string() })),
});

export const ShellEntrySchema = z.object({
  kind: z.enum(['alias', 'function']),
  name: z.string(),
  /** Comando que a ação importada vai rodar. */
  command: z.string(),
  /** Valor do alias ou arquivo onde a função foi definida. */
  detail: z.string(),
});

export const ShellImportSchema = z.object({
  shell: z.string(),
  entries: z.array(ShellEntrySchema),
  /** Aviso (ex.: shell não suportado para funções). */
  warning: z.string().optional(),
});

export const RunListQuerySchema = z.object({
  actionId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const IdParamSchema = z.object({ id: z.string().min(1).max(64) });

/** Eventos do canal `run:<id>`. */
export type RunEvent =
  | { kind: 'replay'; data: string; run: Run; truncated: boolean }
  | { kind: 'output'; data: string }
  | { kind: 'status'; run: Run }
  /** A execução não existe mais (apagada pela retenção). */
  | { kind: 'gone' };

export type ActionInput = z.input<typeof ActionInputSchema>;
export type ActionParam = z.infer<typeof ActionParamSchema>;
export type ServiceState = z.infer<typeof ServiceStateSchema>;
export type ActionsExport = z.infer<typeof ActionsExportSchema>;
export type ActionsImportResult = z.infer<typeof ActionsImportResultSchema>;
export type ShellEntry = z.infer<typeof ShellEntrySchema>;
export type ShellImport = z.infer<typeof ShellImportSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type RunStatus = z.infer<typeof RunStatusSchema>;
export type Run = z.infer<typeof RunSchema>;
export type RunStart = z.infer<typeof RunStartSchema>;

export const runChannel = (id: string) => `run:${id}`;
