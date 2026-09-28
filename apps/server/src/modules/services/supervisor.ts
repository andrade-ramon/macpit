import net from 'node:net';
import type { Action, Run, RunStart, ServiceState } from '@macpit/shared';
import { HttpError } from '../../lib/http.js';
import type { ActionStore } from '../actions/store.js';
import type { RunManager } from '../runs/manager.js';

export interface SupervisorDeps {
  /** A porta aceita conexão em localhost? */
  probe: (port: number) => Promise<boolean>;
  now: () => number;
}

/** Tenta 127.0.0.1 e ::1 (túneis ssh -L costumam abrir os dois; alguns só um). */
export async function probeLocalPort(port: number, timeoutMs = 1000): Promise<boolean> {
  const tryHost = (host: string) =>
    new Promise<boolean>((resolve) => {
      const socket = net.connect({ host, port });
      const done = (ok: boolean) => {
        socket.destroy();
        resolve(ok);
      };
      socket.setTimeout(timeoutMs, () => done(false));
      socket.once('connect', () => done(true));
      socket.once('error', () => done(false));
    });
  return (await tryHost('127.0.0.1')) || (await tryHost('::1'));
}

export const defaultSupervisorDeps: SupervisorDeps = { probe: probeLocalPort, now: Date.now };

export interface SupervisorOptions {
  /** Intervalo do health-check das portas. */
  checkMs: number;
  /** Carência após iniciar antes de considerar a porta "sem resposta". */
  graceMs: number;
  /** Espera do 1º reinício; dobra a cada queda seguida até `backoffMaxMs`. */
  backoffBaseMs: number;
  backoffMaxMs: number;
  /** Rodou pelo menos isso? Então a queda não conta como "seguida" (zera o backoff). */
  stableMs: number;
}

export type ServiceEvent =
  | { kind: 'down'; action: Action; run: Run; willRestartInMs: number | null }
  | { kind: 'unhealthy'; action: Action; port: number }
  | { kind: 'up'; action: Action; port: number };

interface Entry {
  desired: 'running' | 'stopped';
  runId: string | null;
  startedAt: number | null;
  /** Valores dos parâmetros do último início (reusados no reinício automático). */
  params: Record<string, string>;
  size: Pick<RunStart, 'cols' | 'rows'>;
  restarts: number;
  restartTimer: NodeJS.Timeout | null;
  restartAt: number | null;
  health: 'unknown' | 'up' | 'down';
  lastCheckAt: number | null;
  lastExit: string | null;
  unhealthyNotified: boolean;
}

const describeExit = (r: Run) =>
  r.signal ? `${r.status} (${r.signal})` : r.exitCode !== null ? `${r.status} (código ${r.exitCode})` : r.status;

/**
 * Supervisiona ações `persistent` (serviços): health-check da porta esperada, reinício automático com
 * backoff exponencial e estado derivado para a UI. Parar pelo usuário nunca dispara reinício.
 */
export class ServiceSupervisor {
  private readonly entries = new Map<string, Entry>();
  private readonly opts: SupervisorOptions;
  private checkTimer: NodeJS.Timeout | undefined;
  private readonly offFinish: () => void;
  private checking = false;

  constructor(
    private readonly manager: RunManager,
    private readonly actions: ActionStore,
    private readonly deps: SupervisorDeps = defaultSupervisorDeps,
    opts: Partial<SupervisorOptions> = {},
    private readonly onEvent: (e: ServiceEvent) => void = () => {},
  ) {
    this.opts = {
      checkMs: 5_000,
      graceMs: 15_000,
      backoffBaseMs: 2_000,
      backoffMaxMs: 60_000,
      stableMs: 60_000,
      ...opts,
    };
    this.offFinish = manager.onFinish((run) => this.onRunFinished(run));
    actions.serviceState = (a) => this.state(a);
  }

  private entry(actionId: string): Entry {
    let e = this.entries.get(actionId);
    if (!e) {
      e = {
        desired: 'stopped',
        runId: null,
        startedAt: null,
        params: {},
        size: { cols: 120, rows: 32 },
        restarts: 0,
        restartTimer: null,
        restartAt: null,
        health: 'unknown',
        lastCheckAt: null,
        lastExit: null,
        unhealthyNotified: false,
      };
      this.entries.set(actionId, e);
    }
    return e;
  }

  /** Inicia o serviço (ou devolve a execução que já está rodando). */
  start(action: Action, size: Pick<RunStart, 'cols' | 'rows'>, params: Record<string, string> = {}): Run {
    if (!action.persistent) throw new HttpError(400, 'a ação não é um serviço', 'not_service');
    const e = this.entry(action.id);
    if (e.runId && (this.manager.isRunning(e.runId) || e.restartTimer)) {
      const current = this.manager.get(e.runId);
      if (current.repoPath !== this.manager.projectFor(action, params)) {
        throw new HttpError(
          409,
          'este serviço já está ativo em outro projeto; pare-o antes de trocar',
          'service_project_conflict',
        );
      }
    }
    if (e.runId && this.manager.isRunning(e.runId)) return this.manager.get(e.runId);
    this.clearRestart(e);
    e.desired = 'running';
    e.params = params;
    e.size = size;
    e.restarts = 0;
    return this.launch(action, e);
  }

  private launch(action: Action, e: Entry): Run {
    const run = this.manager.start(action, { ...e.size, params: e.params });
    e.runId = run.id;
    e.startedAt = this.deps.now();
    e.health = 'unknown';
    e.lastCheckAt = null;
    e.unhealthyNotified = false;
    return run;
  }

