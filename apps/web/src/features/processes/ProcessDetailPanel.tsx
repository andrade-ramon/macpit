import type { KillSignal, OpenFile, ProcessInfo } from '@macpit/shared';
import { useState } from 'react';
import { ApiError } from '../../lib/api';
import { fmtBytes, fmtDur, fmtNum } from '../../lib/format';
import { cpuColor } from './ProcessTable';
import { stateLabel } from './processRows';
import { TailViewer } from './TailViewer';
import { useProcessDetail } from './useProcesses';

export const SIGNALS: Record<KillSignal, { label: string; hint: string }> = {
  TERM: { label: 'Encerrar', hint: 'SIGTERM — pede para o processo terminar de forma limpa.' },
  KILL: { label: 'Forçar encerramento de', hint: 'SIGKILL — mata na hora, sem chance de limpeza.' },
  INT: { label: 'Interromper', hint: 'SIGINT — equivalente a Ctrl+C.' },
  HUP: { label: 'Recarregar', hint: 'SIGHUP — muitos daemons recarregam a configuração.' },
};

function Rel({ kind, p, onSelect }: { kind: 'pai' | 'filho'; p: ProcessInfo; onSelect: (pid: number) => void }) {
  return (
    <button onClick={() => onSelect(p.pid)} className="list-row">
      <span className="w-9 text-[11px] text-text3">{kind}</span>
      <span className="w-12 text-right font-mono text-xs text-text3">{p.pid}</span>
      <span className="flex-1 truncate">{p.name}</span>
      {kind === 'filho' && <span className="font-mono text-xs text-text2">{fmtNum(p.cpuPct)}%</span>}
    </button>
  );
}

function FileRow({ f, primary, onTail }: { f: OpenFile; primary: boolean; onTail?: () => void }) {
  return (
    <div className="tile flex items-center gap-2.5 rounded-[10px] px-2.5 py-2">
      <span className="font-mono text-[11px] text-text3">{f.fd}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs" title={f.name}>
        {f.name}
      </span>
      {onTail && (
        <button onClick={onTail} className={`btn btn-sm ${primary ? 'btn-primary' : ''}`}>
          {primary ? 'Acompanhar ao vivo' : 'Acompanhar'}
        </button>
      )}
    </div>
  );
}

interface Props {
  pid: number;
  selfPid: number | undefined;
  result?: string;
  onClose: () => void;
  onSelect: (pid: number) => void;
  onAskKill: (p: ProcessInfo, signal: KillSignal) => void;
}

