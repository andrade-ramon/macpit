import type { ProcessInfo } from '@macpit/shared';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Workspace } from '../components/layout/Workspace';
import { Sparkline } from '../components/ui/Sparkline';
import { useRunAction } from '../features/actions/RunLauncher';
import { useActions, useStopService } from '../features/actions/useActions';
import { usageLevel } from '../features/disk/diskUtils';
import { useDisk } from '../features/disk/useDisk';
import { useProcesses } from '../features/processes/useProcesses';
import { useDock } from '../features/terminal/DockContext';
import { serviceStyle } from '../features/terminal/runStyle';
import { useHealth } from '../hooks/useHealth';
import { useSystem } from '../hooks/useSystem';
import { fmtBytes, fmtNum, fmtUptime } from '../lib/format';

export const LEVEL_COLOR = { ok: 'var(--ok)', warn: 'var(--warn)', alert: 'var(--danger)' } as const;
export const cpuColor = (c: number) => (c >= 80 ? 'var(--danger)' : c >= 30 ? 'var(--warn)' : 'var(--text)');

function StatCard({
  title,
  aside,
  value,
  unit,
  valueColor,
  sub,
  children,
}: {
  title: string;
  aside: ReactNode;
  value: string;
  unit?: string;
  valueColor?: string;
  sub: string;
  children: ReactNode;
}) {
  return (
    <section className="card flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="card-title">{title}</span>
        <span className="text-xs text-text3">{aside}</span>
      </div>
      <div className="flex items-baseline gap-2.5">
        <span
          className="num text-[40px] font-semibold leading-none tracking-[-0.03em]"
          style={valueColor ? { color: valueColor } : undefined}
        >
          {value}
          {unit && <span className="text-xl text-text3">{unit}</span>}
        </span>
        <span className="text-[13px] text-text2">{sub}</span>
      </div>
      <div className="h-16">{children}</div>
    </section>
  );
}

