import type { z } from 'zod';
import type { Db } from './index.js';

/** Configurações persistidas como JSON na tabela `settings`, validadas com zod na leitura. */
export class SettingsStore {
  constructor(private readonly db: Db) {}

  get<S extends z.ZodType>(key: string, schema: S, fallback: z.infer<S>): z.infer<S> {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row) return fallback;
    try {
      const parsed = schema.safeParse(JSON.parse(row.value));
      return parsed.success ? parsed.data : fallback;
    } catch {
      return fallback;
    }
  }

  set(key: string, value: unknown): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value));
  }
}