/** Coluna de detalhes: sinais, métricas, comando, hierarquia e logs (acompanhar ao vivo). */
export function ProcessDetailPanel({ pid, selfPid, result, onClose, onSelect, onAskKill }: Props) {
  const { data, error, isPending } = useProcessDetail(pid);
  const [tail, setTail] = useState<string>();
  const gone = error instanceof ApiError && error.status === 404;
  const p = data?.process;
  const protectedPid = pid <= 1 || pid === selfPid;

  if (p && tail) return <TailViewer pid={pid} path={tail} onClose={() => setTail(undefined)} />;

  const logs = data?.files.filter((f) => f.looksLikeLog) ?? [];
  const others = data?.files.filter((f) => !f.looksLikeLog) ?? [];

  return (
    <>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Processo selecionado</div>
          <h2 className="m-0 mt-0.5 truncate text-xl font-semibold tracking-[-0.01em]">{p?.name ?? `PID ${pid}`}</h2>
          <div className="font-mono text-[12.5px] text-text2">
            PID {pid}
            {p && ` · ${p.user} · ${stateLabel(p.state)}`}
          </div>
        </div>
        <button onClick={onClose} aria-label="Fechar detalhes" className="btn btn-icon">
          ✕
        </button>
      </div>

      {isPending && <p className="m-0 text-sm text-text3">Carregando…</p>}
      {gone && <p className="m-0 text-sm text-warn">O processo terminou.</p>}
      {error && !gone && <p className="m-0 text-sm text-danger">{error.message}</p>}

      {p && !gone && (
        <>
          <div className="flex flex-wrap items-start gap-2">
            <button
              onClick={() => onAskKill(p, 'TERM')}
              disabled={protectedPid}
              title="SIGTERM — pede para o processo terminar de forma limpa"
              className="btn btn-danger"
            >
              Encerrar <span className="font-mono text-[11px] font-normal opacity-70">TERM</span>
            </button>
            <details className="min-w-0">
              <summary className="cursor-pointer px-2 py-2 text-sm text-text2">Mais sinais</summary>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => onAskKill(p, 'KILL')}
                  disabled={protectedPid}
                  title="SIGKILL — mata na hora, sem chance de limpeza"
                  className="btn btn-danger"
                >
                  Forçar <span className="font-mono text-[11px] font-medium opacity-70">KILL</span>
                </button>
                <button
                  onClick={() => onAskKill(p, 'INT')}
                  disabled={protectedPid}
                  title="SIGINT — equivalente a Ctrl+C"
                  className="btn btn-md rounded-[11px]"
                >
                  Interromper <span className="font-mono text-[11px] opacity-60">INT</span>
                </button>
                <button
                  onClick={() => onAskKill(p, 'HUP')}
                  disabled={protectedPid}
                  title="SIGHUP — muitos daemons recarregam a configuração"
                  className="btn btn-md rounded-[11px]"
                >
                  Recarregar <span className="font-mono text-[11px] opacity-60">HUP</span>
                </button>
              </div>
            </details>
          </div>
          {protectedPid && (
            <p className="m-0 text-[12.5px] text-text3">
              {pid === selfPid ? 'Este é o próprio macpit.' : 'Processo protegido.'}
            </p>
          )}
          {result && (
            <div
              role="status"
              className="rounded-[10px] bg-accent-soft px-3 py-2.5 text-[13px] font-medium text-accent"
            >
              {result}
            </div>
          )}

          <dl className="m-0 grid grid-cols-3 gap-3 border-y border-line py-3.5">
            <div>
              <dt className="text-[11.5px] text-text3">CPU</dt>
              <dd className="m-0 font-mono text-[15px] font-medium" style={{ color: cpuColor(p.cpuPct) }}>
                {fmtNum(p.cpuPct)}%
              </dd>
            </div>
            <div>
              <dt className="text-[11.5px] text-text3">Memória</dt>
              <dd className="m-0 font-mono text-[15px] font-medium">{fmtBytes(p.rssBytes)}</dd>
            </div>
            <div>
              <dt className="text-[11.5px] text-text3">% da RAM</dt>
              <dd className="m-0 font-mono text-[15px] font-medium">{fmtNum(p.memPct)}%</dd>
            </div>
            <div>
              <dt className="text-[11.5px] text-text3">Rodando há</dt>
              <dd className="m-0 text-[13.5px]">{fmtDur(p.elapsedSec)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[11.5px] text-text3">Início</dt>
              <dd className="m-0 text-[13.5px]">{new Date(p.startedAt).toLocaleString('pt-BR')}</dd>
            </div>
          </dl>

          <div>
            <div className="eyebrow mb-1.5">Comando</div>
            <pre className="term-box max-h-[120px] overflow-auto">{p.command}</pre>
          </div>

          {(data.parent || data.children.length > 0) && (
            <div>
              <div className="eyebrow mb-1.5">Hierarquia</div>
              <div className="flex flex-col gap-0.5">
                {data.parent && <Rel kind="pai" p={data.parent} onSelect={onSelect} />}
                {data.children.map((c) => (
                  <Rel key={c.pid} kind="filho" p={c} onSelect={onSelect} />
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="eyebrow mb-1.5">Logs e saídas</div>
            <div className="flex flex-col gap-1.5">
              {logs.map((f, i) => (
                <FileRow
                  key={`${f.fd}-${f.name}`}
                  f={f}
                  primary={i === 0}
                  onTail={f.tailable ? () => setTail(f.name) : undefined}
                />
              ))}
              {logs.length === 0 && (
                <p className="m-0 text-[13px] text-text3">Nenhum arquivo de log aberto por este processo.</p>
              )}
            </div>
          </div>

          {others.length > 0 && (
            <details>
              <summary className="eyebrow cursor-pointer">Outros arquivos e conexões ({others.length})</summary>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {others.map((f, i) => (
                  <FileRow
                    key={`${f.fd}-${i}`}
                    f={f}
                    primary={false}
                    onTail={f.tailable ? () => setTail(f.name) : undefined}
                  />
                ))}
              </div>
            </details>
          )}
          {data.filesError && <p className="m-0 text-xs text-text3">{data.filesError}</p>}
        </>
      )}
    </>
  );
}
