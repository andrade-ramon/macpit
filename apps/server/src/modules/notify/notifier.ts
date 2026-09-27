import type { DiskVolume, NotificationSettings, Run } from '@macpit/shared';
import { DEFAULT_NOTIFICATION_SETTINGS, NotificationSettingsSchema } from '@macpit/shared';
import type { SettingsStore } from '../../db/settings.js';
import { run } from '../../lib/exec.js';
import type { ServiceEvent } from '../services/supervisor.js';

export const NOTIFY_SETTINGS_KEY = 'notifications';

export type SendNotification = (title: string, message: string) => Promise<void>;

/**
 * Notificação do macOS via `osascript`. Título e mensagem vão como **argumentos** (`on run argv`),
 * nunca interpolados no código AppleScript — um nome de ação com aspas não vira código.
 */
export const osascriptNotify: SendNotification = async (title, message) => {
  await run(
    '/usr/bin/osascript',
    [
      '-e',
      'on run argv',
      '-e',
      'display notification (item 2 of argv) with title (item 1 of argv)',
      '-e',
      'end run',
      '--',
      title.slice(0, 200),
      message.slice(0, 500),
    ],
    { timeoutMs: 5_000 },
  );
};

const TITLE = 'macpit';

/** Decide o que notificar segundo as configurações e dispara (erros só vão para o log). */
export class Notifier {
  private alerted = new Set<string>();

  constructor(
    private readonly settingsStore: SettingsStore,
    private readonly send: SendNotification = osascriptNotify,
    private readonly log: (err: unknown) => void = () => {},
  ) {}

  settings(): NotificationSettings {
    return this.settingsStore.get(NOTIFY_SETTINGS_KEY, NotificationSettingsSchema, DEFAULT_NOTIFICATION_SETTINGS);
  }

  update(next: NotificationSettings): NotificationSettings {
    this.settingsStore.set(NOTIFY_SETTINGS_KEY, next);
    return next;
  }

  private emit(message: string, title = TITLE): Promise<void> {
    return this.send(title, message).catch((err: unknown) => this.log(err));
  }

  test(): Promise<void> {
    return this.send(TITLE, 'Notificações funcionando ✔');
  }

  runFinished(r: Run, isService: boolean): void {
    const s = this.settings();
    // serviços têm notificação própria (serviceEvent)
    if (!s.enabled || s.runs === 'none' || isService || r.status === 'killed') return;
    const failed = r.status === 'failed' || r.status === 'interrupted';
    if (s.runs === 'failures' && !failed) return;
    const how = failed ? (r.signal ? `falhou (${r.signal})` : `falhou (código ${r.exitCode ?? '?'})`) : 'concluída';
    void this.emit(`${r.actionName}: ${how}`);
  }

  serviceEvent(e: ServiceEvent): void {
    const s = this.settings();
    if (!s.enabled || !s.services) return;
    const name = e.action.name;
    if (e.kind === 'down') {
      const retry = e.willRestartInMs !== null ? ` — reiniciando em ${Math.round(e.willRestartInMs / 1000)}s` : '';
      void this.emit(`${name} caiu${retry}`);
    } else if (e.kind === 'unhealthy') {
      void this.emit(`${name}: porta ${e.port} sem resposta`);
    } else {
      void this.emit(`${name} conectado (porta ${e.port})`);
    }
  }

  /** Avisa só na transição para "acima do limite" (não a cada amostra). */
  diskVolumes(volumes: readonly DiskVolume[]): void {
    const now = new Set(volumes.filter((v) => v.alert).map((v) => v.mount));
    const s = this.settings();
    if (s.enabled && s.disk) {
      for (const v of volumes) {
        if (v.alert && !this.alerted.has(v.mount)) {
          void this.emit(`${v.name} com ${v.usedPct.toFixed(1)}% de uso`, `${TITLE} — disco`);
        }
      }
    }
    this.alerted = now;
  }
}
