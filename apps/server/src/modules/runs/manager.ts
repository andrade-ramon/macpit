import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Action, Run, RunEvent, RunStart, RunStatus } from '@macpit/shared';
import { renderCommand, TemplateError } from '@macpit/shared';
import type { Audit } from '../../lib/audit.js';
import { noopAudit } from '../../lib/audit.js';
import { HttpError } from '../../lib/http.js';
import type { ChannelProducer } from '../../ws/hub.js';
import { newId } from '../actions/store.js';
import { publicRun, type RunStore, type StoredRun } from './store.js';

/** O mínimo do node-pty que usamos (facilita testes com um pty falso). */
export interface PtyLike {
  readonly pid: number;
  onData(cb: (data: string) => void): unknown;
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): unknown;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

export interface SpawnOptions {
  cols: number;
  rows: number;
  cwd: string;
  env: Record<string, string>;
}

export interface RunDeps {
  spawn: (file: string, args: string[], opts: SpawnOptions) => PtyLike;
  /** Sinaliza o grupo de processos (o pty é líder de sessão: pgid = pid). */
  killGroup: (pid: number, signal: NodeJS.Signals) => void;
  /** Ainda há processo vivo no grupo? (usado no desligamento e na recuperação após queda) */
  isAlive: (pid: number) => boolean;
  now: () => number;
  home: () => string;
}

export async function loadPtySpawn(): Promise<RunDeps['spawn']> {
  const pty = await import('node-pty');
  return (file, args, opts) => pty.spawn(file, args, { name: 'xterm-256color', ...opts });
}

/**
 * Sinaliza só o **grupo** (o pty é líder de sessão: pgid = pid). Se o grupo não existe mais (ESRCH),
 * não tenta o pid sozinho: ele pode ter sido reutilizado por outro processo.
 */
export const defaultKillGroup: RunDeps['killGroup'] = (pid, signal) => {
  try {
    process.kill(-pid, signal);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err;
  }
};

/** `true` se ainda existe algum processo no grupo `pid`. */
export function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Ajusta valores, diretório e ambiente de uma execução (ex.: parâmetro do tipo repositório). */
export type PrepareRun = (
  action: Action,
  values: Readonly<Record<string, string>>,
) => { values: Record<string, string>; cwd?: string; env: Record<string, string>; repo?: string };

export interface RunOptions {
  shell: string;
  logsDir: string;
  /** Buffer em memória reenviado a quem abre o terminal no meio da execução. */
  bufferBytes: number;
  /** Tempo entre SIGTERM e SIGKILL ao parar. */
  killGraceMs: number;
  /** Tamanho máximo do arquivo de log por execução. */
  maxLogBytes: number;
  /** Execuções mantidas por ação (as mais antigas e seus logs são apagados). */
  keepRuns: number;
  /** Agrupa a saída do pty antes de mandar pelo WebSocket. */
  flushMs: number;
  /** Máximo de execuções simultâneas (todas as ações). */
  maxConcurrent: number;
}

const SIGNAL_NAMES = new Map(Object.entries(os.constants.signals).map(([name, n]) => [n, name]));

interface LiveRun {
  run: StoredRun;
  pty: PtyLike;
  buffer: string;
  truncated: boolean;
  log: fs.WriteStream;
  logBytes: number;
  logCapped: boolean;
  stopRequested: boolean;
  killTimer?: NodeJS.Timeout;
  listeners: Set<(e: RunEvent) => void>;
  pending: string;
  flushTimer?: NodeJS.Timeout;
}

/**
 * Executa ações num pseudo-terminal (`MACPIT_SHELL -lc "<comando>"`) — o ÚNICO lugar do sistema onde
 * um comando passa por shell (AGENTS.md, regra 3). Guarda buffer para replay, grava log em disco,
 * permite input/resize e para com SIGTERM → SIGKILL no grupo de processos.
 */
export class RunManager {
  private readonly live = new Map<string, LiveRun>();
  private readonly opts: RunOptions;

