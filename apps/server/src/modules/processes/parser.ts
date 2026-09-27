import path from 'node:path';
import type { OpenFile, OpenFileKind, ProcessInfo } from '@macpit/shared';

/** Campos do 1º `ps` (o `comm` vai por último porque pode conter espaços). */
export const PS_STATS_FIELDS = 'pid=,ppid=,uid=,user=,%cpu=,%mem=,rss=,vsz=,state=,etime=,comm=';
/** 2º `ps`: `args` também pode conter espaços, por isso é uma chamada separada. */
export const PS_ARGS_FIELDS = 'pid=,args=';

const num = (s: string) => Number(s.replace(',', '.'));

/** `[[dd-]hh:]mm:ss` → segundos. */
export function parseEtime(etime: string): number {
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(etime.trim());
  if (!m) return 0;
  const [, d = '0', h = '0', min = '0', s = '0'] = m;
  return Number(d) * 86400 + Number(h) * 3600 + Number(min) * 60 + Number(s);
}

const STATS_RE = /^\s*(\d+)\s+(\d+)\s+(-?\d+)\s+(\S+)\s+([\d.,]+)\s+([\d.,]+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.*)$/;

export function parsePsArgs(text: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const line of text.split('\n')) {
    const m = /^\s*(\d+)\s(.*)$/.exec(line);
    if (m) map.set(Number(m[1]), m[2]!.trim());
  }
  return map;
}

/** Junta as duas saídas do `ps` em `ProcessInfo[]`. `now` serve para calcular `startedAt`. */
export function parsePs(statsText: string, argsText: string, now: number): ProcessInfo[] {
  const args = parsePsArgs(argsText);
  const out: ProcessInfo[] = [];
  for (const line of statsText.split('\n')) {
    const m = STATS_RE.exec(line);
    if (!m) continue;
    const pid = Number(m[1]);
    const comm = m[11]!.trim();
    const elapsedSec = parseEtime(m[10]!);
    out.push({
      pid,
      ppid: Number(m[2]),
      uid: Number(m[3]),
      user: m[4]!,
      cpuPct: num(m[5]!),
      memPct: num(m[6]!),
      rssBytes: Number(m[7]) * 1024,
      vszBytes: Number(m[8]) * 1024,
      state: m[9]!,
      elapsedSec,
      startedAt: now - elapsedSec * 1000,
      name: processName(comm),
      path: comm,
      command: args.get(pid) ?? comm,
    });
  }
  return out;
}

/** `/a/b/Google Chrome` → `Google Chrome`; `-zsh` → `zsh`; `(git)` → `git`. */
export function processName(comm: string): string {
  const base = comm.includes('/') ? path.basename(comm) : comm;
  return base.replace(/^-/, '').replace(/^\((.*)\)$/, '$1') || comm;
}

const LOG_EXT = /\.(log|out|err|txt)$/i;
const LOG_DIR = /\/(logs?|var\/log)\//i;

function classify(fd: string, type: string): OpenFileKind {
  if (fd === 'cwd') return 'cwd';
  if (type === 'IPv4' || type === 'IPv6') return 'network';
  if (type === 'REG' && fd === '1') return 'stdout';
  if (type === 'REG' && fd === '2') return 'stderr';
  if (type === 'REG') return 'file';
  return 'other';
}

/** Converte `lsof -F ftan` (uma linha por campo, prefixada pelo identificador). */
export function parseLsofFields(text: string): OpenFile[] {
  const files: OpenFile[] = [];
  let cur: { fd?: string; type?: string; access?: string; name?: string } = {};
  const flush = () => {
    if (cur.fd === undefined || cur.name === undefined) return;
    const type = cur.type ?? '';
    const kind = classify(cur.fd, type);
    const isReg = type === 'REG';
    const writable = cur.access === 'w' || cur.access === 'u';
    files.push({
      fd: cur.fd,
      type,
      ...(cur.access ? { access: cur.access } : {}),
      name: cur.name,
      kind,
      tailable: isReg,
      looksLikeLog:
        kind === 'stdout' ||
        kind === 'stderr' ||
        (isReg && writable && (LOG_EXT.test(cur.name) || LOG_DIR.test(cur.name))),
    });
  };
  for (const line of text.split('\n')) {
    if (!line) continue;
    const tag = line[0];
    const value = line.slice(1);
    if (tag === 'p') continue;
    if (tag === 'f') {
      flush();
      cur = { fd: value };
    } else if (tag === 'a') {
      const a = value.trim();
      if (a) cur.access = a;
    } else if (tag === 't') cur.type = value;
    else if (tag === 'n') cur.name = value;
  }
  flush();
  return files;
}
