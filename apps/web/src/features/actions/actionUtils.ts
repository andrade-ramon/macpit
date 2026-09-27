import type { Action, ActionParam, Repo, Run, RunStatus, ServiceState } from '@macpit/shared';
import { extractPlaceholders } from '@macpit/shared';

export interface ActionGroup {
  title: string;
  items: Action[];
}

/** Favoritas primeiro; depois por grupo (sem grupo por último), nomes em ordem alfabética. */
export function groupActions(actions: readonly Action[]): ActionGroup[] {
  const byName = (a: Action, b: Action) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
  const favorites = actions.filter((a) => a.favorite).sort(byName);
  const groups = new Map<string, Action[]>();
  for (const a of actions) {
    if (a.favorite) continue;
    const key = a.group ?? '';
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  const result: ActionGroup[] = [];
  if (favorites.length) result.push({ title: 'Favoritas', items: favorites });
  const keys = [...groups.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'pt-BR')));
  for (const k of keys) result.push({ title: k || 'Sem grupo', items: groups.get(k)!.sort(byName) });
  return result;
}

export const STATUS_LABEL: Record<RunStatus, string> = {
  running: 'rodando',
  exited: 'concluída',
  failed: 'falhou',
  killed: 'parada',
  interrupted: 'interrompida',
};

export const STATUS_CLASS: Record<RunStatus, string> = {
  running: 'bg-accent-soft text-accent',
  exited: 'bg-panel2 text-text2',
  failed: 'bg-danger-soft text-danger',
  killed: 'bg-panel3 text-warn',
  interrupted: 'bg-panel3 text-warn',
};

/** Descrição curta do resultado: `concluída`, `falhou (código 2)`, `parada (SIGTERM)`. */
export function describeRun(run: Pick<Run, 'status' | 'exitCode' | 'signal'>): string {
  const label = STATUS_LABEL[run.status];
  if (run.status === 'failed' && run.signal) return `${label} (${run.signal})`;
  if (run.status === 'failed' && run.exitCode !== null) return `${label} (código ${run.exitCode})`;
  if (run.status === 'killed' && run.signal) return `${label} (${run.signal})`;
  return label;
}

export function runDurationMs(run: Pick<Run, 'startedAt' | 'endedAt'>, now = Date.now()): number {
  return (run.endedAt ?? now) - run.startedAt;
}

export interface EnvRow {
  key: string;
  value: string;
}

export const envToRows = (env: Record<string, string>): EnvRow[] =>
  Object.entries(env).map(([key, value]) => ({ key, value }));

/** Ignora linhas sem nome; a última ocorrência de um nome vence. */
export function rowsToEnv(rows: readonly EnvRow[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const r of rows) if (r.key.trim()) env[r.key.trim()] = r.value;
  return env;
}

export const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface ServiceBadge {
  text: string;
  className: string;
  /** Está "vivo" (mostra Parar em vez de Iniciar). */
  active: boolean;
}

/** Selo do serviço: `conectado :5432`, `sem resposta :5432`, `reiniciando em 8s (3ª)`… */
export function serviceBadge(s: ServiceState, now = Date.now()): ServiceBadge {
  const port = s.port ? ` :${s.port}` : '';
  switch (s.state) {
    case 'up':
      return { text: `conectado${port}`, className: 'bg-accent-soft text-accent', active: true };
    case 'starting':
      return { text: `iniciando${port}`, className: 'bg-panel3 text-warn', active: true };
    case 'unhealthy':
      return { text: `sem resposta${port}`, className: 'bg-danger-soft text-danger', active: true };
    case 'running':
      return { text: 'rodando', className: 'bg-accent-soft text-accent', active: true };
    case 'restarting': {
      const sec = s.restartAt ? Math.max(0, Math.ceil((s.restartAt - now) / 1000)) : 0;
      return {
        text: `reiniciando em ${sec}s (${s.restarts}ª)`,
        className: 'bg-panel3 text-warn',
        active: true,
      };
    }
    default:
      return {
        text: s.lastExit ? `parado · ${s.lastExit}` : 'parado',
        className: 'bg-panel2 text-text2',
        active: false,
      };
  }
}

/** Parâmetros usados no comando que ainda não foram declarados (sugestão no editor). */
export function missingParams(command: string, declared: readonly { name: string }[]): string[] {
  const have = new Set(declared.map((p) => p.name.toLowerCase()));
  return extractPlaceholders(command).filter((n) => !have.has(n.toLowerCase()));
}

/** Valores iniciais do formulário de execução: o padrão de cada parâmetro (segredos sempre vazios). */
export function initialParamValues(params: readonly ActionParam[]): Record<string, string> {
  return Object.fromEntries(params.map((p) => [p.name, p.secret ? '' : (p.default ?? '')]));
}

/** Mesma regra do servidor: id, caminho, `owner/nome` do GitHub ou nome da pasta (se único). */
export function findRepo(repos: readonly Repo[], ref: string | undefined): Repo | undefined {
  if (!ref) return undefined;
  const lower = ref.trim().toLowerCase();
  const exact = repos.find((r) => r.id === ref || r.path === ref || r.github?.toLowerCase() === lower);
  if (exact) return exact;
  const byName = repos.filter((r) => r.name.toLowerCase() === lower);
  return byName.length === 1 ? byName[0] : undefined;
}

/** Nomes (minúsculos) dos parâmetros que o repositório preenche com variáveis salvas. */
export function repoProvided(params: readonly ActionParam[], repo: Repo | undefined): Set<string> {
  const vars = new Set((repo?.vars ?? []).filter((v) => v.hasValue).map((v) => v.name.toLowerCase()));
  return new Set(
    params.filter((p) => p.type !== 'repo' && vars.has(p.name.toLowerCase())).map((p) => p.name.toLowerCase()),
  );
}

/**
 * Ao escolher um repositório no formulário: preenche os parâmetros com as variáveis dele. Segredos ficam
 * vazios (o valor nunca vem para o navegador; o servidor completa). Os demais mantêm o valor atual.
 */
export function applyRepoVars(
  params: readonly ActionParam[],
  values: Readonly<Record<string, string>>,
  repo: Repo | undefined,
): Record<string, string> {
  const vars = new Map((repo?.vars ?? []).map((v) => [v.name.toLowerCase(), v]));
  const out = { ...values };
  for (const p of params) {
    if (p.type === 'repo') continue;
    const v = vars.get(p.name.toLowerCase());
    if (v) out[p.name] = v.secret ? '' : v.value;
    else out[p.name] = p.secret ? '' : (p.default ?? '');
  }
  return out;
}