  constructor(
    private readonly store: RunStore,
    private readonly deps: RunDeps,
    opts: Partial<RunOptions> & Pick<RunOptions, 'shell' | 'logsDir'>,
    private readonly audit: Audit = noopAudit,
  ) {
    this.opts = {
      bufferBytes: 256 * 1024,
      killGraceMs: 5_000,
      maxLogBytes: 20 * 1024 * 1024,
      keepRuns: 50,
      flushMs: 10,
      maxConcurrent: 20,
      ...opts,
    };
    fs.mkdirSync(this.opts.logsDir, { recursive: true, mode: 0o700 });
  }

  private closed = false;
  private prepare: PrepareRun = (_action, values) => ({ values: { ...values }, env: {} });
  private readonly finishListeners = new Set<(run: Run) => void>();

  /** Resolve parâmetros especiais (ex.: repositório) antes de montar o comando. */
  setPrepare(fn: PrepareRun): void {
    this.prepare = fn;
  }

  /** Avisado quando uma execução termina (não é chamado no desligamento do servidor). */
  onFinish(listener: (run: Run) => void): () => void {
    this.finishListeners.add(listener);
    return () => this.finishListeners.delete(listener);
  }

  /** No boot: execuções `running` de uma instância anterior viram `interrupted`. Retorna quantas. */
  recoverInterrupted(): { count: number; survivors: Array<{ runId: string; pid: number; actionName: string }> } {
    // Após uma queda (kill -9, crash), os processos podem continuar vivos. Não matamos automaticamente
    // (o pid pode ter sido reutilizado); só reportamos para o usuário decidir pela página de Processos.
    const survivors = this.store
      .listRunning()
      .filter((r) => r.pid !== null && this.deps.isAlive(r.pid))
      .map((r) => ({ runId: r.id, pid: r.pid!, actionName: r.actionName }));
    return { count: this.store.markInterrupted(this.deps.now()), survivors };
  }

  resolveCwd(cwd: string | undefined): string {
    const raw = cwd?.trim() || '~';
    const expanded = raw === '~' || raw.startsWith('~/') ? path.join(this.deps.home(), raw.slice(1)) : raw;
    if (!path.isAbsolute(expanded))
      throw new HttpError(400, `diretório deve ser absoluto ou começar com ~: ${raw}`, 'bad_cwd');
    let st: fs.Stats;
    try {
      st = fs.statSync(expanded);
    } catch {
      throw new HttpError(400, `diretório não existe: ${expanded}`, 'bad_cwd');
    }
    if (!st.isDirectory()) throw new HttpError(400, `não é um diretório: ${expanded}`, 'bad_cwd');
    return expanded;
  }

  projectFor(action: Action, params: Record<string, string>): string | null {
    return this.prepare(action, params).repo ?? null;
  }

  start(action: Action, size: Pick<RunStart, 'cols' | 'rows'> & { params?: Record<string, string> }): Run {
    if (this.closed) throw new HttpError(503, 'servidor desligando', 'shutting_down');
    if (this.live.size >= this.opts.maxConcurrent) {
      throw new HttpError(429, `limite de ${this.opts.maxConcurrent} execuções simultâneas atingido`, 'too_many_runs');
    }
    const prepared = this.prepare(action, size.params ?? {});
    const cwd = this.resolveCwd(prepared.cwd ?? action.cwd);
    // {{parâmetros}} → "${MACPIT_PARAM_X}" no comando + valores no ambiente (nunca colados no texto).
    let rendered: ReturnType<typeof renderCommand>;
    try {
      rendered = renderCommand(action.command, action.params ?? [], prepared.values);
    } catch (err) {
      if (err instanceof TemplateError) throw new HttpError(400, err.message, 'bad_params');
      throw err;
    }
    const id = newId();
    const logPath = path.join(this.opts.logsDir, `${id}.log`);
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
    Object.assign(env, action.env, prepared.env, rendered.env, {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      MACPIT_RUN_ID: id,
      MACPIT_ACTION_ID: action.id,
      // nomes da época do bash-monitor, para ações antigas continuarem funcionando
      BM_RUN_ID: id,
      BM_ACTION_ID: action.id,
    });

    const pty = this.deps.spawn(this.opts.shell, ['-lc', rendered.command], {
      cols: size.cols,
      rows: size.rows,
      cwd,
      env,
    });
    const run: StoredRun = {
      id,
      actionId: action.id,
      actionName: action.name,
      command: action.command,
      cwd,
      pid: pty.pid,
      repoPath: prepared.repo ?? null,
      status: 'running',
      exitCode: null,
      signal: null,
      startedAt: this.deps.now(),
      endedAt: null,
      logBytes: 0,
      logPath,
    };
    this.store.insert(run);
    const live: LiveRun = {
      run,
      pty,
      buffer: '',
      truncated: false,
      log: fs.createWriteStream(logPath, { flags: 'a', mode: 0o600 }),
      logBytes: 0,
      logCapped: false,
      stopRequested: false,
      listeners: new Set(),
      pending: '',
    };
    // Disco cheio / pasta removida: para de gravar em vez de derrubar o processo (erro sem listener = crash).
    live.log.on('error', () => {
      live.logCapped = true;
    });
    this.live.set(id, live);
    this.audit('run', action.name, {
      runId: id,
      actionId: action.id,
      command: action.command,
      cwd,
      ...(prepared.repo ? { repo: prepared.repo } : {}),
    });

    pty.onData((data) => this.onData(live, data));
    pty.onExit(({ exitCode, signal }) => this.onExit(live, exitCode, signal));
    return publicRun(run);
  }

