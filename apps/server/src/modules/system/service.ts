import os from 'node:os';
import type { SystemOverview, SystemSample } from '@macpit/shared';
import { SYSTEM_HISTORY_WINDOW_MS } from '@macpit/shared';
import { run } from '../../lib/exec.js';
import { computeMemory, cpuUsage, parseSwapUsage, parseVmStat, sumCpuTimes, type CpuTimes } from './parser.js';

/** Força saída numérica sem localização (ex.: `5120,00M` → `5120.00M`). */
const C_ENV = { timeoutMs: 5_000, env: { ...process.env, LC_ALL: 'C', LANG: 'C' } };

export interface SystemDeps {
  vmStat: () => Promise<string>;
  swapUsage: () => Promise<string>;
  cpus: () => ReturnType<typeof os.cpus>;
  totalMem: () => number;
  loadavg: () => number[];
  uptime: () => number;
  now: () => number;
}

export const defaultDeps: SystemDeps = {
  vmStat: async () => (await run('/usr/bin/vm_stat', [], C_ENV)).stdout,
  swapUsage: async () => (await run('/usr/sbin/sysctl', ['-n', 'vm.swapusage'], C_ENV)).stdout,
  cpus: () => os.cpus(),
  totalMem: () => os.totalmem(),
  loadavg: () => os.loadavg(),
  uptime: () => os.uptime(),
  now: () => Date.now(),
};

/**
 * Coleta métricas globais e mantém um histórico em memória (janela de 5 min).
 * O histórico só cresce enquanto houver coleta (canal `system` com inscritos).
 */
export class SystemService {
  private prevCpu: CpuTimes;
  private readonly history: SystemSample[] = [];
  private last: SystemSample | undefined;

  constructor(
    private readonly deps: SystemDeps = defaultDeps,
    private readonly windowMs = SYSTEM_HISTORY_WINDOW_MS,
  ) {
    this.prevCpu = sumCpuTimes(deps.cpus());
  }

  async sample(): Promise<SystemSample> {
    const [vmText, swapText] = await Promise.all([this.deps.vmStat(), this.deps.swapUsage()]);
    const cpus = this.deps.cpus();
    const currCpu = sumCpuTimes(cpus);
    const usage = cpuUsage(this.prevCpu, currCpu);
    this.prevCpu = currCpu;
    const [l1 = 0, l5 = 0, l15 = 0] = this.deps.loadavg();

    const sample: SystemSample = {
      ts: this.deps.now(),
      cpu: { ...usage, cores: cpus.length, model: cpus[0]?.model.trim() ?? 'desconhecido' },
      load: [round2(l1), round2(l5), round2(l15)],
      memory: computeMemory(parseVmStat(vmText), this.deps.totalMem()),
      swap: parseSwapUsage(swapText),
      uptimeSec: Math.round(this.deps.uptime()),
    };
    this.push(sample);
    return sample;
  }

  /** Visão atual + histórico. Coleta na hora se ainda não houver amostra recente. */
  async overview(maxAgeMs: number): Promise<SystemOverview> {
    const current = this.last && this.deps.now() - this.last.ts <= maxAgeMs ? this.last : await this.sample();
    return { current, history: [...this.history] };
  }

  private push(sample: SystemSample): void {
    this.last = sample;
    this.history.push(sample);
    const cutoff = sample.ts - this.windowMs;
    while (this.history.length > 0 && this.history[0]!.ts < cutoff) this.history.shift();
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
