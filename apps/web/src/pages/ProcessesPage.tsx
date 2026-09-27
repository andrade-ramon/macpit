import type { KillSignal, ProcessInfo } from '@macpit/shared';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useLayout } from '../components/layout/LayoutContext';
import { PageTitle, RailEmpty, Workspace } from '../components/layout/Workspace';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Chip, SearchInput, Switch } from '../components/ui/Switch';
import { ProcessDetailPanel, SIGNALS } from '../features/processes/ProcessDetailPanel';
import { flatRows, treeRows, type SortDir, type SortKey } from '../features/processes/processRows';
import { cpuColor, ProcessTable } from '../features/processes/ProcessTable';
import { useKillProcess, useProcesses } from '../features/processes/useProcesses';
import { useHealth } from '../hooks/useHealth';
import { fmtBytes, fmtNum } from '../lib/format';

const DEFAULT_DIR: Record<SortKey, SortDir> = {
  pid: 'asc',
  name: 'asc',
  user: 'asc',
  cpuPct: 'desc',
  rssBytes: 'desc',
  elapsedSec: 'desc',
};
const SORT_LABEL: Record<SortKey, string> = {
  cpuPct: 'CPU',
  rssBytes: 'memória',
  pid: 'PID',
  name: 'nome',
  user: 'usuário',
  elapsedSec: 'tempo',
};

function Mini({
  p,
  active,
  value,
  color,
  onClick,
}: {
  p: ProcessInfo;
  active: boolean;
  value: string;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="list-row" style={active ? { background: 'var(--accent-soft)' } : undefined}>
      <span className="flex-1 truncate">{p.name}</span>
      <span className="font-mono text-[13px]" style={{ color: color ?? 'var(--text2)' }}>
        {value}
      </span>
    </button>
  );
}

