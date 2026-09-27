import type { TailChunk, TailCreated } from '@macpit/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { getWsClient } from '../../lib/ws';

/** Limite exibido: mantém só o final para não pesar o navegador. */
const MAX_CHARS = 512 * 1024;

type Status = { kind: 'connecting' } | { kind: 'live' } | { kind: 'error'; message: string };

export function TailViewer({ pid, path, onClose }: { pid: number; path: string; onClose: () => void }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'connecting' });
  const [follow, setFollow] = useState(true);
  const [notice, setNotice] = useState<string>();
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    api<TailCreated>('/api/tails', { method: 'POST', body: JSON.stringify({ pid, path }) })
      .then(({ channel }) => {
        if (cancelled) return;
        setStatus({ kind: 'live' });
        off = getWsClient().subscribe(channel, (data) => {
          const { chunk, reset, truncated } = data as TailChunk;
          if (truncated) setNotice('arquivo truncado ou rotacionado — exibindo desde o início');
          setText((prev) => {
            const next = reset ? chunk : prev + chunk;
            return next.length > MAX_CHARS ? next.slice(next.length - MAX_CHARS) : next;
          });
        });
      })
      .catch((err: Error) => !cancelled && setStatus({ kind: 'error', message: err.message }));
    return () => {
      cancelled = true;
      off?.();
    };
  }, [pid, path]);

  useLayoutEffect(() => {
    const el = preRef.current;
    if (follow && el) el.scrollTop = el.scrollHeight;
  }, [text, follow]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <button onClick={onClose} className="btn btn-sm">
          ← Voltar
        </button>
        <span className="eyebrow">Log ao vivo</span>
        <span className={`ml-auto text-xs ${status.kind === 'live' ? 'text-accent' : 'text-text3'}`}>
          {status.kind === 'live' ? '● ao vivo' : status.kind === 'connecting' ? 'conectando…' : ''}
        </span>
      </div>
      <code className="truncate text-xs text-text2" title={path}>
        {path}
      </code>
      <div className="flex items-center gap-3 text-xs text-text2">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={follow}
            onChange={(e) => setFollow(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          seguir o final
        </label>
        <button onClick={() => setText('')} className="btn btn-sm ml-auto">
          Limpar
        </button>
      </div>
      {status.kind === 'error' && <p className="m-0 text-sm text-danger">{status.message}</p>}
      {notice && <p className="m-0 text-xs text-warn">{notice}</p>}
      <pre
        ref={preRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          if (atBottom !== follow) setFollow(atBottom);
        }}
        className="term-box min-h-[240px] flex-1 overflow-auto leading-relaxed"
      >
        {text || <span className="text-term-dim">(sem conteúdo ainda)</span>}
      </pre>
    </div>
  );
}
