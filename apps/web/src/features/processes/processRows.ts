import type { ProcessInfo } from '@macpit/shared';

export type SortKey = 'pid' | 'name' | 'user' | 'cpuPct' | 'rssBytes' | 'elapsedSec';
export type SortDir = 'asc' | 'desc';

export interface RowOptions {
  query: string;
  /** `''` = todos. */
  user: string;
  sortKey: SortKey;
  sortDir: SortDir;
}

export interface Row {
  p: ProcessInfo;
  depth: number;
  /** Na árvore: aparece só como ancestral de um resultado da busca. */
  dimmed?: boolean;
}

export function matchesQuery(p: ProcessInfo, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (/^\d+$/.test(q) && String(p.pid) === q) return true;
  return p.name.toLowerCase().includes(q) || p.command.toLowerCase().includes(q) || p.user.toLowerCase() === q;
}

export function comparator(key: SortKey, dir: SortDir): (a: ProcessInfo, b: ProcessInfo) => number {
  const sign = dir === 'asc' ? 1 : -1;
  return (a, b) => {
    const va = a[key];
    const vb = b[key];
    const c =
      typeof va === 'string' ? va.localeCompare(vb as string, 'pt-BR', { sensitivity: 'base' }) : va - (vb as number);
    return c !== 0 ? c * sign : a.pid - b.pid;
  };
}

const keep = (p: ProcessInfo, o: RowOptions) => (!o.user || p.user === o.user) && matchesQuery(p, o.query);

/** Lista plana filtrada e ordenada. */
export function flatRows(list: readonly ProcessInfo[], o: RowOptions): Row[] {
  return list
    .filter((p) => keep(p, o))
    .sort(comparator(o.sortKey, o.sortDir))
    .map((p) => ({ p, depth: 0 }));
}

/**
 * Árvore pai → filhos (a ordenação vale entre irmãos). Com filtro ativo, mostra os resultados
 * e seus ancestrais (esmaecidos) para manter o contexto.
 */
export function treeRows(list: readonly ProcessInfo[], o: RowOptions): Row[] {
  const byPid = new Map(list.map((p) => [p.pid, p]));
  const filtering = Boolean(o.user || o.query.trim());
  const matched = new Set<number>();
  const visible = new Set<number>();
  for (const p of list) {
    if (!keep(p, o)) continue;
    matched.add(p.pid);
    let cur: ProcessInfo | undefined = p;
    const seen = new Set<number>();
    while (cur && !visible.has(cur.pid) && !seen.has(cur.pid)) {
      seen.add(cur.pid);
      visible.add(cur.pid);
      cur = cur.ppid !== cur.pid ? byPid.get(cur.ppid) : undefined;
    }
  }
  const included = (p: ProcessInfo) => !filtering || visible.has(p.pid);

  const children = new Map<number, ProcessInfo[]>();
  const roots: ProcessInfo[] = [];
  for (const p of list) {
    if (!included(p)) continue;
    const parent = p.ppid !== p.pid ? byPid.get(p.ppid) : undefined;
    if (parent && included(parent)) {
      const arr = children.get(parent.pid) ?? [];
      arr.push(p);
      children.set(parent.pid, arr);
    } else roots.push(p);
  }

  const cmp = comparator(o.sortKey, o.sortDir);
  const rows: Row[] = [];
  const done = new Set<number>();
  const stack: Row[] = roots
    .sort(cmp)
    .reverse()
    .map((p) => ({ p, depth: 0 }));
  while (stack.length) {
    const row = stack.pop()!;
    if (done.has(row.p.pid)) continue;
    done.add(row.p.pid);
    rows.push(filtering && !matched.has(row.p.pid) ? { ...row, dimmed: true } : row);
    const kids = (children.get(row.p.pid) ?? []).sort(cmp);
    for (let i = kids.length - 1; i >= 0; i--) stack.push({ p: kids[i]!, depth: row.depth + 1 });
  }
  return rows;
}

const STATES: Record<string, string> = {
  R: 'executando',
  S: 'dormindo',
  I: 'ocioso',
  T: 'parado',
  U: 'aguardando E/S',
  Z: 'zumbi',
};

/** `Ss+` → `dormindo`. */
export function stateLabel(state: string): string {
  return STATES[state[0] ?? ''] ?? state;
}
