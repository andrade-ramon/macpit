import type { ProcessInfo } from '@macpit/shared';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef, useState } from 'react';
import { fmtBytes, fmtDur, fmtNum } from '../../lib/format';
import { stateLabel, type Row, type SortDir, type SortKey } from './processRows';

const COLS = '76px minmax(200px,1.4fr) 110px 84px 96px 110px 90px minmax(220px,2fr) 120px';

export const cpuColor = (c: number) => (c >= 80 ? 'var(--danger)' : c >= 30 ? 'var(--warn)' : 'var(--text)');
export const stateColor = (s: string) =>
  s.startsWith('Z') ? 'var(--danger)' : s.startsWith('R') ? 'var(--ok)' : 'var(--text3)';

/** Altura da linha: `--row` (44px confortável, 36px compacta), lida do CSS. */
function useRowHeight(): number {
  const read = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--row'), 10) || 44;
  const [h, setH] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setH(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-density'] });
    return () => mo.disconnect();
  }, []);
  return h;
}

interface Props {
  rows: Row[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  selectedPid: number | undefined;
  onSelect: (pid: number) => void;
  onKill: (p: ProcessInfo) => void;
  selfPid: number | undefined;
}

export function ProcessTable({ rows, sortKey, sortDir, onSort, selectedPid, onSelect, onKill, selfPid }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowH = useRowHeight();
  // eslint-disable-next-line react-hooks/incompatible-library -- API do TanStack Virtual; o componente não é memoizado
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowH,
    overscan: 12,
  });
  useEffect(() => virtualizer.measure(), [rowH, virtualizer]);

  const head = (key: SortKey, label: string, right = false) => (
    <button
      onClick={() => onSort(key)}
      className={`border-0 bg-transparent p-0 font-[inherit] uppercase ${right ? 'text-right' : 'text-left'}`}
      style={{ color: sortKey === key ? 'var(--accent)' : 'var(--text3)', letterSpacing: 'inherit' }}
    >
      {label}
      {sortKey === key && (key === 'cpuPct' || key === 'rssBytes') && ` ${sortDir === 'asc' ? '↑' : '↓'}`}
    </button>
  );

  return (
    <div
      ref={scrollRef}
      role="grid"
      aria-rowcount={rows.length}
      className="mx-6 mb-5 min-h-0 flex-1 overflow-auto rounded-[14px] border border-line bg-panel"
    >
      <div className="min-w-[1180px]">
        <div role="row" className="table-head grid items-center gap-3" style={{ gridTemplateColumns: COLS }}>
          {head('pid', 'PID', true)}
          {head('name', 'Nome')}
          <span>Usuário</span>
          {head('cpuPct', 'CPU', true)}
          {head('rssBytes', 'Memória', true)}
          <span>Estado</span>
          <span className="text-right">Tempo</span>
          <span>Comando</span>
          <span />
        </div>
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const { p, depth, dimmed } = rows[vi.index]!;
            const selected = p.pid === selectedPid;
            return (
              <div
                key={p.pid}
                role="row"
                aria-selected={selected}
                onClick={() => onSelect(p.pid)}
                className={`data-row absolute inset-x-0 grid items-center gap-3 ${dimmed ? 'opacity-40' : ''}`}
                style={{
                  gridTemplateColumns: COLS,
                  height: rowH,
                  transform: `translateY(${vi.start}px)`,
                  background: selected ? 'var(--accent-soft)' : undefined,
                  boxShadow: selected ? 'inset 3px 0 0 var(--accent)' : undefined,
                }}
              >
                <span className="text-right font-mono text-[12.5px] text-text3">{p.pid}</span>
                <span className="truncate font-medium" style={{ paddingLeft: depth * 16 }} title={p.path}>
                  {depth > 0 && <span className="text-text3">└ </span>}
                  {p.name}
                  {p.pid === selfPid && (
                    <span className="ml-2 rounded-[5px] bg-accent-soft px-1.5 py-px text-[10.5px] font-semibold text-accent">
                      este painel
                    </span>
                  )}
                </span>
                <span
                  className="truncate text-[13px]"
                  style={{ color: p.user === 'root' ? 'var(--danger)' : 'var(--text2)' }}
                >
                  {p.user}
                </span>
                <span className="text-right font-mono text-[13px] font-medium" style={{ color: cpuColor(p.cpuPct) }}>
                  {fmtNum(p.cpuPct)}
                </span>
                <span className="text-right font-mono text-[13px] text-text2">{fmtBytes(p.rssBytes)}</span>
                <span
                  className="flex items-center gap-1.5 text-[13px]"
                  style={{ color: stateColor(p.state) }}
                  title={p.state}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: stateColor(p.state) }} />
                  {stateLabel(p.state)}
                </span>
                <span className="text-right font-mono text-[12.5px] text-text3">{fmtDur(p.elapsedSec)}</span>
                <span className="truncate font-mono text-xs text-text3" title={p.command}>
                  {p.command}
                </span>
                <span className="flex justify-end gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onKill(p);
                    }}
                    disabled={p.pid <= 1 || p.pid === selfPid}
                    className="btn btn-sm btn-danger"
                  >
                    Encerrar
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
