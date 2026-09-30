import type { PortEntry } from '@macpit/shared';
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useLayout } from '../components/layout/LayoutContext';
import { PageTitle, RailEmpty, Workspace } from '../components/layout/Workspace';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { SearchInput } from '../components/ui/Switch';
import { describeBindings, filterPorts, portUrl, type PortFilter } from '../features/ports/portFilters';
import { usePorts } from '../features/ports/usePorts';
import { useKillProcess } from '../features/processes/useProcesses';
import { useHealth } from '../hooks/useHealth';

const COLS = '96px 64px 200px minmax(240px,1fr) 90px 110px 300px';
const keyOf = (e: PortEntry) => `${e.protocol}-${e.port}-${e.pid}`;

const scopeStyle = (e: PortEntry) =>
  e.scope === 'network'
    ? { label: 'rede', bg: 'rgba(242,183,74,.16)', color: 'var(--warn)' }
    : { label: 'local', bg: 'var(--panel3)', color: 'var(--text2)' };

function ScopeButton({
  active,
  onClick,
  dot,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  dot?: string;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="flex h-11 items-center justify-between rounded-[10px] border px-3.5 text-left font-medium"
      style={{
        borderColor: active ? 'var(--accent)' : 'var(--line2)',
        background: active ? 'var(--accent-soft)' : 'transparent',
      }}
    >
      <span className="flex items-center gap-2">
        {dot && <span className="dot" style={{ background: dot }} />}
        {label}
      </span>
      <span className="font-mono text-text2">{count}</span>
    </button>
  );
}

function ProtoButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="h-9 flex-1 rounded-[9px] border font-medium"
      style={{
        borderColor: active ? 'var(--accent)' : 'var(--line2)',
        background: active ? 'var(--accent-soft)' : 'transparent',
      }}
    >
      {children}
    </button>
  );
}

