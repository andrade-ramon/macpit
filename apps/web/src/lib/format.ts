const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** Bytes em base 1024 (como o macOS mostra memória). */
export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const i = Math.min(UNITS.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : digits)} ${UNITS[i]}`;
}

export function formatPct(pct: number): string {
  return `${pct.toFixed(pct >= 10 ? 0 : 1)}%`;
}

/** Duração legível: `3d 4h`, `2h 5m`, `4m 10s`. */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

/* Formatos do design (pt-BR: vírgula decimal). */

/** `23,4` — número com `digits` casas, no formato brasileiro. */
export function fmtNum(v: number, digits = 1): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** `21,4 GB` · `412 MB` · `96 KB` (GB com até `digits` casas; MB e KB inteiros). */
export function fmtBytes(b: number, digits = 1): string {
  if (!Number.isFinite(b) || b <= 0) return '0 KB';
  if (b >= 1024 ** 4) return `${(b / 1024 ** 4).toLocaleString('pt-BR', { maximumFractionDigits: digits })} TB`;
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toLocaleString('pt-BR', { maximumFractionDigits: digits })} GB`;
  if (b >= 1024 ** 2) return `${Math.round(b / 1024 ** 2).toLocaleString('pt-BR')} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
}

/** `10d 4h` · `1h 30min` · `5min` · `12s`. */
export function fmtDur(totalSec: number): string {
  const s = Math.max(0, totalSec);
  if (s >= 86400) return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}min`;
  if (s >= 60) return `${Math.floor(s / 60)}min`;
  return `${Math.round(s)}s`;
}

/** `27/09/2026 14:31`. */
export function fmtShort(ts: number): string {
  return new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** `10 dias` · `3 h` — "ligado há". */
export function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  if (d >= 1) return `${d} ${d === 1 ? 'dia' : 'dias'}`;
  const h = Math.floor(sec / 3600);
  if (h >= 1) return `${h} h`;
  return `${Math.max(1, Math.floor(sec / 60))} min`;
}
