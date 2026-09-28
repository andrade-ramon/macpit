/**
 * Migrations em ordem; o índice + 1 é a versão (`PRAGMA user_version`).
 * Nunca edite uma migration já publicada — adicione uma nova. Documente em docs/06-modelo-dados.md.
 */
export const MIGRATIONS: readonly string[] = [
  // 1 — fase 4: histórico de disco e configurações
  `
  CREATE TABLE disk_samples (
    mount       TEXT    NOT NULL,
    ts          INTEGER NOT NULL,
    used_bytes  INTEGER NOT NULL,
    total_bytes INTEGER NOT NULL,
    PRIMARY KEY (mount, ts)
  ) WITHOUT ROWID;
  CREATE INDEX disk_samples_ts ON disk_samples (ts);

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // 2 — fase 5: ações, execuções e auditoria
  `
  CREATE TABLE actions (
    id         TEXT PRIMARY KEY,
    name       TEXT    NOT NULL,
    command    TEXT    NOT NULL,
    cwd        TEXT,
    env        TEXT    NOT NULL DEFAULT '{}',
    grp        TEXT,
    icon       TEXT,
    favorite   INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE runs (
    id          TEXT PRIMARY KEY,
    action_id   TEXT REFERENCES actions (id) ON DELETE SET NULL,
    action_name TEXT    NOT NULL,
    command     TEXT    NOT NULL,
    cwd         TEXT    NOT NULL,
    pid         INTEGER,
    status      TEXT    NOT NULL,
    exit_code   INTEGER,
    signal      TEXT,
    started_at  INTEGER NOT NULL,
    ended_at    INTEGER,
    log_path    TEXT    NOT NULL,
    log_bytes   INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX runs_action_started ON runs (action_id, started_at DESC);
  CREATE INDEX runs_status ON runs (status);

  CREATE TABLE audit_log (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    ts     INTEGER NOT NULL,
    kind   TEXT    NOT NULL,
    target TEXT    NOT NULL,
    detail TEXT    NOT NULL DEFAULT '{}'
  );
  CREATE INDEX audit_log_ts ON audit_log (ts);
  `,
  // 3 — fase 6: serviços e parâmetros
  `
  ALTER TABLE actions ADD COLUMN persistent    INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE actions ADD COLUMN expected_port INTEGER;
  ALTER TABLE actions ADD COLUMN auto_restart  INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE actions ADD COLUMN params        TEXT    NOT NULL DEFAULT '[]';
  `,
  // 4 — fase 7: serviços iniciados com o macpit
  `
  ALTER TABLE actions ADD COLUMN auto_start INTEGER NOT NULL DEFAULT 0;
  `,
  // 5 — repositórios: variáveis por repo (preenchem os {{parâmetros}} das ações)
  `
  CREATE TABLE repo_vars (
    repo_path TEXT    NOT NULL,
    name      TEXT    NOT NULL,
    value     TEXT    NOT NULL,
    secret    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (repo_path, name)
  );
  `,
  // 6 — vínculo imutável de cada execução com o projeto escolhido
  `
  ALTER TABLE runs ADD COLUMN repo_path TEXT;
  CREATE INDEX runs_repo_started ON runs (repo_path, started_at DESC);
  `,
];
