import type { PortBinding, PortEntry } from '@macpit/shared';

/** Campos pedidos ao `lsof -F`: pid, comando, uid, login, fd, tipo, protocolo, nome, estado TCP. */
export const LSOF_PORT_FIELDS = 'pcuLftPnT';

/** `*:80` → `{address:'*', port:80}`; `[::1]:5432` → `{address:'::1', port:5432}`. Sem porta (`*:*`) → undefined. */
export function splitHostPort(name: string): { address: string; port: number } | undefined {
  const m = /^(?:\[([^\]]+)\]|([^:\s]+|\*)):(\d+)$/.exec(name.trim());
  if (!m) return undefined;
  return { address: m[1] ?? m[2]!, port: Number(m[3]) };
}

export function isLoopback(address: string): boolean {
  const a = address.toLowerCase();
  return a.startsWith('127.') || a === '::1' || a === 'localhost' || a.endsWith('%lo0');
}

interface RawSocket {
  pid: number;
  command: string;
  uid: number;
  user: string;
  protocol: 'TCP' | 'UDP';
  family: 'IPv4' | 'IPv6';
  name: string;
  state?: string;
}

/** Lê a saída de `lsof -F pcuLftPnT` em sockets brutos. */
export function parseLsofSockets(text: string): RawSocket[] {
  const out: RawSocket[] = [];
  let proc = { pid: 0, command: '', uid: -1, user: '' };
  let cur: Partial<RawSocket> | undefined;
  const flush = () => {
    if (cur?.name && cur.protocol && cur.family) out.push({ ...proc, ...cur } as RawSocket);
    cur = undefined;
  };
  for (const line of text.split('\n')) {
    if (!line) continue;
    const tag = line[0];
    const v = line.slice(1);
    switch (tag) {
      case 'p':
        flush();
        proc = { pid: Number(v), command: '', uid: -1, user: '' };
        break;
      case 'c':
        proc.command = v;
        break;
      case 'u':
        proc.uid = Number(v);
        break;
      case 'L':
        proc.user = v;
        break;
      case 'f':
        flush();
        cur = {};
        break;
      case 't':
        if (cur && (v === 'IPv4' || v === 'IPv6')) cur.family = v;
        break;
      case 'P':
        if (cur && (v === 'TCP' || v === 'UDP')) cur.protocol = v;
        break;
      case 'n':
        if (cur) cur.name = v;
        break;
      case 'T':
        if (cur && v.startsWith('ST=')) cur.state = v.slice(3);
        break;
    }
  }
  flush();
  return out;
}

/**
 * Portas em escuta: TCP em LISTEN e UDP ligado a uma porta sem destino (`*:*` e `a->b` são ignorados).
 * Agrupa por protocolo + porta + PID, juntando os endereços IPv4/IPv6.
 */
export function toPortEntries(sockets: RawSocket[]): PortEntry[] {
  const groups = new Map<string, PortEntry>();
  for (const s of sockets) {
    if (s.protocol === 'TCP' && s.state !== 'LISTEN') continue;
    if (s.name.includes('->')) continue;
    const hp = splitHostPort(s.name);
    if (!hp) continue;
    const key = `${s.protocol}|${hp.port}|${s.pid}`;
    let entry = groups.get(key);
    if (!entry) {
      entry = {
        protocol: s.protocol,
        port: hp.port,
        pid: s.pid,
        command: s.command,
        user: s.user || String(s.uid),
        uid: s.uid,
        bindings: [],
        scope: 'local',
      };
      groups.set(key, entry);
    }
    const binding: PortBinding = { address: hp.address, family: s.family };
    if (!entry.bindings.some((b) => b.address === binding.address && b.family === binding.family)) {
      entry.bindings.push(binding);
    }
    if (!isLoopback(hp.address)) entry.scope = 'network';
  }
  return [...groups.values()].sort((a, b) => a.port - b.port || a.protocol.localeCompare(b.protocol) || a.pid - b.pid);
}
