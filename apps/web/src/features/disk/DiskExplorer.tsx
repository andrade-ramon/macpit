import { useEffect, useState } from 'react';
import { fmtBytes } from '../../lib/format';
import { breadcrumbs, parentPath } from './diskUtils';
import { useDiskUsage } from './useDisk';

/** Quantas subpastas mostrar antes de "Mostrar todas". */
const LIST_LIMIT = 50;

const SHORTCUTS = [
  { label: '~ Home', path: '~' },
  { label: 'Aplicativos', path: '/Applications' },
  { label: 'Biblioteca', path: '/Library' },
  { label: 'Usuários', path: '/Users' },
];

/** Tempo decorrido enquanto a análise roda (du pode demorar em pastas grandes). */
function useElapsed(active: boolean) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    const t = setInterval(() => setSec(Math.floor((Date.now() - start) / 1000)), 500);
    return () => {
      clearInterval(t);
      setSec(0);
    };
  }, [active]);
  return sec;
}

/** "Maiores pastas" (du), navegável. `initialPath` já analisa ao montar (ex.: "Analisar este volume"). */
export function DiskExplorer({ initialPath }: { initialPath?: string }) {
  const [path, setPath] = useState<string | undefined>(initialPath);
  const [input, setInput] = useState(initialPath ?? '~');
  const [refresh, setRefresh] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const { data, error, isFetching } = useDiskUsage(path, refresh);
  const elapsed = useElapsed(isFetching);

  const go = (p: string) => {
    setRefresh(0);
    setShowAll(false);
    setPath(p);
    setInput(p);
  };
  // o servidor devolve o caminho real (com ~ e symlinks resolvidos)
  const current = data?.path;
  const max = data?.entries[0]?.sizeBytes ?? 1;
  const parent = current ? parentPath(current) : undefined;

  return (
    <section className="card flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="card-title">Maiores pastas</span>
        {data && !isFetching && (
          <span className="ml-auto text-xs text-text3">
            {fmtBytes(data.totalBytes)} ·{' '}
            {data.cached
              ? `em cache (${new Date(data.computedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})`
              : `${(data.durationMs / 1000).toFixed(1)}s`}
          </span>
        )}
        {data && !isFetching && (
          <button onClick={() => setRefresh(Date.now())} className="btn h-[34px]">
            ↻ Recalcular
          </button>
        )}
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) go(input.trim());
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Pasta a analisar"
          placeholder="/caminho ou ~/pasta"
          className="h-[42px] min-w-[260px] flex-1 rounded-[10px] border border-line2 bg-bg px-3.5 font-mono text-[13.5px]"
        />
        <button type="submit" className="btn btn-primary h-[42px] rounded-[10px] px-[18px]" disabled={isFetching}>
          Analisar
        </button>
        {SHORTCUTS.map((s) => (
          <button
            key={s.path}
            type="button"
            onClick={() => go(s.path)}
            className="btn h-[42px] rounded-[10px] px-3.5"
            disabled={isFetching}
          >
            {s.label}
          </button>
        ))}
      </form>

      {!path && (
        <p className="m-0 text-[13px] text-text3">
          Escolha uma pasta. A análise usa <code>du</code> e pode levar alguns segundos em pastas grandes.
        </p>
      )}
      {isFetching && (
        <p className="m-0 text-[13px] text-text2">
          Analisando {input}… {elapsed > 0 && `${elapsed}s`}
        </p>
      )}
      {error && !isFetching && <p className="m-0 text-[13px] text-danger">{error.message}</p>}

      {data && current && !isFetching && (
        <>
          <div className="flex flex-wrap items-center gap-1.5 text-[13.5px]">
            {breadcrumbs(current).map((c, i, all) => (
              <span key={c.path} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-text3">›</span>}
                {i === all.length - 1 ? (
                  <span className="px-1.5 py-1 font-semibold">{c.label}</span>
                ) : (
                  <button
                    onClick={() => go(c.path)}
                    className="rounded-md border-0 bg-transparent px-1.5 py-1 text-text2 hover:bg-panel2"
                  >
                    {c.label}
                  </button>
                )}
              </span>
            ))}
          </div>
          {data.partial && (
            <p className="m-0 text-xs text-warn">
              Algumas pastas não puderam ser lidas (sem permissão) — os tamanhos são um mínimo.
            </p>
          )}

          <div className="flex flex-col overflow-hidden rounded-xl border border-line">
            {parent && (
              <button
                onClick={() => go(parent)}
                className="flex h-10 items-center border-0 bg-bg px-3.5 text-left text-[13px] text-text2 hover:bg-panel2"
              >
                ↑ pasta acima
              </button>
            )}
            {(showAll ? data.entries : data.entries.slice(0, LIST_LIMIT)).map((e, i) => (
              <button
                key={e.path}
                onClick={() => go(e.path)}
                className={`relative grid h-11 grid-cols-[1fr_64px_110px] items-center gap-3 border-0 bg-bg px-3.5 text-left hover:bg-panel2 ${
                  i > 0 || parent ? 'border-t border-solid border-line' : ''
                }`}
              >
                <span
                  className="absolute inset-y-0 left-0 bg-accent-soft"
                  style={{ width: `${(e.sizeBytes / max) * 100}%` }}
                  aria-hidden
                />
                <span className="relative truncate font-medium">
                  {e.name}
                  <span className="font-normal text-text3"> /</span>
                </span>
                <span className="relative text-right font-mono text-[12.5px] text-text3">
                  {data.totalBytes ? `${Math.round((e.sizeBytes / data.totalBytes) * 100)}%` : ''}
                </span>
                <span className="relative text-right font-mono text-[13.5px] font-medium">{fmtBytes(e.sizeBytes)}</span>
              </button>
            ))}
            {!showAll && data.entries.length > LIST_LIMIT && (
              <button
                onClick={() => setShowAll(true)}
                className="h-10 border-0 border-t border-solid border-line bg-bg px-3.5 text-left text-[13px] text-accent hover:bg-panel2"
              >
                Mostrar todas as {data.entries.length} pastas (
                {fmtBytes(data.entries.slice(LIST_LIMIT).reduce((s, e) => s + e.sizeBytes, 0))} nas demais)
              </button>
            )}
            {data.looseBytes > 0 && (
              <div className="grid h-10 grid-cols-[1fr_64px_110px] items-center gap-3 border-t border-line bg-bg px-3.5 text-[13px] text-text3">
                <span>Arquivos soltos nesta pasta</span>
                <span />
                <span className="text-right font-mono">{fmtBytes(data.looseBytes)}</span>
              </div>
            )}
            {data.entries.length === 0 && data.looseBytes === 0 && (
              <div className="px-3.5 py-3 text-[13px] text-text3">Pasta vazia.</div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