  private onData(live: LiveRun, data: string): void {
    live.buffer += data;
    if (live.buffer.length > this.opts.bufferBytes) {
      live.buffer = live.buffer.slice(live.buffer.length - this.opts.bufferBytes);
      live.truncated = true;
    }
    if (!live.logCapped) {
      const bytes = Buffer.byteLength(data);
      if (live.logBytes + bytes > this.opts.maxLogBytes) {
        live.logCapped = true;
        live.log.write(`\r\n[macpit] log atingiu ${this.opts.maxLogBytes} bytes; o restante não foi gravado\r\n`);
      } else {
        live.log.write(data);
        live.logBytes += bytes;
      }
    }
    live.pending += data;
    live.flushTimer ??= setTimeout(() => this.flush(live), this.opts.flushMs);
  }

  private flush(live: LiveRun): void {
    clearTimeout(live.flushTimer);
    live.flushTimer = undefined;
    if (!live.pending) return;
    const data = live.pending;
    live.pending = '';
    for (const l of live.listeners) l({ kind: 'output', data });
  }

  private onExit(live: LiveRun, exitCode: number, signalNum: number | undefined): void {
    this.flush(live);
    clearTimeout(live.killTimer);
    if (this.closed) {
      // shutdown já gravou o status; o banco pode estar fechado
      live.log.end();
      return;
    }
    const signal = signalNum ? (SIGNAL_NAMES.get(signalNum) ?? String(signalNum)) : null;
    const status: RunStatus = live.stopRequested ? 'killed' : exitCode === 0 && !signal ? 'exited' : 'failed';
    const endedAt = this.deps.now();
    Object.assign(live.run, { status, exitCode, signal, endedAt, logBytes: live.logBytes });
    this.store.finish(live.run.id, { status, exitCode, signal, endedAt, logBytes: live.logBytes });
    live.log.end();
    this.live.delete(live.run.id);
    const run = publicRun(live.run);
    for (const l of live.listeners) l({ kind: 'status', run });
    for (const l of this.finishListeners) {
      try {
        l(run);
      } catch {
        /* um ouvinte com erro não pode impedir os demais */
      }
    }
    live.listeners.clear();
    if (live.run.actionId) {
      for (const file of this.store.prune(live.run.actionId, this.opts.keepRuns))
        fs.rm(file, { force: true }, () => {});
    }
  }

  get(id: string): Run {
    const live = this.live.get(id);
    if (live) return publicRun(live.run);
    const stored = this.store.get(id);
    if (!stored) throw new HttpError(404, `execução ${id} não encontrada`, 'not_found');
    return publicRun(stored);
  }

  isRunning(id: string): boolean {
    return this.live.has(id);
  }

  /** SIGTERM no grupo de processos; SIGKILL se não terminar em `killGraceMs`. */
  stop(id: string): Run {
    const live = this.live.get(id);
    if (!live) {
      const run = this.get(id);
      throw new HttpError(409, `a execução já terminou (${run.status})`, 'not_running');
    }
    if (!live.stopRequested) {
      live.stopRequested = true;
      this.audit('stop', live.run.actionName, { runId: id, pid: live.pty.pid });
      this.deps.killGroup(live.pty.pid, 'SIGTERM');
      live.killTimer = setTimeout(() => {
        if (this.live.has(id)) this.deps.killGroup(live.pty.pid, 'SIGKILL');
      }, this.opts.killGraceMs);
      live.killTimer.unref();
    }
    return publicRun(live.run);
  }

