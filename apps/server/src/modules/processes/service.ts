import os from 'node:os';
import type { KillResult, KillSignal, OpenFile, ProcessDetail, ProcessInfo, ProcessList } from '@macpit/shared';
import type { Audit } from '../../lib/audit.js';
import { noopAudit } from '../../lib/audit.js';
import { run } from '../../lib/exec.js';
import { HttpError } from '../../lib/http.js';
import { PS_ARGS_FIELDS, PS_STATS_FIELDS, parseLsofFields, parsePs } from './parser.js';

const C_ENV = { ...process.env, LC_ALL: 'C', LANG: 'C' };

export interface ProcessDeps {
  psStats: () => Promise<string>;
  psArgs: () => Promise<string>;
  /** Saída de `lsof -F ftan` para um PID (vazia se não houver acesso). */
  lsof: (pid: number) => Promise<string>;
  kill: (pid: number, signal: NodeJS.Signals) => void;
  now: () => number;
  selfPid: number;
  selfUid: number;
}

export const defaultProcessDeps: ProcessDeps = {
  psStats: async () => (await run('/bin/ps', ['-axww', '-o', PS_STATS_FIELDS], { env: C_ENV })).stdout,
  psArgs: async () => (await run('/bin/ps', ['-axww', '-o', PS_ARGS_FIELDS], { env: C_ENV })).stdout,
  // lsof retorna 1 quando não encontra nada ou não tem permissão.
  lsof: async (pid) =>
    (await run('/usr/sbin/lsof', ['-nP', '-w', '-p', String(pid), '-F', 'ftan'], { okExitCodes: [0, 1], env: C_ENV }))
      .stdout,
  kill: (pid, signal) => process.kill(pid, signal),
  now: () => Date.now(),
  selfPid: process.pid,
  selfUid: process.getuid?.() ?? os.userInfo().uid,
};

/** PIDs que nunca podem ser sinalizados pela UI. */
export function protectedReason(pid: number, selfPid: number): string | undefined {
  if (pid <= 1) return 'processo do sistema (launchd/kernel)';
  if (pid === selfPid) return 'é o próprio servidor do macpit';
  return undefined;
}

export class ProcessService {
  private last: ProcessList | undefined;
  private inflight: Promise<ProcessList> | undefined;

  constructor(
    private readonly deps: ProcessDeps = defaultProcessDeps,
    private readonly audit: Audit = noopAudit,
  ) {}

  /** Coleta nova (coalescendo chamadas simultâneas). */
  list(): Promise<ProcessList> {
    this.inflight ??= (async () => {
      try {
        const [stats, args] = await Promise.all([this.deps.psStats(), this.deps.psArgs()]);
        const ts = this.deps.now();
        this.last = { ts, selfPid: this.deps.selfPid, processes: parsePs(stats, args, ts) };
        return this.last;
      } finally {
        this.inflight = undefined;
      }
    })();
    return this.inflight;
  }

  /** Último snapshot, se tiver no máximo `maxAgeMs`; senão coleta. */
  async snapshot(maxAgeMs: number): Promise<ProcessList> {
    if (this.last && this.deps.now() - this.last.ts <= maxAgeMs) return this.last;
    return this.list();
  }

  async openFiles(pid: number): Promise<OpenFile[]> {
    return parseLsofFields(await this.deps.lsof(pid));
  }

  async detail(pid: number, maxAgeMs: number): Promise<ProcessDetail> {
    let snap = await this.snapshot(maxAgeMs);
    let proc = snap.processes.find((p) => p.pid === pid);
    if (!proc && snap.ts !== this.deps.now()) {
      snap = await this.list(); // pode ter nascido depois do snapshot
      proc = snap.processes.find((p) => p.pid === pid);
    }
    if (!proc) throw new HttpError(404, `processo ${pid} não encontrado`, 'not_found');

    const files = await this.openFiles(pid);
    const detail: ProcessDetail = {
      process: proc,
      children: snap.processes.filter((p) => p.ppid === pid),
      files,
    };
    const parent = snap.processes.find((p) => p.pid === proc.ppid);
    if (parent) detail.parent = parent;
    if (files.length === 0) {
      detail.filesError =
        proc.uid !== this.deps.selfUid && this.deps.selfUid !== 0
          ? 'sem permissão para inspecionar processos de outro usuário (inicie o macpit como root para ver)'
          : 'nenhum arquivo visível';
    }
    return detail;
  }

  kill(pid: number, signal: KillSignal): KillResult {
    const reason = protectedReason(pid, this.deps.selfPid);
    if (reason) throw new HttpError(403, `PID ${pid} é protegido: ${reason}`, 'protected');
    const proc: ProcessInfo | undefined = this.last?.processes.find((p) => p.pid === pid);
    try {
      this.deps.kill(pid, `SIG${signal}` as NodeJS.Signals);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ESRCH') throw new HttpError(404, `processo ${pid} não existe mais`, 'not_found');
      if (code === 'EPERM') {
        throw new HttpError(403, `sem permissão para sinalizar o PID ${pid} (inicie o macpit como root)`, 'eperm');
      }
      throw err;
    }
    this.audit('kill', String(pid), { signal, name: proc?.name, command: proc?.command });
    return { ok: true, pid, signal };
  }
}
