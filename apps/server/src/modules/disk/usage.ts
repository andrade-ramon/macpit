import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DiskUsage } from '@macpit/shared';
import { ExecError, run } from '../../lib/exec.js';
import { HttpError } from '../../lib/http.js';
import { parseDu } from './parser.js';

export interface DuDeps {
  /** Saída de `du -xk -d 1 <dir>`; `partial` quando houve erros de permissão. */
  du: (dir: string) => Promise<{ stdout: string; partial: boolean }>;
  now: () => number;
  home: () => string;
}

export const DU_TIMEOUT_MS = 120_000;

export const defaultDuDeps: DuDeps = {
  du: async (dir) => {
    // -x: não atravessa para outros volumes; exit 1 = alguns itens sem permissão (saída ainda válida).
    const r = await run('/usr/bin/du', ['-xk', '-d', '1', dir], {
      timeoutMs: DU_TIMEOUT_MS,
      okExitCodes: [0, 1],
      env: { ...process.env, LC_ALL: 'C' },
    });
    return { stdout: r.stdout, partial: r.exitCode !== 0 };
  },
  now: () => Date.now(),
  home: () => os.homedir(),
};

export interface UsageOptions {
  cacheTtlMs: number;
  maxConcurrent: number;
}

/**
 * "Maiores pastas": roda `du` sob demanda, com cache por caminho (10 min), junta pedidos
 * simultâneos do mesmo caminho e limita quantos `du` rodam ao mesmo tempo.
 */
export class DiskUsageService {
  private readonly cache = new Map<string, DiskUsage>();
  private readonly inflight = new Map<string, Promise<DiskUsage>>();
  private readonly opts: UsageOptions;

  constructor(
    private readonly deps: DuDeps = defaultDuDeps,
    opts: Partial<UsageOptions> = {},
  ) {
    this.opts = { cacheTtlMs: 10 * 60_000, maxConcurrent: 2, ...opts };
  }

  /** `~` → home; exige caminho absoluto de um diretório existente; resolve symlinks. */
  async resolveDir(input: string): Promise<string> {
    const expanded = input === '~' || input.startsWith('~/') ? path.join(this.deps.home(), input.slice(1)) : input;
    if (!path.isAbsolute(expanded))
      throw new HttpError(400, 'use um caminho absoluto ou começando com ~', 'not_absolute');
    let real: string;
    try {
      real = await fs.promises.realpath(expanded);
    } catch {
      throw new HttpError(404, `caminho não encontrado: ${expanded}`, 'not_found');
    }
    const st = await fs.promises.stat(real);
    if (!st.isDirectory()) throw new HttpError(400, 'o caminho não é uma pasta', 'not_dir');
    return real;
  }

  async usage(input: string, refresh = false): Promise<DiskUsage> {
    const dir = await this.resolveDir(input);
    const cached = this.cache.get(dir);
    if (!refresh && cached && this.deps.now() - cached.computedAt < this.opts.cacheTtlMs) {
      return { ...cached, cached: true };
    }
    const pending = this.inflight.get(dir);
    if (pending) return pending;
    if (this.inflight.size >= this.opts.maxConcurrent) {
      throw new HttpError(429, 'já há análises de disco em andamento; aguarde terminarem', 'busy');
    }
    const job = this.compute(dir).finally(() => this.inflight.delete(dir));
    this.inflight.set(dir, job);
    return job;
  }

  private async compute(dir: string): Promise<DiskUsage> {
    const start = this.deps.now();
    let out: { stdout: string; partial: boolean };
    try {
      out = await this.deps.du(dir);
    } catch (err) {
      if (err instanceof ExecError && err.timedOut) {
        throw new HttpError(
          504,
          `a análise de ${dir} passou de ${DU_TIMEOUT_MS / 1000}s; tente uma subpasta`,
          'timeout',
        );
      }
      throw err;
    }
    const { totalBytes, entries } = parseDu(out.stdout, dir);
    const children = entries.reduce((s, e) => s + e.sizeBytes, 0);
    const result: DiskUsage = {
      path: dir,
      totalBytes,
      entries,
      looseBytes: Math.max(0, totalBytes - children),
      partial: out.partial,
      durationMs: this.deps.now() - start,
      computedAt: this.deps.now(),
      cached: false,
    };
    this.cache.set(dir, result);
    return result;
  }
}