function Attention({ color, title, sub, onClick }: { color: string; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="tile flex items-start gap-3 p-3 text-left hover:border-line2">
      <span className="dot mt-1.5" style={{ background: color }} />
      <span>
        <strong className="font-semibold">{title}</strong>
        <span className="block text-[12.5px] text-text2">{sub}</span>
      </span>
    </button>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const dock = useDock();
  const { data: health } = useHealth();
  const { current, history, error } = useSystem();
  const { data: disk } = useDisk();
  const { data: procs } = useProcesses();
  const { data: actions } = useActions();
  const stopService = useStopService();

  const processes = procs?.processes ?? [];
  const top = [...processes].sort((a, b) => b.cpuPct - a.cpuPct).slice(0, 8);
  const services = (actions ?? []).filter((a) => a.persistent && a.service);
  const favorites = (actions ?? []).filter((a) => a.favorite && !a.persistent).slice(0, 5);
  const alertPct = disk?.settings.alertPct ?? 90;
  const root = disk?.volumes.find((v) => v.mount === '/') ?? disk?.volumes[0];
  const alerts = disk?.volumes.filter((v) => v.alert) ?? [];

  const selectProc = (p: ProcessInfo) => navigate(`/processes?pid=${p.pid}`);
  const run = useRunAction();

  // "Atenção agora": discos no alerta, serviços sem resposta/caindo e processos zumbis
  const attention: Array<{ key: string; color: string; title: string; sub: string; go: () => void }> = [
    ...alerts.map((v) => ({
      key: `d:${v.mount}`,
      color: 'var(--danger)',
      title: `${v.name} com ${fmtNum(v.usedPct, 0)}% de uso`,
      sub: `${fmtBytes(v.availableBytes, 0)} livres · acima do alerta de ${alertPct}%`,
      go: () => navigate('/disk'),
    })),
    ...services
      .filter((a) => a.service!.state === 'unhealthy' || a.service!.state === 'restarting')
      .map((a) => ({
        key: `s:${a.id}`,
        color: 'var(--warn)',
        title: `${a.name} ${a.service!.state === 'unhealthy' ? 'sem resposta' : 'reiniciando'}`,
        sub:
          a.service!.state === 'unhealthy'
            ? `porta ${a.service!.port ?? a.expectedPort ?? '—'} não aceita conexão`
            : (a.service!.lastExit ?? 'caiu e vai reiniciar'),
        go: () => navigate(`/actions?sel=${a.id}`),
      })),
    ...processes
      .filter((p) => p.state.startsWith('Z'))
      .slice(0, 3)
      .map((p) => ({
        key: `p:${p.pid}`,
        color: 'var(--warn)',
        title: `${p.name} virou zumbi`,
        sub: `PID ${p.pid} · ${p.command}`,
        go: () => selectProc(p),
      })),
  ];

  const left = (
    <>
      <div>
        <div className="eyebrow mb-2.5">Este Mac</div>
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 text-[13px]">
          <dt className="text-text3">Host</dt>
          <dd className="m-0 truncate font-mono">{health?.hostname ?? '—'}</dd>
          <dt className="text-text3">Chip</dt>
          <dd className="m-0">{current ? `${current.cpu.model} · ${current.cpu.cores} núcleos` : '—'}</dd>
          <dt className="text-text3">Memória</dt>
          <dd className="m-0">{current ? fmtBytes(current.memory.totalBytes, 0) : '—'}</dd>
          <dt className="text-text3">Ligado há</dt>
          <dd className="m-0">{current ? fmtUptime(current.uptimeSec) : '—'}</dd>
          <dt className="text-text3">Usuário</dt>
          <dd className="m-0 font-mono">{health?.user ?? '—'}</dd>
          <dt className="text-text3">Versão</dt>
          <dd className="m-0 font-mono">{health ? `v${health.version}` : '—'}</dd>
        </dl>
      </div>
      <div>
        <div className="eyebrow mb-2.5">Atenção agora</div>
        <div className="flex flex-col gap-2">
          {attention.map((a) => (
            <Attention key={a.key} color={a.color} title={a.title} sub={a.sub} onClick={a.go} />
          ))}
          {attention.length === 0 && (
            <div className="tile flex items-center gap-3 p-3 text-[13px] text-text2">
              <span className="dot" style={{ background: 'var(--ok)' }} />
              Tudo certo por aqui.
            </div>
          )}
        </div>
      </div>
    </>
  );

  const right = (
    <>
      <div>
        <div className="mb-2.5 flex items-baseline justify-between">
          <span className="eyebrow">Serviços</span>
          <span className="text-xs text-text3">
            {services.filter((a) => a.service!.state !== 'stopped').length} de {services.length} ativos
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {services.map((a) => {
            const b = serviceStyle(a.service!);
            return (
              <div key={a.id} className="tile flex items-center gap-3 py-3 pl-3.5 pr-3">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${a.service!.state === 'up' ? 'anim-pulse' : ''}`}
                  style={{ background: b.dot }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{a.name}</div>
                  <div className="font-mono text-xs text-text2">{b.text}</div>
                </div>
                {b.active ? (
                  <>
                    {a.service!.runId && (
                      <button onClick={() => dock.openRun(a.service!.runId!)} className="btn">
                        Terminal
                      </button>
                    )}
                    <button onClick={() => stopService.mutate(a.id)} className="btn btn-danger">
                      Parar
                    </button>
                  </>
                ) : (
                  <button onClick={() => run(a)} className="btn btn-primary px-3.5">
                    ▶ Iniciar
                  </button>
                )}
              </div>
            );
          })}
          {services.length === 0 && (
            <p className="m-0 text-[13px] text-text3">
              Nenhum serviço. Marque uma ação como “serviço” (ex.: túnel SSH) para acompanhá-la aqui.
            </p>
          )}
        </div>
      </div>
      <div>
        <div className="eyebrow mb-2.5">Ações favoritas</div>
        <div className="flex flex-col gap-2">
          {favorites.map((a) => (
            <div key={a.id} className="tile flex items-center gap-3 px-3 py-2.5">
              <span className="w-6 text-center text-lg">{a.icon || '▶'}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{a.name}</div>
                <div className="truncate font-mono text-xs text-text3">{a.command}</div>
              </div>
              <button onClick={() => run(a)} className="btn btn-primary shrink-0 px-3.5">
                ▶ Executar
              </button>
            </div>
          ))}
          {favorites.length === 0 && (
            <p className="m-0 text-[13px] text-text3">Marque ações como favoritas (★) para executá-las daqui.</p>
          )}
        </div>
      </div>
    </>
  );

  return (
    <Workspace
      label="Visão geral"
      left={left}
      right={right}
      mainClassName="flex flex-col gap-5 overflow-auto px-7 py-6"
    >
      <div className="flex items-baseline gap-3.5">
        <h1 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">Visão geral</h1>
        <span className="text-[13px] text-text3">
          atualizado a cada {Math.round((health?.sampleIntervalMs ?? 2000) / 1000)} s
        </span>
      </div>
      {error && <p className="text-danger">Falha ao carregar métricas: {error.message}</p>}
      {!current && !error && <p className="text-text3">Coletando métricas…</p>}
      {current && (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
            <StatCard
              title="CPU"
              aside="5 min"
              value={fmtNum(current.cpu.usagePct)}
              unit="%"
              sub={`usuário ${fmtNum(current.cpu.userPct)} · sistema ${fmtNum(current.cpu.systemPct)}`}
            >
              <Sparkline
                values={history.map((h) => h.cpu.usagePct)}
                max={100}
                color="var(--accent)"
                label="Uso de CPU nos últimos 5 minutos"
              />
            </StatCard>
            <StatCard
              title="Memória"
              aside="5 min"
              value={fmtNum(current.memory.usedPct)}
              unit="%"
              sub={`${fmtBytes(current.memory.usedBytes)} de ${fmtBytes(current.memory.totalBytes, 0)}`}
            >
              <Sparkline
                values={history.map((h) => h.memory.usedPct)}
                max={100}
                color="var(--info)"
                label="Uso de memória nos últimos 5 minutos"
              />
            </StatCard>
            <StatCard
              title="Carga"
              aside="1 · 5 · 15 min"
              value={fmtNum(current.load[0], 2)}
              sub={`${fmtNum(current.load[1], 2)} · ${fmtNum(current.load[2], 2)} · ${
                current.load[0] > current.cpu.cores ? 'acima' : 'dentro'
              } da capacidade (${current.cpu.cores})`}
            >
              <Sparkline
                values={history.map((h) => h.load[0])}
                max={current.cpu.cores}
                color={current.load[0] > current.cpu.cores ? 'var(--danger)' : 'var(--warn)'}
                label="Load average de 1 minuto"
              />
            </StatCard>
            {root ? (
              <StatCard
                title={`Disco · ${root.name}`}
                aside={
                  <button onClick={() => navigate('/disk')} className="link-btn">
                    ver discos →
                  </button>
                }
                value={fmtNum(root.usedPct)}
                unit="%"
                valueColor={LEVEL_COLOR[usageLevel(root.usedPct, alertPct)]}
                sub={`${fmtBytes(root.availableBytes, 0)} livres de ${fmtBytes(root.totalBytes, 0)}`}
              >
                <div className="flex h-full flex-col justify-end gap-2">
                  <div className="h-2.5 overflow-hidden rounded-full bg-panel3">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, root.usedPct)}%`,
                        background: LEVEL_COLOR[usageLevel(root.usedPct, alertPct)],
                      }}
                    />
                  </div>
                  <span className="text-xs text-text3">
                    alerta em {alertPct}%
                    {alerts.length > 0 &&
                      ` · ${alerts.map((v) => `${v.name} já passou (${fmtNum(v.usedPct, 0)}%)`).join(' · ')}`}
                  </span>
                </div>
              </StatCard>
            ) : (
              <section className="card" />
            )}
          </div>

          <div className="grid grid-cols-[2fr_1fr] gap-4">
            <MemoryComposition memory={current.memory} />
            <section className="card flex flex-col gap-2.5">
              <span className="card-title">Swap</span>
              <span className="num text-[28px] font-semibold leading-none tracking-[-0.02em]">
                {fmtBytes(current.swap.usedBytes)}
              </span>
              <span className="text-[13px] text-text2">
                {current.swap.totalBytes > 0 ? `de ${fmtBytes(current.swap.totalBytes)} alocados` : 'sem swap em uso'}
              </span>
            </section>
          </div>
        </>
      )}

      <section className="card flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="card-title">Maior consumo agora</span>
          <button onClick={() => navigate('/processes')} className="link-btn">
            todos os processos →
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
          {top.map((p) => (
            <button
              key={p.pid}
              onClick={() => selectProc(p)}
              className="grid h-9 grid-cols-[1fr_64px_80px] items-center gap-3 rounded-lg border-0 bg-transparent px-2.5 text-left hover:bg-panel2"
            >
              <span className="truncate">
                {p.name} <span className="font-mono text-xs text-text3">{p.pid}</span>
              </span>
              <span className="text-right font-mono text-[13px]" style={{ color: cpuColor(p.cpuPct) }}>
                {fmtNum(p.cpuPct)}%
              </span>
              <span className="text-right font-mono text-[13px] text-text2">{fmtBytes(p.rssBytes)}</span>
            </button>
          ))}
          {top.length === 0 && <p className="text-[13px] text-text3">Carregando processos…</p>}
        </div>
      </section>
    </Workspace>
  );
}

function MemoryComposition({ memory }: { memory: NonNullable<ReturnType<typeof useSystem>['current']>['memory'] }) {
  const segs = [
    { label: 'Apps', value: memory.appBytes, color: 'var(--info)' },
    { label: 'Wired', value: memory.wiredBytes, color: '#a78bfa' },
    { label: 'Comprimida', value: memory.compressedBytes, color: 'var(--warn)' },
    { label: 'Cache', value: Math.min(memory.cachedBytes, memory.freeBytes), color: 'var(--text3)' },
  ];
  return (
    <section className="card flex flex-col gap-3.5">
      <span className="card-title">Composição da memória</span>
      <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full bg-panel3">
        {segs.map((s) => (
          <div
            key={s.label}
            title={`${s.label} ${fmtBytes(s.value)}`}
            style={{ width: `${(s.value / memory.totalBytes) * 100}%`, background: s.color }}
          />
        ))}
      </div>
      <ul className="m-0 grid list-none grid-cols-4 gap-3 p-0 text-[13px]">
        {segs.map((s) => (
          <li key={s.label}>
            <span className="flex items-center gap-2 text-text2">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
              {s.label}
            </span>
            <strong className="num block text-lg font-semibold">{fmtBytes(s.value)}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
