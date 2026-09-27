import type { DiskHistory, DiskOverview, DiskRange, DiskSettings, DiskVolume } from '@macpit/shared';
import { DEFAULT_DISK_SETTINGS, DISK_RANGE_MS, DiskSettingsSchema } from '@macpit/shared';
import type { Db } from '../../db/index.js';
import { SettingsStore } from '../../db/settings.js';
import { run } from '../../lib/exec.js';
import { isUserVolume, parseDf, volumeName } from './parser.js';

const SETTINGS_KEY = 'disk';
export const DISK_RETENTION_MS = DISK_RANGE_MS['30d'];
/** Máximo de pontos devolvidos por consulta de histórico (média por intervalo). */
const MAX_POINTS = 300;

export interface DiskDeps {
  df: () => Promise<string>;
  now: () => number;
}

export const defaultDiskDeps: DiskDeps = {
  df: async () => (await run('/bin/df', ['-kP'], { env: { ...process.env, LC_ALL: 'C' } })).stdout,
  now: () => Date.now(),
};

export class DiskService {
  private readonly settingsStore: SettingsStore;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly db: Db,
    private readonly sampleIntervalMs: number,
    private readonly deps: DiskDeps = defaultDiskDeps,
  ) {
    this.settingsStore = new SettingsStore(db);
  }

  settings(): DiskSettings {
    return this.settingsStore.get(SETTINGS_KEY, DiskSettingsSchema, DEFAULT_DISK_SETTINGS);
  }

  updateSettings(next: DiskSettings): DiskSettings {
    this.settingsStore.set(SETTINGS_KEY, next);
    return next;
  }

  async volumes(): Promise<DiskVolume[]> {
    const { alertPct } = this.settings();
    return parseDf(await this.deps.df())
      .filter(isUserVolume)
      .map((r) => {
        const usedBytes = Math.max(0, r.totalBytes - r.availableBytes);
        const usedPct = Math.round((usedBytes / r.totalBytes) * 1000) / 10;
        return {
          mount: r.mount,
          filesystem: r.filesystem,
          name: volumeName(r.mount),
          totalBytes: r.totalBytes,
          usedBytes,
          availableBytes: r.availableBytes,
          usedPct,
          alert: usedPct >= alertPct,
        };
      })
      .sort((a, b) => (a.mount === '/' ? -1 : b.mount === '/' ? 1 : a.mount.localeCompare(b.mount)));
  }

  async overview(): Promise<DiskOverview> {
    return { ts: this.deps.now(), volumes: await this.volumes(), settings: this.settings() };
  }

  /** Grava uma amostra por volume e apaga o que passou da retenção (30 dias). */
  async recordSample(): Promise<DiskVolume[]> {
    const ts = this.deps.now();
    const volumes = await this.volumes();
    const insert = this.db.prepare(
      'INSERT OR REPLACE INTO disk_samples (mount, ts, used_bytes, total_bytes) VALUES (?, ?, ?, ?)',
    );
    this.db.exec('BEGIN');
    try {
      for (const v of volumes) insert.run(v.mount, ts, v.usedBytes, v.totalBytes);
      this.db.prepare('DELETE FROM disk_samples WHERE ts < ?').run(ts - DISK_RETENTION_MS);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return volumes;
  }

  history(mount: string, range: DiskRange): DiskHistory {
    const now = this.deps.now();
    const from = now - DISK_RANGE_MS[range];
    const bucket = Math.max(this.sampleIntervalMs, Math.ceil(DISK_RANGE_MS[range] / MAX_POINTS));
    const rows = this.db
      .prepare(
        // node:sqlite liga números JS como REAL: o CAST garante divisão inteira (agrupamento por intervalo).
        `SELECT (ts / CAST(:bucket AS INTEGER)) AS b, MAX(ts) AS ts, CAST(AVG(used_bytes) AS INTEGER) AS used,
                MAX(total_bytes) AS total
           FROM disk_samples WHERE mount = :mount AND ts >= :from
          GROUP BY b ORDER BY b`,
      )
      .all({ bucket, mount, from }) as Array<{ ts: number; used: number; total: number }>;
    return {
      mount,
      range,
      points: rows.map((r) => ({ ts: r.ts, usedBytes: r.used, totalBytes: r.total })),
      sampleIntervalMs: this.sampleIntervalMs,
    };
  }

  /** Amostragem em segundo plano enquanto o servidor estiver no ar (independe de inscritos). */
  startSampling(onError: (err: unknown) => void, onSample: (volumes: DiskVolume[]) => void = () => {}): void {
    const tick = () => this.recordSample().then(onSample, onError);
    void tick();
    this.timer = setInterval(tick, this.sampleIntervalMs);
    this.timer.unref();
  }

  stopSampling(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
