import type { PortList } from '@macpit/shared';
import { run } from '../../lib/exec.js';
import type { ProcessService } from '../processes/service.js';
import { LSOF_PORT_FIELDS, parseLsofSockets, toPortEntries } from './parser.js';

export interface PortDeps {
  /** Saída de `lsof -F` com os sockets TCP em LISTEN e UDP. */
  lsof: () => Promise<string>;
  now: () => number;
  isRoot: () => boolean;
}

export const defaultPortDeps: PortDeps = {
  // `+c 0` = nome completo do comando; lsof retorna 1 quando não há nada.
  lsof: async () =>
    (
      await run('/usr/sbin/lsof', ['-nP', '-w', '+c', '0', '-iTCP', '-sTCP:LISTEN', '-iUDP', '-F', LSOF_PORT_FIELDS], {
        okExitCodes: [0, 1],
        env: { ...process.env, LC_ALL: 'C' },
      })
    ).stdout,
  now: () => Date.now(),
  isRoot: () => process.getuid?.() === 0,
};

export class PortService {
  constructor(
    private readonly processes: ProcessService,
    private readonly maxProcessAgeMs: number,
    private readonly deps: PortDeps = defaultPortDeps,
  ) {}

  async list(): Promise<PortList> {
    const [text, procs] = await Promise.all([
      this.deps.lsof(),
      this.processes.snapshot(this.maxProcessAgeMs).catch(() => undefined),
    ]);
    const byPid = new Map(procs?.processes.map((p) => [p.pid, p.command]));
    const entries = toPortEntries(parseLsofSockets(text)).map((e) => {
      const commandLine = byPid.get(e.pid);
      return commandLine ? { ...e, commandLine } : e;
    });
    return { ts: this.deps.now(), entries, limited: !this.deps.isRoot() };
  }
}
