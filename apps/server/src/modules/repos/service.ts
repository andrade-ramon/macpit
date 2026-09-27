import os from 'node:os';
import path from 'node:path';
import type { Action, Repo, RepoList, RepoSettings, RepoVar } from '@macpit/shared';
import { DEFAULT_REPO_SETTINGS, RepoSelectionSchema, RepoSettingsSchema, RepoVarsInputSchema } from '@macpit/shared';
import type { Db } from '../../db/index.js';
import type { SettingsStore } from '../../db/settings.js';
import { noopAudit, type Audit } from '../../lib/audit.js';
import { run } from '../../lib/exec.js';
import { HttpError, parseOr400 } from '../../lib/http.js';
import { scanRepos, type FoundRepo } from './scanner.js';

const SETTINGS_KEY = 'repos';
const SELECTION_KEY = 'repos.selection';

interface VarRow {
  name: string;
  value: string;
  secret: number;
}

/** O que a execução de uma ação ganha ao escolher um repositório. */
export interface RepoResolution {
  values: Record<string, string>;
  cwd?: string;
  env: Record<string, string>;
  repo?: string;
}

/**
 * Repositórios git encontrados nas pastas configuradas + variáveis salvas por repositório.
 * As variáveis preenchem os `{{parâmetros}}` de mesmo nome das ações que usam um parâmetro `repo`.
 */
export class RepoService {
  private cache: { repos: FoundRepo[]; errors: string[]; scannedAt: number } | null = null;
  private scanning: Promise<void> | null = null;

  constructor(
    private readonly db: Db,
    private readonly settingsStore: SettingsStore,
    private readonly home: () => string = os.homedir,
    private readonly audit: Audit = noopAudit,
    private readonly now: () => number = Date.now,
    /** Abre uma pasta no Finder (testes: espião). */
    private readonly openFolder: (dir: string) => Promise<void> = async (dir) => {
      await run('open', [dir], { timeoutMs: 5_000 });
    },
  ) {}

  settings(): RepoSettings {
    return this.settingsStore.get(SETTINGS_KEY, RepoSettingsSchema, DEFAULT_REPO_SETTINGS);
  }

  /** Caminhos importados, ou `null` se nunca foi escolhido (todos). */
  private selection(): Set<string> | null {
    const s = this.settingsStore.get(SELECTION_KEY, RepoSelectionSchema.nullable(), null);
    return s ? new Set(s.paths) : null;
  }

  private isImported(r: FoundRepo, sel = this.selection()): boolean {
    return sel === null || sel.has(r.path);
  }

  /** Salva quais repositórios importar (caminhos desconhecidos são descartados). */
  async setSelection(input: unknown): Promise<RepoList> {
    const { paths } = parseOr400(RepoSelectionSchema, input);
    await this.ensureScanned();
    const known = new Set(this.cache!.repos.map((r) => r.path));
    // mantém caminhos de repos que sumiram temporariamente (pasta desmontada) se já estavam selecionados
    const prev = this.selection() ?? new Set<string>();
    const keep = [...prev].filter((p) => !known.has(p));
    this.settingsStore.set(SELECTION_KEY, { paths: [...new Set([...paths.filter((p) => known.has(p)), ...keep])] });
    return this.list();
  }

  private expand(p: string): string {
    return p === '~' || p.startsWith('~/') ? path.join(this.home(), p.slice(1)) : p;
  }

  async updateSettings(input: unknown): Promise<RepoSettings> {
    const s = parseOr400(RepoSettingsSchema, input);
    for (const r of s.roots) {
      if (!path.isAbsolute(this.expand(r))) {
        throw new HttpError(400, `pasta deve ser absoluta ou começar com ~: ${r}`, 'bad_root');
      }
    }
    const clean = { ...s, roots: [...new Set(s.roots.map((r) => r.replace(/(.)\/+$/, '$1')))] };
    this.settingsStore.set(SETTINGS_KEY, clean);
    await this.scan();
    return clean;
  }

  /** Varre de novo as pastas (chamadas simultâneas compartilham a mesma varredura). */
  async scan(): Promise<RepoList> {
    this.scanning ??= (async () => {
      const s = this.settings();
      const { repos, errors } = await scanRepos(
        s.roots.map((r) => this.expand(r)),
        s.maxDepth,
      );
      this.cache = { repos, errors, scannedAt: this.now() };
    })().finally(() => {
      this.scanning = null;
    });
    await this.scanning;
    return this.list();
  }

  /** Lista em cache (a primeira chamada varre). */
  async listFresh(): Promise<RepoList> {
    await this.ensureScanned();
    return this.list();
  }

  async ensureScanned(): Promise<void> {
    if (!this.cache) await this.scan();
  }

  private list(): RepoList {
    const sel = this.selection();
    return {
      hasSelection: sel !== null,
      repos: (this.cache?.repos ?? []).map((r) => this.toPublic(r, sel)),
      scannedAt: this.cache?.scannedAt ?? null,
      errors: this.cache?.errors ?? [],
    };
  }

  private toPublic(r: FoundRepo, sel = this.selection()): Repo {
    return { ...r, vars: this.rows(r.path).map(publicVar), imported: this.isImported(r, sel) };
  }

