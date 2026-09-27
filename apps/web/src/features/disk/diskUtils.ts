export type UsageLevel = 'ok' | 'warn' | 'alert';

/** `alert` a partir do limite; `warn` nos 10 pontos antes dele. */
export function usageLevel(pct: number, alertPct: number): UsageLevel {
  if (pct >= alertPct) return 'alert';
  if (pct >= alertPct - 10) return 'warn';
  return 'ok';
}

export const LEVEL_BAR: Record<UsageLevel, string> = {
  ok: 'bg-accent',
  warn: 'bg-warn',
  alert: 'bg-danger',
};

export const LEVEL_TEXT: Record<UsageLevel, string> = {
  ok: 'text-accent',
  warn: 'text-warn',
  alert: 'text-danger',
};

/** `/Users/a/b` → `[{/}, {Users}, {a}, {b}]` com o caminho acumulado. */
export function breadcrumbs(p: string): Array<{ label: string; path: string }> {
  const parts = p.split('/').filter(Boolean);
  const crumbs = [{ label: '/', path: '/' }];
  let acc = '';
  for (const part of parts) {
    acc += `/${part}`;
    crumbs.push({ label: part, path: acc });
  }
  return crumbs;
}

export function parentPath(p: string): string | undefined {
  if (p === '/' || !p.startsWith('/')) return undefined;
  const idx = p.replace(/\/+$/, '').lastIndexOf('/');
  return idx <= 0 ? '/' : p.slice(0, idx);
}
