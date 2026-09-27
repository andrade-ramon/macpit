/** Junta amostras por `ts` (sem duplicar), ordena e mantém só a janela mais recente. */
export function mergeHistory<T extends { ts: number }>(base: readonly T[], extra: readonly T[], windowMs: number): T[] {
  const byTs = new Map<number, T>();
  for (const s of base) byTs.set(s.ts, s);
  for (const s of extra) byTs.set(s.ts, s);
  const sorted = [...byTs.values()].sort((a, b) => a.ts - b.ts);
  const last = sorted.at(-1);
  if (!last) return sorted;
  const cutoff = last.ts - windowMs;
  return sorted.filter((s) => s.ts >= cutoff);
}
