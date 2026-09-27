import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate, openDb } from '../src/db/index.js';
import { MIGRATIONS } from '../src/db/migrations.js';
import { SettingsStore } from '../src/db/settings.js';

describe('openDb', () => {
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
