import path from 'node:path';
import type { DiskUsageEntry } from '@macpit/shared';

export interface DfRow {
  filesystem: string;
  totalBytes: number;
  dfUsedBytes: number;
  availableBytes: number;
  mount: string;
}

const DF_RE = /^(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+\d+%\s+(\/.*)$/;

/** Converte `df -kP` (blocos de 1024). Suporta espaços no ponto de montagem e no filesystem. */
export function parseDf(text: string): DfRow[] {
  const rows: DfRow[] = [];
  for (const line of text.split('\n').slice(1)) {
    const m = DF_RE.exec(line.trim());
    if (!m) continue;
    rows.push({
      filesystem: m[1]!.trim(),
      totalBytes: Number(m[2]) * 1024,
      dfUsedBytes: Number(m[3]) * 1024,
      availableBytes: Number(m[4]) * 1024,
      mount: m[5]!.trim(),
    });
  }
  return rows;
}

const HIDDEN_MOUNT_PREFIXES = ['/System/Volumes/', '/Library/Developer/CoreSimulator/', '/private/var/'];
const HIDDEN_MOUNTS = new Set(['/dev', '/Volumes/Recovery']);

/**
 * Volumes relevantes para o usuário: `/`, discos em `/Volumes/*` e compartilhamentos de rede.
 * Esconde volumes internos do APFS (VM, Preboot, Data…), pseudo-filesystems e imagens de simulador.
 */
export function isUserVolume(row: DfRow): boolean {
  if (row.totalBytes <= 0) return false;
  if (row.filesystem === 'devfs' || row.filesystem.startsWith('map ')) return false;
  if (HIDDEN_MOUNTS.has(row.mount)) return false;
  return !HIDDEN_MOUNT_PREFIXES.some((p) => row.mount.startsWith(p));
}

export function volumeName(mount: string): string {
  return mount === '/' ? 'Disco do sistema' : path.basename(mount);
}

/** Converte `du -xk -d 1 <dir>`: a última linha com o próprio diretório é o total. */
export function parseDu(text: string, dir: string): { totalBytes: number; entries: DiskUsageEntry[] } {
  const normalized = dir.replace(/\/+$/, '') || '/';
  let totalBytes = 0;
  const entries: DiskUsageEntry[] = [];
  for (const line of text.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab <= 0) continue;
    const kb = Number(line.slice(0, tab));
    const p = line.slice(tab + 1);
    if (!Number.isFinite(kb) || !p) continue;
    if (p.replace(/\/+$/, '') === normalized || (normalized === '/' && p === '/')) {
      totalBytes = kb * 1024;
    } else {
      entries.push({ name: path.basename(p), path: p, sizeBytes: kb * 1024 });
    }
  }
  entries.sort((a, b) => b.sizeBytes - a.sizeBytes || a.name.localeCompare(b.name));
  if (totalBytes === 0) totalBytes = entries.reduce((s, e) => s + e.sizeBytes, 0);
  return { totalBytes, entries };
}