export function ProcessesPage() {
  const { data, error } = useProcesses();
  const { data: health } = useHealth();
  const { showRail } = useLayout();
  const kill = useKillProcess();
  const [params, setParams] = useSearchParams();
  // A busca mora na URL (`?q=`): a paleta ⌘K e links diretos conseguem preenchê-la.
  const query = params.get('q') ?? '';
  const setQuery = (q: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (q) next.set('q', q);
        else next.delete('q');
        return next;
      },
      { replace: true },
    );
  const [user, setUser] = useState('');
  const [tree, setTree] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('cpuPct');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [confirm, setConfirm] = useState<{ p: ProcessInfo; signal: KillSignal }>();
  const [result, setResult] = useState<string>();

  const pidParam = Number(params.get('pid'));
  const selectedPid = Number.isInteger(pidParam) && pidParam > 0 ? pidParam : undefined;
  const select = (pid: number | undefined) => {
    setResult(undefined);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (pid === undefined) next.delete('pid');
      else next.set('pid', String(pid));
      return next;
    });
    if (pid !== undefined) showRail('right');
  };

  const processes = useMemo(() => data?.processes ?? [], [data]);
  const rows = useMemo(() => {
    const opts = { query, user, sortKey, sortDir };
    return tree ? treeRows(processes, opts) : flatRows(processes, opts);
  }, [processes, query, user, sortKey, sortDir, tree]);
  const byCpu = useMemo(() => [...processes].sort((a, b) => b.cpuPct - a.cpuPct).slice(0, 5), [processes]);
  const byMem = useMemo(() => [...processes].sort((a, b) => b.rssBytes - a.rssBytes).slice(0, 5), [processes]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDir(DEFAULT_DIR[key]);
    }
  };

  const send = () => {
    if (!confirm) return;
    const { p, signal } = confirm;
    kill.mutate(
      { pid: p.pid, signal },
      {
        onSuccess: () => {
          setResult(`SIG${signal} enviado para ${p.name} (PID ${p.pid}).`);
          if (p.pid !== selectedPid) select(p.pid);
        },
        onError: (e) => setResult(e.message),
        onSettled: () => setConfirm(undefined),
      },
    );
  };

  const totalCpu = processes.reduce((s, p) => s + p.cpuPct, 0);
  const me = health?.user;

  const left = (
    <>
      <div className="flex flex-col gap-2.5">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Nome, comando ou PID  ( / )"
          label="Buscar processos"
        />
        <div className="flex flex-wrap gap-1.5">
          <Chip active={user === ''} onClick={() => setUser('')}>
            Todos
          </Chip>
          {me && me !== 'root' && (
            <Chip active={user === me} onClick={() => setUser(me)}>
              {`Meus (${me})`}
            </Chip>
          )}
          <Chip active={user === 'root'} onClick={() => setUser('root')}>
            root
          </Chip>
        </div>
        <div className="tile flex h-[42px] items-center justify-between rounded-[10px] px-3">
          <span className="font-medium">Ver como árvore</span>
          <Switch checked={tree} onChange={setTree} label="Ver como árvore" />
        </div>
      </div>
      <div>
        <div className="eyebrow mb-2">Resumo</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="tile p-3">
            <div className="text-xs text-text3">Processos</div>
            <div className="num text-[22px] font-semibold">{processes.length}</div>
          </div>
          <div className="tile p-3">
            <div className="text-xs text-text3">CPU somada</div>
            <div className="num text-[22px] font-semibold">{totalCpu.toFixed(0)}%</div>
          </div>
        </div>
      </div>
      <div>
        <div className="eyebrow mb-2">Top CPU</div>
        <div className="flex flex-col gap-0.5">
          {byCpu.map((p) => (
            <Mini
              key={p.pid}
              p={p}
              active={p.pid === selectedPid}
              value={`${fmtNum(p.cpuPct)}%`}
              color={cpuColor(p.cpuPct)}
              onClick={() => select(p.pid)}
            />
          ))}
        </div>
      </div>
      <div>
        <div className="eyebrow mb-2">Top memória</div>
        <div className="flex flex-col gap-0.5">
          {byMem.map((p) => (
            <Mini
              key={p.pid}
              p={p}
              active={p.pid === selectedPid}
              value={fmtBytes(p.rssBytes)}
              onClick={() => select(p.pid)}
            />
          ))}
        </div>
      </div>
    </>
  );

  const right =
    selectedPid !== undefined ? (
      <ProcessDetailPanel
        key={selectedPid}
        pid={selectedPid}
        selfPid={data?.selfPid}
        result={result}
        onClose={() => select(undefined)}
        onSelect={select}
        onAskKill={(p, signal) => setConfirm({ p, signal })}
      />
    ) : (
      <RailEmpty>
        Selecione um processo na lista
        <br />
        para ver detalhes, hierarquia, logs
        <br />e encerrar com um clique.
      </RailEmpty>
    );

  const count =
    rows.length === processes.length ? `${processes.length} processos` : `${rows.length} de ${processes.length}`;

  return (
    <Workspace label="Processos" left={left} right={right} mainClassName="flex flex-col overflow-hidden">
      <div className="px-6 pb-3 pt-[18px]">
        <PageTitle title="Processos" sub={`${count} · ordenado por ${SORT_LABEL[sortKey]}`}>
          <span className="ml-auto text-xs text-text3">clique numa linha para ver detalhes e encerrar</span>
        </PageTitle>
      </div>
      {error && <p className="mx-6 text-danger">Falha ao carregar processos: {error.message}</p>}
      {!data && !error && <p className="mx-6 text-text3">Carregando processos…</p>}
      {data && rows.length === 0 && (
        <div className="mx-6 rounded-[14px] border border-dashed border-line2 p-6 text-center text-sm text-text2">
          Nenhum processo encontrado{query ? ` para “${query}”` : ''}
          {user ? ` do usuário ${user}` : ''}.
          <button
            onClick={() => {
              setQuery('');
              setUser('');
            }}
            className="btn btn-sm ml-3"
          >
            Limpar filtros
          </button>
        </div>
      )}
      {data && rows.length > 0 && (
        <ProcessTable
          rows={rows}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
          selectedPid={selectedPid}
          onSelect={select}
          onKill={(p) => setConfirm({ p, signal: 'TERM' })}
          selfPid={data.selfPid}
        />
      )}
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm ? `${SIGNALS[confirm.signal].label} ${confirm.p.name} (PID ${confirm.p.pid})?` : ''}
        hint={confirm && SIGNALS[confirm.signal].hint}
        command={confirm?.p.command}
        isRoot={confirm?.p.user === 'root'}
        confirmLabel={`Enviar SIG${confirm?.signal ?? ''}`}
        busy={kill.isPending}
        onConfirm={send}
        onCancel={() => setConfirm(undefined)}
      />
    </Workspace>
  );
}
