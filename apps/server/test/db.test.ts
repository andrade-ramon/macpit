import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate, openDb } from '../src/db/index.js';
import { MIGRATIONS } from '../src/db/migrations.js';
import { SettingsStore } from '../src/db/settings.js';

describe('openDb', () => {
  it('migra execuções existentes sem inventar vínculo com projeto', () => {
    const db = new DatabaseSync(':memory:');
    for (const sql of MIGRATIONS.slice(0, 5)) db.exec(sql);
    db.exec(`PRAGMA user_version = 5;
      INSERT INTO runs (id, action_name, command, cwd, status, started_at, log_path)
      VALUES ('antiga', 'Ação antiga', 'echo ok', '/projeto', 'exited', 1, '/tmp/sintetico.log');`);
    migrate(db);
    expect(db.prepare('SELECT id, cwd, repo_path FROM runs').get()).toMatchObject({
      id: 'antiga',
      cwd: '/projeto',
      repo_path: null,
    });
    db.close();
  });
  it('cria arquivo 0600 e aplica migrations', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bm-db-')), 'sub', 'db.sqlite');
    const db = openDb(file);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(MIGRATIONS.length);
    db.close();
    // reabrir não reaplica
    const again = openDb(file);
    expect(migrate(again)).toBe(MIGRATIONS.length);
    again.close();
  });
});

describe('SettingsStore', () => {
  const Schema = z.object({ n: z.number() });

  it('grava, lê e cai no padrão quando inválido', () => {
    const db = openDb(':memory:');
    const s = new SettingsStore(db);
    expect(s.get('x', Schema, { n: 1 })).toEqual({ n: 1 });
    s.set('x', { n: 5 });
    expect(s.get('x', Schema, { n: 1 })).toEqual({ n: 5 });
    s.set('x', { n: 'errado' });
    expect(s.get('x', Schema, { n: 1 })).toEqual({ n: 1 });
    db.prepare("UPDATE settings SET value = '{quebrado' WHERE key = 'x'").run();
    expect(s.get('x', Schema, { n: 1 })).toEqual({ n: 1 });
  });
});
