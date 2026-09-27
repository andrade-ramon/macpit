import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from './migrations.js';

export type Db = DatabaseSync;

/**
 * Abre (ou cria) o SQLite em `<dataDir>/db.sqlite` com permissão 0600 e aplica as migrations.
 * `:memory:` para testes. Usa o `node:sqlite` embutido no Node 24 (sem build nativo) — ver ADR 0002.
 */
export function openDb(location: string): Db {
  if (location !== ':memory:') {
    fs.mkdirSync(path.dirname(location), { recursive: true, mode: 0o700 });
    if (!fs.existsSync(location)) fs.writeFileSync(location, '', { mode: 0o600 });
    fs.chmodSync(location, 0o600);
  }
  const db = new DatabaseSync(location);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 2000;');
  migrate(db);
  return db;
}

/** Aplica, em ordem, as migrations ainda não aplicadas (controle por `PRAGMA user_version`). */
export function migrate(db: Db): number {
  const current = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]!);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return MIGRATIONS.length;
}
