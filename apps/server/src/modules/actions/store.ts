import { randomBytes } from 'node:crypto';
import type { Action, ActionInput, ActionParam, ServiceState } from '@macpit/shared';
import { ActionInputSchema } from '@macpit/shared';
import type { Db } from '../../db/index.js';
import { HttpError, parseOr400 } from '../../lib/http.js';
import type { RunStore } from '../runs/store.js';

interface ActionRow {
  id: string;
  name: string;
  command: string;
  cwd: string | null;
  env: string;
  grp: string | null;
  icon: string | null;
  favorite: number;
  persistent: number;
  expected_port: number | null;
  auto_restart: number;
  auto_start: number;
  params: string;
  created_at: number;
  updated_at: number;
}

export const newId = () => randomBytes(6).toString('hex');

/** Valida (400 em erro) e normaliza: campos opcionais vazios viram ausentes (a UI manda string vazia). */
export function normalizeAction(input: unknown) {
  const data = parseOr400(ActionInputSchema, input);
  return {
    ...data,
    cwd: data.cwd || undefined,
    group: data.group || undefined,
    icon: data.icon || undefined,
    params: data.params.map((p) => ({ ...p, label: p.label || undefined })),
  };
}

export class ActionStore {
  /** Preenchido pelo supervisor de serviços (evita dependência circular). */
  serviceState: (action: Action) => ServiceState | null = () => null;

  constructor(
    private readonly db: Db,
    private readonly runs: RunStore,
    private readonly now: () => number = Date.now,
  ) {}

  private toAction(r: ActionRow): Action {
    const action: Action = {
      id: r.id,
      name: r.name,
      command: r.command,
      ...(r.cwd ? { cwd: r.cwd } : {}),
      env: JSON.parse(r.env) as Record<string, string>,
      ...(r.grp ? { group: r.grp } : {}),
      ...(r.icon ? { icon: r.icon } : {}),
      favorite: r.favorite === 1,
      persistent: r.persistent === 1,
      ...(r.expected_port !== null ? { expectedPort: r.expected_port } : {}),
      autoRestart: r.auto_restart === 1,
      autoStart: r.auto_start === 1,
      // ações anteriores ao tipo `repo` não têm `type`
      params: (JSON.parse(r.params) as ActionParam[]).map((p) => ({ ...p, type: p.type ?? 'text' })),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      lastRun: this.runs.lastForAction(r.id),
      runningCount: this.runs.runningCount(r.id),
      service: null,
    };
    if (action.persistent) action.service = this.serviceState(action);
    return action;
  }

  list(): Action[] {
    const rows = this.db
      .prepare("SELECT * FROM actions ORDER BY favorite DESC, COALESCE(grp, ''), name COLLATE NOCASE")
      .all() as unknown as ActionRow[];
    return rows.map((r) => this.toAction(r));
  }

  find(id: string): Action | undefined {
    const row = this.db.prepare('SELECT * FROM actions WHERE id = ?').get(id) as ActionRow | undefined;
    return row ? this.toAction(row) : undefined;
  }

  get(id: string): Action {
    const action = this.find(id);
    if (!action) throw new HttpError(404, `ação ${id} não encontrada`, 'not_found');
    return action;
  }

  existsByName(name: string): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM actions WHERE name = ? COLLATE NOCASE').get(name.trim()));
  }

  private values(a: ReturnType<typeof normalizeAction>) {
    return [
      a.name,
      a.command,
      a.cwd ?? null,
      JSON.stringify(a.env),
      a.group ?? null,
      a.icon ?? null,
      a.favorite ? 1 : 0,
      a.persistent ? 1 : 0,
      a.expectedPort ?? null,
      a.autoRestart ? 1 : 0,
      JSON.stringify(a.params),
      a.autoStart ? 1 : 0,
    ] as const;
  }

  create(input: ActionInput | unknown): Action {
    const a = normalizeAction(input);
    const id = newId();
    const ts = this.now();
    this.db
      .prepare(
        `INSERT INTO actions (name, command, cwd, env, grp, icon, favorite, persistent, expected_port, auto_restart, params, auto_start,
                              id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(...this.values(a), id, ts, ts);
    return this.get(id);
  }

  update(id: string, input: ActionInput | unknown): Action {
    this.get(id);
    const a = normalizeAction(input);
    this.db
      .prepare(
        `UPDATE actions SET name = ?, command = ?, cwd = ?, env = ?, grp = ?, icon = ?, favorite = ?, persistent = ?,
                            expected_port = ?, auto_restart = ?, params = ?, auto_start = ?, updated_at = ?
          WHERE id = ?`,
      )
      .run(...this.values(a), this.now(), id);
    return this.get(id);
  }

  delete(id: string): void {
    this.get(id);
    this.db.prepare('DELETE FROM actions WHERE id = ?').run(id);
  }

  /** Formato de entrada (para exportar): sem id, datas, estado de execução. */
  static toInput(a: Action): ActionInput {
    return {
      name: a.name,
      command: a.command,
      ...(a.cwd ? { cwd: a.cwd } : {}),
      env: a.env,
      ...(a.group ? { group: a.group } : {}),
      ...(a.icon ? { icon: a.icon } : {}),
      favorite: a.favorite,
      persistent: a.persistent,
      ...(a.expectedPort !== undefined ? { expectedPort: a.expectedPort } : {}),
      autoRestart: a.autoRestart,
      autoStart: a.autoStart,
      params: a.params,
    };
  }
}
