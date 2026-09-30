import type { Run } from '@macpit/shared';
import { useQueries } from '@tanstack/react-query';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { fmtDur } from '../../lib/format';
import { runDurationMs } from '../actions/actionUtils';
import { useRunAction } from '../actions/RunLauncher';
import { useActions, useStartRun, useStopRun } from '../actions/useActions';
import { useDock } from './DockContext';
import { RUN_STYLE, runStyle } from './runStyle';

// xterm.js é pesado: só carrega quando há uma execução aberta.
const RunTerminal = lazy(() => import('../actions/RunTerminal'));

const COLLAPSED = 50;

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** Terminal fixo embaixo: abas das execuções abertas, redimensionável pela alça. */
export function TerminalDock() {
  const dock = useDock();
  const { data: actions } = useActions();
  const start = useStartRun();
  const stop = useStopRun();
  const launch = useRunAction();
  const [live, setLive] = useState<Run>();

  const queries = useQueries({
    queries: dock.runs.map((id) => ({
      queryKey: ['run', id],
      queryFn: () => api<Run>(`/api/runs/${id}`),
      retry: false,
      refetchInterval: (q: { state: { data?: Run } }) => (q.state.data?.status === 'running' ? 3_000 : false),
    })),
  });
  const runs = new Map<string, Run>();
  dock.runs.forEach((id, i) => {
    const d = queries[i]?.data;
    if (d) runs.set(id, d);
  });
  // execuções apagadas pela retenção somem das abas
  const gone = dock.runs.filter((id, i) => queries[i]?.isError);
  useEffect(() => {
    for (const id of gone) dock.closeRun(id);
  }, [gone.join(','), dock]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeId = dock.active;
  const run = activeId ? (live?.id === activeId ? live : runs.get(activeId)) : undefined;
  const running = run?.status === 'running';
  const now = useNow(running);
  const onStatus = useCallback((r: Run) => setLive(r), []);
  const action = run?.actionId ? actions?.find((a) => a.id === run.actionId) : undefined;
  // serviço reiniciou em outra execução: oferece abrir a atual
  const current =
    !running && action?.persistent && action.service?.runId && action.service.runId !== run?.id
      ? action.service.runId
      : undefined;

  const rerun = () => {
    if (!action) return;
    if (action.params.length) return launch(action);
    start.mutate({ actionId: action.id }, { onSuccess: (r) => dock.openRun(r.id) });
  };

  // redimensionar arrastando a alça
  const drag = useRef<{ y: number; h: number } | null>(null);
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!drag.current) return;
      const h = Math.max(120, Math.min(window.innerHeight - 200, drag.current.h + (drag.current.y - e.clientY)));
      dock.setHeight(h);
    };
    const up = () => (drag.current = null);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [dock]);

  const badge = run ? runStyle(run) : undefined;

  return (
    <section
      aria-label="Terminal"
      className="flex shrink-0 flex-col border-t border-line bg-panel"
      style={{
        height: dock.open ? dock.height : undefined,
        minHeight: COLLAPSED,
        maxHeight: dock.open ? '65vh' : undefined,
      }}
    >
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          drag.current = { y: e.clientY, h: dock.open ? dock.height : COLLAPSED };
        }}
        title="Arraste para redimensionar"
        className="flex h-1.5 shrink-0 cursor-row-resize items-center justify-center hover:bg-accent-soft"
      >
        <span className="h-[3px] w-12 rounded-full bg-line2" />
      </div>
      <div className="terminal-toolbar">
        <button
          onClick={() => dock.setOpen(!dock.open)}
          aria-label={dock.open ? 'Recolher terminal' : 'Expandir terminal'}
          aria-expanded={dock.open}
          className="btn btn-ghost h-8 text-xs"
        >
          {dock.open ? '▾ Recolher' : '▴ Abrir'}
        </button>
        <span className="eyebrow mr-1.5">Terminal</span>
        <div
          className="terminal-tabs flex min-w-0 flex-1 gap-0.5 overflow-auto"
          role="tablist"
          aria-label="Execuções abertas"
        >
          {dock.runs.map((id) => {
            const r = id === live?.id ? live : runs.get(id);
            const active = id === activeId;
            const st = r ? RUN_STYLE[r.status] : RUN_STYLE.exited;
            return (
              <div
                key={id}
                role="tab"
                aria-selected={active}
                tabIndex={0}
                onClick={() => dock.setActive(id)}
                onKeyDown={(e) => e.key === 'Enter' && dock.setActive(id)}
                className={`flex h-[34px] min-w-0 shrink cursor-pointer items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border px-3 text-[13px] font-medium ${
                  active ? 'border-line2 bg-panel2 text-text' : 'border-transparent text-text2 hover:text-text'
                }`}
              >
                <span
                  className={`h-[7px] w-[7px] shrink-0 rounded-full ${r?.status === 'running' ? 'anim-pulse' : ''}`}
                  style={{ background: st.dot }}
                />
                <span className="min-w-0 overflow-hidden text-ellipsis">{r?.actionName ?? '…'}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    dock.closeRun(id);
                  }}
                  aria-label={`Fechar aba ${r?.actionName ?? ''}`}
                  className="ml-0.5 border-0 bg-transparent px-0.5 text-[11px] text-text3 hover:text-text"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
        {run && badge && (
          <>
            <span className="whitespace-nowrap font-mono text-xs text-text3">
              {run.pid ? `PID ${run.pid} · ` : ''}
              {fmtDur(runDurationMs(run, now) / 1000)}
            </span>
            <span
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-[3px] text-[11.5px] font-semibold"
              style={{ background: badge.bg, color: badge.fg }}
            >
              {badge.text}
            </span>
            {current && (
              <button onClick={() => dock.openRun(current)} className="btn h-[34px] rounded-[9px]">
                ↻ Execução atual
              </button>
            )}
            {running ? (
              <button
                onClick={() => stop.mutate(run.id)}
                disabled={stop.isPending}
                title="SIGTERM no grupo; SIGKILL após 5 s"
                className="btn btn-danger h-[34px] rounded-[9px] px-3.5"
              >
                {stop.isPending ? 'Parando…' : '■ Parar'}
              </button>
            ) : (
              action &&
              !current && (
                <button
                  onClick={rerun}
                  disabled={start.isPending}
                  className="btn btn-primary h-[34px] rounded-[9px] px-3.5 font-bold"
                >
                  ▶ Executar de novo
                </button>
              )
            )}
            <a
              href={`/api/runs/${run.id}/log`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn h-[34px] rounded-[9px]"
            >
              Baixar log
            </a>
            <button
              onClick={() => dock.setHeight(Math.max(280, window.innerHeight - 220))}
              title="Maximizar"
              aria-label="Maximizar terminal"
              className="btn btn-icon h-[34px] w-[34px] rounded-[9px]"
            >
              ⤢
            </button>
          </>
        )}
      </div>
      {dock.open && (
        <div className="mb-3 flex min-h-0 w-[calc(100%-24px)] max-w-[1680px] flex-1 flex-col self-center overflow-hidden rounded-[10px] border border-line bg-black">
          {activeId ? (
            <>
              <div className="flex h-[30px] shrink-0 items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap border-b border-[#1a1d24] px-3 font-mono text-[11.5px] text-term-dim">
                {run ? `${run.cwd} $ ${run.command}` : '…'}
              </div>
              {(start.error || stop.error) && (
                <div className="px-3.5 pt-2 text-xs text-danger">{(start.error ?? stop.error)?.message}</div>
              )}
              <div className="min-h-0 flex-1 px-3.5 py-2">
                <Suspense fallback={<div className="p-2 text-xs text-term-dim">Carregando terminal…</div>}>
                  <RunTerminal key={activeId} runId={activeId} onStatus={onStatus} />
                </Suspense>
              </div>
              {running && (
                <div className="flex h-7 shrink-0 items-center border-t border-[#1a1d24] px-3.5 text-[11.5px] text-term-dim">
                  Terminal interativo — digite aqui para responder ao processo (ex.: senha do ssh).
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-[13px] text-term-dim">
              Nenhuma execução aberta. Execute uma ação ou escolha uma execução recente.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