export function PortsPage() {
  const { data, error } = usePorts();
  const { data: health } = useHealth();
  const { showRail } = useLayout();
  const navigate = useNavigate();
  const kill = useKillProcess();
  const [params, setParams] = useSearchParams();
  const [rest, setRest] = useState<Omit<PortFilter, 'query'>>({ protocol: 'all', scope: 'all' });
  // A busca mora na URL (`?q=`), para a paleta ⌘K e links diretos.
  const q = params.get('q') ?? '';
  const filter: PortFilter = useMemo(() => ({ query: q, ...rest }), [q, rest]);
  const setQuery = (query: string) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (query) p.set('q', query);
        else p.delete('q');
        return p;
      },
      { replace: true },
    );
  const [selected, setSelected] = useState<string>();
  const [target, setTarget] = useState<PortEntry>();
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();

  const all = useMemo(() => data?.entries ?? [], [data]);
  const rows = useMemo(() => filterPorts(all, filter), [all, filter]);
  const sel = all.find((e) => keyOf(e) === selected);
  const select = (e: PortEntry) => {
    setSelected(keyOf(e));
    showRail('right');
  };
  const goProcess = (e: PortEntry) => navigate(`/processes?pid=${e.pid}`);
  const isSelf = (e: PortEntry) => e.pid === health?.pid;

  const confirmKill = () => {
    if (!target) return;
    kill.mutate(
      { pid: target.pid, signal: 'TERM' },
      {
        onSuccess: () => {
          setMessage({
            ok: true,
            text: `SIGTERM enviado para ${target.command} (PID ${target.pid}), porta ${target.port}.`,
          });
          if (selected === keyOf(target)) setSelected(undefined);
        },
        onError: (e) => setMessage({ ok: false, text: e.message }),
        onSettled: () => setTarget(undefined),
      },
    );
  };

  const setRestKey = <K extends keyof typeof rest>(k: K, v: (typeof rest)[K]) => setRest((r) => ({ ...r, [k]: v }));

  const left = (
    <>
      <div>
        <div className="eyebrow mb-2">Escopo</div>
        <div className="flex flex-col gap-1.5">
          <ScopeButton
            active={rest.scope === 'all'}
            onClick={() => setRestKey('scope', 'all')}
            label="Todas"
            count={all.length}
          />
          <ScopeButton
            active={rest.scope === 'network'}
            onClick={() => setRestKey('scope', 'network')}
            dot="var(--warn)"
            label="Expostas na rede"
            count={all.filter((e) => e.scope === 'network').length}
          />
          <ScopeButton
            active={rest.scope === 'local'}
            onClick={() => setRestKey('scope', 'local')}
            dot="var(--text3)"
            label="Só locais"
            count={all.filter((e) => e.scope === 'local').length}
          />
        </div>
      </div>
      <div>
        <div className="eyebrow mb-2">Protocolo</div>
        <div className="flex gap-1.5">
          <ProtoButton active={rest.protocol === 'all'} onClick={() => setRestKey('protocol', 'all')}>
            TCP e UDP
          </ProtoButton>
          <ProtoButton active={rest.protocol === 'TCP'} onClick={() => setRestKey('protocol', 'TCP')}>
            TCP
          </ProtoButton>
          <ProtoButton active={rest.protocol === 'UDP'} onClick={() => setRestKey('protocol', 'UDP')}>
            UDP
          </ProtoButton>
        </div>
      </div>
      {data?.limited && (
        <div className="tile px-3.5 py-3 text-[12.5px] leading-[1.55] text-text2">
          Sem root, o <code>lsof</code> só enxerga portas de processos de{' '}
          <strong className="text-text">{health?.user}</strong>. Inicie com <code>sudo ./scripts/start.sh</code> para
          ver todas.
        </div>
      )}
    </>
  );

  const right = sel ? (
    <PortDetail
      e={sel}
      isSelf={isSelf(sel)}
      onClose={() => setSelected(undefined)}
      onProcess={() => goProcess(sel)}
      onFree={() => {
        setMessage(undefined);
        setTarget(sel);
      }}
    />
  ) : (
    <RailEmpty>
      Selecione uma porta para abrir no navegador,
      <br />
      ver o processo dono ou liberá-la.
    </RailEmpty>
  );

  return (
    <Workspace label="Portas" left={left} right={right} mainClassName="flex flex-col overflow-hidden">
      <div className="px-6 pb-3 pt-[18px]">
        <PageTitle
          title="Portas"
          sub={
            data
              ? `${rows.length === all.length ? all.length : `${rows.length} de ${all.length}`} em escuta`
              : undefined
          }
        />
        <div className="mt-4">
          <SearchInput
            value={q}
            onChange={setQuery}
            placeholder="Buscar por porta, processo ou comando…"
            label="Buscar portas"
          />
        </div>
      </div>
      {message && (
        <p role="status" className={`mx-6 mb-2 mt-0 text-sm ${message.ok ? 'text-accent' : 'text-danger'}`}>
          {message.text}
        </p>
      )}
      {error && <p className="mx-6 text-danger">Falha ao carregar portas: {error.message}</p>}
      {!data && !error && <p className="mx-6 text-text3">Carregando portas…</p>}
      {data && (
        <div className="mx-6 mb-5 min-h-0 flex-1 overflow-auto rounded-[14px] border border-line bg-panel">
          <div className="min-w-[1180px]">
            <div className="table-head grid items-center gap-3" style={{ gridTemplateColumns: COLS }}>
              <span className="text-right">Porta</span>
              <span>Proto</span>
              <span>Endereço</span>
              <span>Processo</span>
              <span className="text-right">PID</span>
              <span>Usuário</span>
              <span className="text-right">Ações</span>
            </div>
            {rows.length === 0 && <p className="px-4 py-6 text-center text-text3">Nenhuma porta encontrada.</p>}
            {rows.map((e) => {
              const url = portUrl(e);
              const sc = scopeStyle(e);
              const active = keyOf(e) === selected;
              return (
                <div
                  key={keyOf(e)}
                  onClick={() => select(e)}
                  className="data-row grid min-h-14 items-center gap-3 py-1.5"
                  style={{ gridTemplateColumns: COLS, background: active ? 'var(--accent-soft)' : undefined }}
                >
                  <span className="num text-right font-mono text-lg font-semibold">{e.port}</span>
                  <span className="font-mono text-xs text-text3">{e.protocol}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="rounded-md px-2 py-0.5 text-[11.5px] font-semibold"
                      style={{ background: sc.bg, color: sc.color }}
                      title={e.scope === 'network' ? 'Acessível por outras máquinas na rede' : 'Apenas loopback'}
                    >
                      {sc.label}
                    </span>
                    <span className="truncate font-mono text-xs text-text3">{describeBindings(e.bindings)}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{e.command}</span>
                    {e.commandLine && (
                      <span className="block truncate font-mono text-xs text-text3" title={e.commandLine}>
                        {e.commandLine}
                      </span>
                    )}
                  </span>
                  <span className="text-right font-mono text-[12.5px] text-text3">{e.pid}</span>
                  <span className="text-[13px]" style={{ color: e.user === 'root' ? 'var(--danger)' : 'var(--text2)' }}>
                    {e.user}
                  </span>
                  <span className="flex justify-end gap-1.5">
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(ev) => ev.stopPropagation()}
                        className="btn"
                        title={`Abrir ${url}`}
                      >
                        Abrir ↗
                      </a>
                    )}
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        goProcess(e);
                      }}
                      className="btn"
                    >
                      Processo
                    </button>
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setMessage(undefined);
                        setTarget(e);
                      }}
                      disabled={isSelf(e)}
                      className="btn btn-danger"
                    >
                      Liberar
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(target)}
        title={`Liberar a porta ${target?.port ?? ''}?`}
        hint={
          target &&
          `Isso encerra o processo ${target.command} (PID ${target.pid}) inteiro, não só a porta. SIGTERM — pede para o processo terminar de forma limpa.`
        }
        command={target?.commandLine || target?.command}
        isRoot={target?.user === 'root'}
        confirmLabel="Enviar SIGTERM"
        busy={kill.isPending}
        onConfirm={confirmKill}
        onCancel={() => setTarget(undefined)}
      />
    </Workspace>
  );
}

