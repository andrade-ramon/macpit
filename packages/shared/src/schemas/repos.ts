import { z } from 'zod';
import { PARAM_NAME_RE } from '../template.js';

/** Pastas onde procurar repositórios git (ex.: `~/github`). */
export const RepoSettingsSchema = z.object({
  roots: z.array(z.string().trim().min(1).max(4096)).max(20),
  /** Quantos níveis abaixo de cada pasta procurar (`~/github/org/projeto` = 2). */
  maxDepth: z.number().int().min(1).max(5),
});

export const DEFAULT_REPO_SETTINGS: RepoSettings = { roots: [], maxDepth: 3 };

export const RepoVarSchema = z.object({
  /** Mesmo formato de nome dos `{{parâmetros}}`: preenche o parâmetro de mesmo nome. */
  name: z.string().regex(PARAM_NAME_RE, 'nome: letras, números e _ (até 40)'),
  /** Segredos nunca voltam para o navegador: aqui vem `''` e `hasValue` diz se há valor salvo. */
  value: z.string().max(10_000),
  secret: z.boolean(),
  hasValue: z.boolean(),
});

export const RepoSchema = z.object({
  /** Derivado do caminho (estável entre varreduras). */
  id: z.string(),
  name: z.string(),
  path: z.string(),
  /** URL do remote `origin` (ou do primeiro remote). */
  remote: z.string().nullable(),
  /** `owner/nome` quando o remote é do GitHub. */
  github: z.string().nullable(),
  /** Branch atual (ou o commit curto, se destacado). */
  branch: z.string().nullable(),
  vars: z.array(RepoVarSchema),
  /** Aparece para escolha nas ações e na paleta ⌘K. */
  imported: z.boolean(),
});

/** Quais repositórios importar (caminhos). Sem seleção salva, todos são importados. */
export const RepoSelectionSchema = z.object({
  paths: z.array(z.string().min(1).max(4096)).max(5000),
});

export const RepoListSchema = z.object({
  repos: z.array(RepoSchema),
  scannedAt: z.number().nullable(),
  /** Pastas configuradas que não existem ou não puderam ser lidas. */
  errors: z.array(z.string()),
  /** `false` enquanto nenhuma seleção foi salva (todos importados). */
  hasSelection: z.boolean(),
});

export const RepoVarsInputSchema = z
  .object({
    vars: z
      .array(
        z.object({
          name: z.string().regex(PARAM_NAME_RE, 'nome: letras, números e _ (até 40)'),
          /** Segredo sem `value` mantém o valor salvo. */
          value: z.string().max(10_000).optional(),
          secret: z.boolean().default(false),
        }),
      )
      .max(100),
  })
  .superRefine((v, ctx) => {
    const names = v.vars.map((x) => x.name.toLowerCase());
    if (new Set(names).size !== names.length)
      ctx.addIssue({ code: 'custom', path: ['vars'], message: 'nomes repetidos' });
  });

export type RepoSettings = z.infer<typeof RepoSettingsSchema>;
export type RepoVar = z.infer<typeof RepoVarSchema>;
export type Repo = z.infer<typeof RepoSchema>;
export type RepoList = z.infer<typeof RepoListSchema>;
export type RepoSelection = z.infer<typeof RepoSelectionSchema>;
export type RepoVarsInput = z.input<typeof RepoVarsInputSchema>;