  private rows(repoPath: string): VarRow[] {
    return this.db
      .prepare('SELECT name, value, secret FROM repo_vars WHERE repo_path = ? ORDER BY name COLLATE NOCASE')
      .all(repoPath) as unknown as VarRow[];
  }

  private async get(id: string): Promise<FoundRepo> {
    if (!this.cache) await this.scan();
    const repo = this.cache!.repos.find((r) => r.id === id);
    if (!repo) throw new HttpError(404, `repositório ${id} não encontrado`, 'not_found');
    return repo;
  }

  /** Abre a pasta do repositório no Finder (só caminhos vindos da varredura; `open` com argv, sem shell). */
  async open(id: string): Promise<void> {
    const repo = await this.get(id);
    await this.openFolder(repo.path);
  }

  /** Substitui as variáveis do repositório. Segredo enviado sem `value` mantém o valor salvo. */
  async setVars(id: string, input: unknown): Promise<Repo> {
    const repo = await this.get(id);
    const { vars } = parseOr400(RepoVarsInputSchema, input);
    const old = new Map(this.rows(repo.path).map((r) => [r.name.toLowerCase(), r]));
    const next = vars.map((v) => {
      const prev = old.get(v.name.toLowerCase());
      const value = v.value ?? (v.secret && prev?.secret === 1 ? prev.value : undefined);
      if (value === undefined) throw new HttpError(400, `informe um valor para ${v.name}`, 'bad_var');
      return { name: v.name, value, secret: v.secret };
    });
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM repo_vars WHERE repo_path = ?').run(repo.path);
      const insert = this.db.prepare('INSERT INTO repo_vars (repo_path, name, value, secret) VALUES (?, ?, ?, ?)');
      for (const v of next) insert.run(repo.path, v.name, v.value, v.secret ? 1 : 0);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    // só os nomes: valores podem ser segredos
    this.audit('repo_vars', repo.path, { names: next.map((v) => v.name) });
    return this.toPublic(repo);
  }

  /** Acha o repositório pelo id, caminho, `owner/nome` do GitHub ou nome da pasta (se único). */
  find(ref: string): FoundRepo {
    const sel = this.selection();
    const repos = (this.cache?.repos ?? []).filter((r) => this.isImported(r, sel));
    const expanded = this.expand(ref.trim());
    const exact = repos.find(
      (r) => r.id === ref || r.path === expanded || r.github?.toLowerCase() === ref.toLowerCase(),
    );
    if (exact) return exact;
    const byName = repos.filter((r) => r.name.toLowerCase() === ref.trim().toLowerCase());
    if (byName.length === 1) return byName[0]!;
    if (byName.length > 1) {
      throw new HttpError(
        400,
        `há ${byName.length} repositórios chamados "${ref}"; escolha na lista`,
        'ambiguous_repo',
      );
    }
    throw new HttpError(
      400,
      `repositório não encontrado ou não importado: ${ref} (confira em Repositórios)`,
      'bad_repo',
    );
  }

  /**
   * Prepara a execução de uma ação com parâmetro `repo`: o valor vira o caminho do repositório,
   * parâmetros não informados recebem a variável de mesmo nome do repo (antes do padrão da ação) e o
   * diretório padrão passa a ser o do repositório. Ações sem parâmetro `repo` passam intactas.
   * Síncrono (usa a última varredura) porque roda também nos reinícios automáticos de serviços.
   */
  resolve(action: Action, values: Readonly<Record<string, string>>): RepoResolution {
    const param = action.params.find((p) => p.type === 'repo');
    if (!param) return { values: { ...values }, env: {} };
    const ref = values[param.name] || param.default;
    if (!ref) throw new HttpError(400, `escolha um repositório para {{${param.name}}}`, 'bad_params');
    const repo = this.find(ref);
    const vars = new Map(this.rows(repo.path).map((r) => [r.name.toLowerCase(), r.value]));
    const out: Record<string, string> = {};
    for (const p of action.params) {
      if (p === param) continue;
      const given = values[p.name];
      const fromRepo = vars.get(p.name.toLowerCase());
      if (given !== undefined && given !== '') out[p.name] = given;
      else if (fromRepo !== undefined) out[p.name] = fromRepo;
      else if (given !== undefined) out[p.name] = given;
    }
    out[param.name] = repo.path;
    return {
      values: out,
      ...(action.cwd?.trim() ? {} : { cwd: repo.path }),
      env: withLegacyNames({
        MACPIT_REPO_PATH: repo.path,
        MACPIT_REPO_NAME: repo.name,
        ...(repo.branch ? { MACPIT_REPO_BRANCH: repo.branch } : {}),
        ...(repo.github ? { MACPIT_REPO_GITHUB: repo.github } : {}),
      }),
      repo: repo.path,
    };
  }
}

const publicVar = (r: VarRow): RepoVar => ({
  name: r.name,
  value: r.secret ? '' : r.value,
  secret: r.secret === 1,
  hasValue: r.value !== '',
});

/** `MACPIT_REPO_X` também como `BM_REPO_X` (nome da época do bash-monitor), para ações antigas. */
function withLegacyNames(env: Record<string, string>): Record<string, string> {
  const out = { ...env };
  for (const [k, v] of Object.entries(env)) out[`BM_${k.slice('MACPIT_'.length)}`] = v;
  return out;
}
