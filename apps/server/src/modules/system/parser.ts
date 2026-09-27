import type { CpuSample, MemorySample, SwapSample } from '@macpit/shared';

export interface VmStat {
  pageSize: number;
  /** Chave normalizada (ex.: `pages free`, `anonymous pages`) → número de páginas. */
  pages: Record<string, number>;
}

/** Converte a saída de `vm_stat`. */
export function parseVmStat(text: string): VmStat {
  const pageSize = Number(/page size of (\d+) bytes/.exec(text)?.[1] ?? NaN);
  if (!Number.isFinite(pageSize)) throw new Error('vm_stat: page size não encontrado');
  const pages: Record<string, number> = {};
  for (const line of text.split('\n')) {
    const m = /^"?([^":]+)"?:\s+(\d+)\.?\s*$/.exec(line.trim());
    if (m) pages[m[1]!.trim().toLowerCase()] = Number(m[2]);
  }
  return { pageSize, pages };
}

/**
 * Memória no estilo do Monitor de Atividade:
 * app = anonymous - purgeable; usada = app + wired + ocupada pelo compressor; cache = file-backed + purgeable.
 */
export function computeMemory(vm: VmStat, totalBytes: number): MemorySample {
  const p = (key: string) => (vm.pages[key] ?? 0) * vm.pageSize;
  const appBytes = Math.max(0, p('anonymous pages') - p('pages purgeable'));
  const wiredBytes = p('pages wired down');
  const compressedBytes = p('pages occupied by compressor');
  const usedBytes = Math.min(totalBytes, appBytes + wiredBytes + compressedBytes);
  const cachedBytes = p('file-backed pages') + p('pages purgeable');
  return {
    totalBytes,
    usedBytes,
    appBytes,
    wiredBytes,
    compressedBytes,
    cachedBytes,
    freeBytes: Math.max(0, totalBytes - usedBytes),
    usedPct: totalBytes > 0 ? round((usedBytes / totalBytes) * 100) : 0,
  };
}

const UNITS: Record<string, number> = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };

function parseSize(value: string): number {
  const m = /^([\d.,]+)([KMGT])$/i.exec(value.trim());
  if (!m) return NaN;
  return Number(m[1]!.replace(',', '.')) * UNITS[m[2]!.toUpperCase()]!;
}

/** Converte `sysctl -n vm.swapusage` (ex.: `total = 2048.00M  used = 1024.00M  free = ...`). Aceita vírgula decimal. */
export function parseSwapUsage(text: string): SwapSample {
  const get = (key: string) => parseSize(new RegExp(`${key}\\s*=\\s*([\\d.,]+[KMGT])`, 'i').exec(text)?.[1] ?? '');
  const totalBytes = get('total');
  const usedBytes = get('used');
  if (!Number.isFinite(totalBytes) || !Number.isFinite(usedBytes)) throw new Error('vm.swapusage: formato inesperado');
  return { totalBytes, usedBytes };
}

export interface CpuTimes {
  user: number;
  nice: number;
  sys: number;
  idle: number;
  irq: number;
}

/** Soma os tempos de todos os núcleos (formato de `os.cpus()[i].times`). */
export function sumCpuTimes(cpus: ReadonlyArray<{ times: CpuTimes }>): CpuTimes {
  const acc: CpuTimes = { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 };
  for (const { times } of cpus) {
    acc.user += times.user;
    acc.nice += times.nice;
    acc.sys += times.sys;
    acc.idle += times.idle;
    acc.irq += times.irq;
  }
  return acc;
}

/** Uso de CPU entre duas leituras acumuladas. */
export function cpuUsage(prev: CpuTimes, curr: CpuTimes): Pick<CpuSample, 'usagePct' | 'userPct' | 'systemPct'> {
  const d = {
    user: curr.user - prev.user + (curr.nice - prev.nice),
    sys: curr.sys - prev.sys + (curr.irq - prev.irq),
    idle: curr.idle - prev.idle,
  };
  const total = d.user + d.sys + d.idle;
  if (total <= 0) return { usagePct: 0, userPct: 0, systemPct: 0 };
  const userPct = round((d.user / total) * 100);
  const systemPct = round((d.sys / total) * 100);
  return { usagePct: round(userPct + systemPct), userPct, systemPct };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
