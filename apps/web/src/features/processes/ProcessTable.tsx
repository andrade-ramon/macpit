import type { ProcessInfo } from '@macpit/shared';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef, useState } from 'react';
import { fmtBytes, fmtNum } from '../../lib/format';
import { type Row, type SortDir, type SortKey } from './processRows';

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
      className={`border-0 bg-transparent p-0 font-[inherit] ${right ? 'text-right' : 'text-left'}`}
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
      className="process-table mx-6 mb-5 min-h-0 flex-1 overflow-auto"
    >
      <div className="min-w-[330px]">
        <div role="row" className="process-columns table-head grid items-center gap-3">
          {head('pid', 'PID', true)}
          {head('name', 'Nome')}
          {head('cpuPct', 'CPU %', true)}
          {head('rssBytes', 'Memória', true)}
          <span className="process-row-action" />
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
                className={`process-columns data-row absolute inset-x-0 grid items-center gap-3 ${dimmed ? 'opacity-40' : ''}`}
                style={{
                  height: rowH,
                  transform: `translateY(${vi.start}px)`,
                  background: selected ? 'var(--accent-soft)' : undefined,
                  boxShadow: selected ? 'inset 3px 0 0 var(--accent)' : undefined,
                }}
              >
                <span className="text-right font-mono text-[12.5px] text-text3">{p.pid}</span>
                <button
                  className="truncate border-0 bg-transparent p-0 text-left font-medium"
                  style={{ paddingLeft: depth * 16 }}
                  title={p.path}
                  aria-label={`Ver detalhes de ${p.name}, PID ${p.pid}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(p.pid);
                  }}
                >
                  {depth > 0 && <span className="text-text3">└ </span>}
                  {p.name}
                  {p.pid === selfPid && (
                    <span className="ml-2 rounded-[5px] bg-accent-soft px-1.5 py-px text-[10.5px] font-semibold text-accent">
                      este painel
                    </span>
                  )}
                </button>
                <span className="text-right font-mono text-[13px] font-medium" style={{ color: cpuColor(p.cpuPct) }}>
                  {fmtNum(p.cpuPct)}
                </span>
                <span className="text-right font-mono text-[13px] text-text2">{fmtBytes(p.rssBytes)}</span>
                <span className="process-row-action flex justify-end gap-1.5">
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
