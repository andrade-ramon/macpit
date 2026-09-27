import type { Run, RunStatus } from '@macpit/shared';
import type { Db } from '../../db/index.js';

interface RunRow {
  id: string;
  action_id: string | null;
  action_name: string;
  command: string;
  cwd: string;
  pid: number | null;
  status: RunStatus;
  exit_code: number | null;
  signal: string | null;
  started_at: number;
  ended_at: number | null;
  log_path: string;
  log_bytes: number;
}

export interface StoredRun extends Run {
  logPath: string;
}

const toRun = (r: RunRow): StoredRun => ({
  id: r.id,
  actionId: r.action_id,
  actionName: r.action_name,
  command: r.command,
  cwd: r.cwd,
  pid: r.pid,
  status: r.status,
  exitCode: r.exit_code,
  signal: r.signal,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  logBytes: r.log_bytes,
  logPath: r.log_path,
});

/** Sem o caminho do log (não vai para a API). */
export function publicRun({ logPath: _logPath, ...run }: StoredRun): Run {
  return run;
}

export class RunStore {
  constructor(private readonly db: Db) {}

  insert(run: StoredRun): void {
    this.db
      .prepare(
        `INSERT INTO runs (id, action_id, action_name, command, cwd, pid, status, exit_code, signal, started_at, ended_at, log_path, log_bytes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        run.id,
        run.actionId,
        run.actionName,
        run.command,
        run.cwd,
        run.pid,
        run.status,
        run.exitCode,
        run.signal,
        run.startedAt,
        run.endedAt,
        run.logPath,
        run.logBytes,
      );
  }

  finish(
    id: string,
    f: { status: RunStatus; exitCode: number | null; signal: string | null; endedAt: number; logBytes: number },
  ): void {
    this.db
      .prepare('UPDATE runs SET status = ?, exit_code = ?, signal = ?, ended_at = ?, log_bytes = ? WHERE id = ?')
      .run(f.status, f.exitCode, f.signal, f.endedAt, f.logBytes, id);
  }

  get(id: string): StoredRun | undefined {
    const row = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as RunRow | undefined;
    return row ? toRun(row) : undefined;
  }

  list(opts: { actionId?: string; limit: number }): StoredRun[] {
    const rows = opts.actionId
      ? this.db
          .prepare('SELECT * FROM runs WHERE action_id = ? ORDER BY started_at DESC LIMIT ?')
          .all(opts.actionId, opts.limit)
      : this.db.prepare('SELECT * FROM runs ORDER BY started_at DESC LIMIT ?').all(opts.limit);
    return (rows as unknown as RunRow[]).map(toRun);
  }

  lastForAction(actionId: string): Run | null {
    const row = this.db
      .prepare('SELECT * FROM runs WHERE action_id = ? ORDER BY started_at DESC LIMIT 1')
      .get(actionId) as RunRow | undefined;
    return row ? publicRun(toRun(row)) : null;
  }

  runningCount(actionId: string): number {
    return (
      this.db.prepare("SELECT COUNT(*) AS n FROM runs WHERE action_id = ? AND status = 'running'").get(actionId) as {
        n: number;
      }
    ).n;
  }

  listRunning(): StoredRun[] {
    return (this.db.prepare("SELECT * FROM runs WHERE status = 'running'").all() as unknown as RunRow[]).map(toRun);
  }

  /** Execuções que estavam `running` quando o servidor caiu/reiniciou. */
  markInterrupted(endedAt: number): number {
    return Number(
      this.db.prepare("UPDATE runs SET status = 'interrupted', ended_at = ? WHERE status = 'running'").run(endedAt)
        .changes,
    );
  }

  /** Mantém as `keep` execuções mais recentes da ação; devolve os logs a apagar. */
  prune(actionId: string, keep: number): string[] {
    const old = this.db
      .prepare(
        `SELECT id, log_path FROM runs WHERE action_id = ? AND status != 'running'
          ORDER BY started_at DESC LIMIT -1 OFFSET ?`,
      )
      .all(actionId, keep) as Array<{ id: string; log_path: string }>;
    const del = this.db.prepare('DELETE FROM runs WHERE id = ?');
    for (const r of old) del.run(r.id);
    return old.map((r) => r.log_path);
  }
}