  /** Retorna uma mensagem de erro (para o WS) ou nada. */
  input(id: string, data: string): string | void {
    const live = this.live.get(id);
    if (!live) return 'a execução não está rodando';
    live.pty.write(data);
  }

  resize(id: string, cols: number, rows: number): string | void {
    const live = this.live.get(id);
    if (!live) return;
    live.pty.resize(cols, rows);
  }

  /** Log completo gravado em disco. */
  logFile(id: string): string {
    const stored = this.store.get(id);
    if (!stored) throw new HttpError(404, `execução ${id} não encontrada`, 'not_found');
    return stored.logPath;
  }

  private replay(id: string): RunEvent {
    const live = this.live.get(id);
    if (live) {
      // O lote pendente ainda vai sair por broadcast para todos os inscritos: fica fora do replay
      // (senão quem assina nesse intervalo recebe o mesmo trecho duas vezes).
      const data =
        live.pending && live.buffer.endsWith(live.pending) ? live.buffer.slice(0, -live.pending.length) : live.buffer;
      return { kind: 'replay', data, run: publicRun(live.run), truncated: live.truncated };
    }
    // Pode ter sido apagada (retenção) enquanto o canal seguia aberto.
    const stored = this.store.get(id);
    if (!stored) return { kind: 'gone' };
    let data: string;
    let truncated = false;
    try {
      const size = fs.statSync(stored.logPath).size;
      const start = Math.max(0, size - this.opts.bufferBytes);
      truncated = start > 0;
      const fd = fs.openSync(stored.logPath, 'r');
      try {
        const buf = Buffer.alloc(size - start);
        fs.readSync(fd, buf, 0, buf.length, start);
        data = buf.toString('utf8');
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      data = '\r\n[macpit] log indisponível\r\n';
    }
    return { kind: 'replay', data, run: publicRun(stored), truncated };
  }

  /** Canal `run:<id>`: replay para cada inscrito + saída/status ao vivo. */
  resolver = (name: string): ChannelProducer | undefined => {
    if (!name.startsWith('run:')) return undefined;
    const id = name.slice(4);
    if (!this.live.has(id) && !this.store.get(id)) return undefined;
    return {
      initial: () => this.replay(id),
      start: (emit) => {
        const live = this.live.get(id);
        if (!live) return () => {};
        const listener = (e: RunEvent) => emit(e);
        live.listeners.add(listener);
        return () => live.listeners.delete(listener);
      },
    };
  };

  /** Desligamento do servidor: grava `killed` e manda SIGTERM em tudo que está rodando. */
  /**
   * Desligamento do servidor: grava `killed`, manda SIGTERM em tudo e, após `killGraceMs`,
   * SIGKILL nos grupos que ainda estiverem vivos (ex.: `trap '' TERM`).
   */
  async shutdown(): Promise<void> {
    const pids = this.markAllKilled();
    const deadline = this.deps.now() + this.opts.killGraceMs;
    let alive = pids.filter((p) => this.deps.isAlive(p));
    while (alive.length > 0 && this.deps.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
      alive = alive.filter((p) => this.deps.isAlive(p));
    }
    for (const pid of alive) {
      try {
        this.deps.killGroup(pid, 'SIGKILL');
      } catch {
        /* ignora */
      }
    }
  }

  private markAllKilled(): number[] {
    this.closed = true;
    const endedAt = this.deps.now();
    const pids: number[] = [];
    for (const live of this.live.values()) {
      pids.push(live.pty.pid);
      live.stopRequested = true;
      clearTimeout(live.flushTimer);
      this.store.finish(live.run.id, {
        status: 'killed',
        exitCode: null,
        signal: 'SIGTERM',
        endedAt,
        logBytes: live.logBytes,
      });
      try {
        this.deps.killGroup(live.pty.pid, 'SIGTERM');
      } catch {
        /* ignora */
      }
    }
    this.live.clear();
    return pids;
  }

  runningIds(): string[] {
    return [...this.live.keys()];
  }
}