function PortDetail({
  e,
  isSelf,
  onClose,
  onProcess,
  onFree,
}: {
  e: PortEntry;
  isSelf: boolean;
  onClose: () => void;
  onProcess: () => void;
  onFree: () => void;
}) {
  const url = portUrl(e);
  const network = e.scope === 'network';
  return (
    <>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Porta selecionada</div>
          <h2 className="m-0 mt-0.5 font-mono text-[34px] font-semibold leading-[1.1] tracking-[-0.03em]">:{e.port}</h2>
          <div className="text-[13px] text-text2">
            {e.protocol} · {network ? 'exposta na rede' : 'só nesta máquina'}
          </div>
        </div>
        <button onClick={onClose} aria-label="Fechar detalhes" className="btn btn-icon">
          ✕
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-lg btn-primary w-full">
            Abrir {url} ↗
          </a>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onProcess} className="btn btn-lg">
            Ver processo
          </button>
          <button onClick={onFree} disabled={isSelf} className="btn btn-lg btn-danger-outline">
            Liberar a porta
          </button>
        </div>
        {isSelf && <p className="m-0 text-[12.5px] text-text3">Esta porta é do próprio macpit.</p>}
      </div>
      <dl className="tile m-0 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2.5 p-3.5 text-[13px]">
        <dt className="text-text3">Processo</dt>
        <dd className="m-0 font-medium">
          {e.command} <span className="font-mono text-text3">PID {e.pid}</span>
        </dd>
        <dt className="text-text3">Usuário</dt>
        <dd className="m-0" style={{ color: e.user === 'root' ? 'var(--danger)' : 'var(--text2)' }}>
          {e.user}
        </dd>
        <dt className="text-text3">Endereço</dt>
        <dd className="m-0 font-mono">
          {describeBindings(e.bindings)}:{e.port}
        </dd>
        <dt className="text-text3">Alcance</dt>
        <dd className="m-0">
          {network ? 'Acessível por outras máquinas na rede local' : 'Apenas loopback (127.0.0.1 / ::1)'}
        </dd>
      </dl>
      {e.commandLine && (
        <div>
          <div className="eyebrow mb-1.5">Linha de comando</div>
          <pre className="term-box">{e.commandLine}</pre>
        </div>
      )}
      <p className="m-0 text-[12.5px] leading-[1.55] text-text3">
        “Liberar a porta” encerra o processo inteiro (SIGTERM), não só a porta. Você confirma antes.
      </p>
    </>
  );
}
