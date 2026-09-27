import type { PortBinding, PortEntry } from '@macpit/shared';

export interface PortFilter {
  query: string;
  protocol: 'all' | 'TCP' | 'UDP';
  scope: 'all' | 'network' | 'local';
}

/** Número → porta começando com os dígitos (ex.: `54` acha 5432); texto → processo, comando ou usuário. */
export function filterPorts(entries: readonly PortEntry[], f: PortFilter): PortEntry[] {
  const q = f.query.trim().toLowerCase();
  return entries.filter((e) => {
    if (f.protocol !== 'all' && e.protocol !== f.protocol) return false;
    if (f.scope !== 'all' && e.scope !== f.scope) return false;
    if (!q) return true;
    if (/^\d+$/.test(q)) return String(e.port).startsWith(q) || String(e.pid) === q;
    return (
      e.command.toLowerCase().includes(q) ||
      e.user.toLowerCase().includes(q) ||
      (e.commandLine?.toLowerCase().includes(q) ?? false)
    );
  });
}

/** `*` (IPv4+IPv6) → `todas as interfaces`; demais endereços listados, IPv6 entre colchetes. */
export function describeBindings(bindings: readonly PortBinding[]): string {
  const labels = new Set<string>();
  for (const b of bindings) {
    if (b.address === '*' || b.address === '0.0.0.0' || b.address === '::') labels.add('todas as interfaces');
    else labels.add(b.family === 'IPv6' ? `[${b.address}]` : b.address);
  }
  return [...labels].join(', ');
}

/** URL para abrir no navegador (só TCP). */
export function portUrl(e: PortEntry): string | undefined {
  return e.protocol === 'TCP' ? `http://localhost:${e.port}` : undefined;
}
