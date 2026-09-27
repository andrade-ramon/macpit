import type { Action } from '@macpit/shared';
import { useEffect, useState } from 'react';
import { fmtShort } from '../../lib/format';
import { NEVER_RUN, runStyle, serviceStyle, type Badge } from '../terminal/runStyle';

/** Atualiza a cada segundo só enquanto houver contagem regressiva (reinício agendado). */
export function useTick(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** Selo e estado "rodando" de uma ação (serviço, execução comum ou nunca executada). */
export function actionState(action: Action, now = Date.now()): { badge: Badge; running: boolean; runId?: string } {
  const service = action.persistent ? action.service : null;
  if (service) {
    const badge = serviceStyle(service, now);
    return { badge, running: badge.active, runId: service.runId ?? action.lastRun?.id };
  }
  const last = action.lastRun;
  const running = action.runningCount > 0 && last?.status === 'running';
  if (!last) return { badge: NEVER_RUN, running: false };
  const badge = runStyle(last);
  if (running && action.runningCount > 1) badge.text = `rodando (${action.runningCount})`;
  return { badge, running, runId: last.id };
}

/** Linha de contexto do card: diretório, parâmetros pedidos e data da última execução. */
export function actionMeta(a: Action): string {
  const parts: string[] = [];
  if (a.cwd) parts.push(`em ${a.cwd}`);
  if (a.params.length) parts.push(`pede ${a.params.map((p) => p.label || p.name).join(', ')}`);
  if (a.lastRun && !a.persistent) parts.push(fmtShort(a.lastRun.startedAt));
  return parts.join(' · ');
}

interface Props {
  action: Action;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onRun: () => void;
  onOpenRun: (runId: string) => void;
  onStop: () => void;
  onEdit: () => void;
}

export function ActionCard({ action, selected, busy, onSelect, onRun, onOpenRun, onStop, onEdit }: Props) {
  const now = useTick(action.service?.state === 'restarting');
  const { badge, running, runId } = actionState(action, now);
  const border = selected
    ? 'var(--accent)'
    : !running
      ? 'var(--line)'
      : action.service?.state === 'unhealthy'
        ? 'var(--danger)'
        : 'var(--ok)';
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      onClick={onSelect}
      aria-label={action.name}
      aria-current={selected || undefined}
      className="flex min-w-0 cursor-pointer flex-col gap-3 rounded-[14px] border bg-panel p-4 hover:border-line2"
      style={{ borderColor: border, boxShadow: selected ? '0 0 0 1px var(--accent)' : undefined }}
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-panel2 text-xl">
          {action.icon || (action.persistent ? '⇄' : '▶')}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="m-0 truncate text-[15px] font-semibold">{action.name}</h3>
            {action.favorite && (
              <span className="text-warn" title="Favorita">
                ★
              </span>
            )}
          </div>
          <p className="m-0 mt-0.5 truncate font-mono text-xs text-text3" title={action.command}>
            {action.command}
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-[3px] text-[11.5px] font-semibold"
          style={{ background: badge.bg, color: badge.fg }}
          title={action.service?.lastExit ?? undefined}
        >
          {badge.live && <span className="h-1.5 w-1.5 rounded-full bg-current anim-pulse" />}
          {badge.text}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate text-xs text-text3">{actionMeta(action)}</span>
        {running ? (
          <>
            {runId && action.service?.state !== 'restarting' && (
              <button onClick={stop(() => onOpenRun(runId))} className="btn h-[38px] rounded-[10px] px-3.5">
                Terminal
              </button>
            )}
            <button onClick={stop(onStop)} className="btn btn-danger h-[38px] rounded-[10px] px-3.5">
              ■ Parar
            </button>
          </>
        ) : (
          <>
            <button
              onClick={stop(onEdit)}
              className="btn h-[38px] rounded-[10px] px-3.5"
              aria-label={`Editar ${action.name}`}
            >
              Editar
            </button>
            <button
              onClick={stop(onRun)}
              disabled={busy}
              className="btn btn-primary h-[38px] rounded-[10px] px-4 font-bold"
            >
              {busy ? 'Iniciando…' : action.persistent ? '▶ Iniciar' : '▶ Executar'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