  /** Para o serviço: cancela reinício pendente e encerra a execução. */
  stop(actionId: string): void {
    const e = this.entry(actionId);
    e.desired = 'stopped';
    this.clearRestart(e);
    if (e.runId && this.manager.isRunning(e.runId)) this.manager.stop(e.runId);
  }

  private clearRestart(e: Entry): void {
    if (e.restartTimer) clearTimeout(e.restartTimer);
    e.restartTimer = null;
    e.restartAt = null;
  }

  private onRunFinished(run: Run): void {
    if (!run.actionId) return;
    const e = this.entries.get(run.actionId);
    if (!e || e.runId !== run.id) return;
    e.lastExit = describeExit(run);
    e.health = 'unknown';
    e.unhealthyNotified = false;
    const action = this.actions.find(run.actionId);
    // Parado pelo usuário (killed), parada pedida, ou deixou de ser serviço → não reinicia nem avisa.
    const crashed = run.status === 'failed' || run.status === 'exited';
    if (!action?.persistent || !crashed || e.desired !== 'running') {
      e.desired = 'stopped';
      return;
    }
    if (!action.autoRestart) {
      e.desired = 'stopped';
      this.onEvent({ kind: 'down', action, run, willRestartInMs: null });
      return;
    }
    const ranMs = (run.endedAt ?? this.deps.now()) - run.startedAt;
    if (ranMs >= this.opts.stableMs) e.restarts = 0;
    const delay = Math.min(this.opts.backoffMaxMs, this.opts.backoffBaseMs * 2 ** e.restarts);
    e.restarts++;
    e.restartAt = this.deps.now() + delay;
    this.onEvent({ kind: 'down', action, run, willRestartInMs: delay });
    e.restartTimer = setTimeout(() => {
      e.restartTimer = null;
      e.restartAt = null;
      const current = this.actions.find(action.id);
      if (!current?.persistent || e.desired !== 'running') return;
      try {
        this.launch(current, e);
      } catch (err) {
        // ex.: cwd removido — registra e para de tentar
        e.desired = 'stopped';
        e.lastExit = err instanceof Error ? err.message : String(err);
      }
    }, delay);
    e.restartTimer.unref();
  }

  state(action: Action): ServiceState {
    const e = this.entries.get(action.id);
    const port = action.expectedPort ?? null;
    const base = {
      runId: e?.runId ?? null,
      port,
      restartAt: e?.restartAt ?? null,
      restarts: e?.restarts ?? 0,
      lastCheckAt: e?.lastCheckAt ?? null,
      lastExit: e?.lastExit ?? null,
    };
    if (!e) return { state: 'stopped', ...base };
    if (e.restartTimer) return { state: 'restarting', ...base };
    const running = e.runId !== null && this.manager.isRunning(e.runId);
    if (!running) return { state: 'stopped', ...base };
    if (port === null) return { state: 'running', ...base };
    if (e.health === 'up') return { state: 'up', ...base };
    const inGrace = e.startedAt !== null && this.deps.now() - e.startedAt < this.opts.graceMs;
    return { state: inGrace ? 'starting' : 'unhealthy', ...base };
  }

  /** Um ciclo de health-check (exposto para testes). */
  async check(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      for (const [actionId, e] of this.entries) {
        if (!e.runId || !this.manager.isRunning(e.runId)) continue;
        const action = this.actions.find(actionId);
        if (!action?.expectedPort) continue;
        const ok = await this.deps.probe(action.expectedPort);
        const prev = e.health;
        e.health = ok ? 'up' : 'down';
        e.lastCheckAt = this.deps.now();
        const pastGrace = e.startedAt !== null && this.deps.now() - e.startedAt >= this.opts.graceMs;
        if (ok) {
          e.unhealthyNotified = false;
          if (prev !== 'up') this.onEvent({ kind: 'up', action, port: action.expectedPort });
        } else if ((prev === 'up' || pastGrace) && !e.unhealthyNotified) {
          // avisa uma vez: caiu depois de estar ok, ou nunca respondeu passada a carência
          e.unhealthyNotified = true;
          this.onEvent({ kind: 'unhealthy', action, port: action.expectedPort });
        }
      }
    } finally {
      this.checking = false;
    }
  }

  startChecks(): void {
    this.checkTimer = setInterval(() => void this.check(), this.opts.checkMs);
    this.checkTimer.unref();
  }

  /**
   * Inicia os serviços com `autoStart` (chamado no boot do servidor). Falha de um não impede os outros;
   * parâmetros usam os valores padrão (garantidos pela validação do schema).
   */
  autoStartAll(): { started: string[]; failed: Array<{ name: string; error: string }> } {
    const started: string[] = [];
    const failed: Array<{ name: string; error: string }> = [];
    for (const action of this.actions.list()) {
      if (!action.persistent || !action.autoStart) continue;
      try {
        this.start(action, { cols: 120, rows: 32 });
        started.push(action.name);
      } catch (err) {
        failed.push({ name: action.name, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { started, failed };
  }

  /** Ação apagada: para e descarta o estado. */
  forget(actionId: string): void {
    this.stop(actionId);
    this.entries.delete(actionId);
  }

  close(): void {
    clearInterval(this.checkTimer);
    for (const e of this.entries.values()) this.clearRestart(e);
    this.offFinish();
  }
}
