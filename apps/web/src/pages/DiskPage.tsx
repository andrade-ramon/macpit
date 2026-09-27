import type { DiskRange, DiskVolume } from '@macpit/shared';
import { useState } from 'react';
import { useLayout } from '../components/layout/LayoutContext';
import { Workspace } from '../components/layout/Workspace';
import { Segmented } from '../components/ui/Switch';
import { DiskExplorer } from '../features/disk/DiskExplorer';
import { DiskHistoryChart, growthPerDay } from '../features/disk/DiskHistoryChart';
import { usageLevel } from '../features/disk/diskUtils';
import { useDisk, useDiskHistory, useDiskSettings } from '../features/disk/useDisk';
import { fmtBytes, fmtNum } from '../lib/format';

const LEVEL_COLOR = { ok: 'var(--ok)', warn: 'var(--warn)', alert: 'var(--danger)' } as const;
const RANGES: Array<{ value: DiskRange; label: string }> = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
];

function AlertSetting({ value }: { value: number }) {
  const save = useDiskSettings();
  const [draft, setDraft] = useState<string>();
  const shown = draft ?? String(value);
  const n = Number(shown);
  const valid = Number.isInteger(n) && n >= 50 && n <= 99;
  return (
    <form
      className="tile flex flex-col gap-2.5 p-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save.mutate({ alertPct: n }, { onSuccess: () => setDraft(undefined) });
      }}
    >
      <label htmlFor="alert-pct" className="eyebrow">
        Alerta de uso
      </label>
      <div className="flex items-center gap-2">
        <input
          id="alert-pct"
          type="number"
          min={50}
          max={99}
          value={shown}
          onChange={(e) => setDraft(e.target.value)}
          className="h-10 w-20 rounded-[9px] border border-line2 bg-bg px-3 text-center font-mono text-[15px]"
        />
        <span className="text-text2">% de uso</span>
        <button
          type="submit"
          className="btn btn-md btn-primary ml-auto h-10 rounded-[9px]"
          disabled={!valid || draft === undefined || save.isPending}
        >
          Salvar
        </button>
      </div>
      {save.error && <p className="m-0 text-xs text-danger">{save.error.message}</p>}
      <p className="m-0 text-xs text-text3">Aviso amarelo 10 pontos antes; notificação do macOS ao passar.</p>
    </form>
  );
}

export function DiskPage() {
  const { data, error } = useDisk();
  const { showRail } = useLayout();
  const [selected, setSelected] = useState<string>();
  const [range, setRange] = useState<DiskRange>('24h');
  const [explore, setExplore] = useState<{ path?: string; n: number }>({ n: 0 });

  const volumes = data?.volumes ?? [];
  const current = volumes.find((v) => v.mount === selected) ?? volumes[0];
  const { data: history, error: histError } = useDiskHistory(current?.mount, range);
  const { data: day } = useDiskHistory(current?.mount, '24h');

  if (error) return <p className="p-6 text-danger">Falha ao carregar discos: {error.message}</p>;
  if (!data || !current) return <p className="p-6 text-text3">Carregando discos…</p>;

  const { alertPct } = data.settings;
  const alerts = volumes.filter((v) => v.alert);
  const level = (v: DiskVolume) => LEVEL_COLOR[usageLevel(v.usedPct, alertPct)];
  const select = (v: DiskVolume) => {
    setSelected(v.mount);
    showRail('right');
  };

  const growth = growthPerDay(day);
  const eta = current.alert
    ? 'já passou'
    : growth && growth > 0
      ? `${Math.max(1, Math.round(((alertPct / 100) * current.totalBytes - current.usedBytes) / growth))} dias`
      : undefined;

  const left = (
    <>
      <div>
        <div className="eyebrow mb-2">Volumes</div>
        <div className="flex flex-col gap-2">
          {volumes.map((v) => {
            const active = v.mount === current.mount;
            return (
              <button
                key={v.mount}
                onClick={() => select(v)}
                aria-pressed={active}
                className="flex flex-col gap-2.5 rounded-xl border p-3.5 text-left"
                style={{
                  borderColor: active ? 'var(--accent)' : 'var(--line)',
                  background: active ? 'var(--accent-soft)' : 'var(--panel)',
                }}
              >
                <div className="flex w-full items-baseline gap-2">
                  <span className="font-semibold">{v.name}</span>
                  <span className="flex-1 truncate font-mono text-[11.5px] text-text3">{v.mount}</span>
                  <span className="font-mono text-lg font-semibold" style={{ color: level(v) }}>
                    {fmtNum(v.usedPct)}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-panel3">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, v.usedPct)}%`, background: level(v) }}
                  />
                </div>
                <div className="text-[12.5px] text-text2">
                  <span className="text-text">{fmtBytes(v.availableBytes, 0)} livres</span> de{' '}
                  {fmtBytes(v.totalBytes, 0)}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <AlertSetting key={alertPct} value={alertPct} />
    </>
  );

  const right = (
    <>
      <div>
        <div className="eyebrow">Volume selecionado</div>
        <h2 className="m-0 mt-0.5 text-xl font-semibold tracking-[-0.01em]">{current.name}</h2>
        <div className="font-mono text-[12.5px] text-text2">{current.mount}</div>
      </div>
      <div className="flex items-baseline gap-2.5">
        <span
          className="font-mono text-5xl font-semibold leading-none tracking-[-0.03em]"
          style={{ color: level(current) }}
        >
          {fmtNum(current.usedPct)}%
        </span>
        <span className="text-[13px] text-text2">em uso</span>
      </div>
      <div className="h-3.5 overflow-hidden rounded-full bg-panel3">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, current.usedPct)}%`, background: level(current) }}
        />
      </div>
      <dl className="tile m-0 grid grid-cols-3 gap-3 p-3.5">
        <div>
          <dt className="text-[11.5px] text-text3">Usados</dt>
          <dd className="m-0 font-mono text-[15px] font-medium">{fmtBytes(current.usedBytes, 0)}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] text-text3">Livres</dt>
          <dd className="m-0 font-mono text-[15px] font-medium">{fmtBytes(current.availableBytes, 0)}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] text-text3">Total</dt>
          <dd className="m-0 font-mono text-[15px] font-medium">{fmtBytes(current.totalBytes, 0)}</dd>
        </div>
      </dl>
      <div className="tile flex flex-col gap-1.5 p-3.5">
        <span className="eyebrow">Tendência (24h)</span>
        {growth === undefined ? (
          <span className="text-[12.5px] text-text2">Ainda sem amostras suficientes nas últimas 24h.</span>
        ) : (
          <>
            <span className="text-[15px] font-medium">
              {growth >= 0 ? '+' : '−'}
              {fmtBytes(Math.abs(growth))} por dia
            </span>
            <span className="text-[12.5px] text-text2">
              {eta ? (
                <>
                  No ritmo atual, chega ao alerta de {alertPct}% em <strong className="text-text">{eta}</strong>.
                </>
              ) : (
                'Uso estável ou caindo: sem previsão de chegar ao alerta.'
              )}
            </span>
          </>
        )}
      </div>
      <button
        onClick={() => setExplore((e) => ({ path: current.mount === '/' ? '~' : current.mount, n: e.n + 1 }))}
        className="btn btn-lg w-full"
      >
        Analisar maiores pastas deste volume
      </button>
    </>
  );

  const minutes = history ? Math.round(history.sampleIntervalMs / 60_000) : 5;

  return (
    <Workspace
      label="Disco"
      left={left}
      right={right}
      mainClassName="flex flex-col gap-4 overflow-auto px-6 pb-6 pt-[18px]"
    >
      <div className="flex items-center gap-3.5">
        <h1 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">Disco</h1>
        <span className="text-[13px] text-text3">{current.name}</span>
        <div className="ml-auto">
          <Segmented value={range} options={RANGES} onChange={setRange} label="Período" />
        </div>
      </div>
      {alerts.map((v) => (
        <div
          key={v.mount}
          role="alert"
          className="flex items-center gap-3 rounded-xl border border-danger bg-danger-soft px-4 py-3 text-[13.5px]"
        >
          <span className="dot" style={{ background: 'var(--danger)' }} />
          <span>
            <strong className="font-semibold">{v.name}</strong> está com {fmtNum(v.usedPct)}% de uso (
            {fmtBytes(v.availableBytes, 0)} livres)
          </span>
          {v.mount !== current.mount && (
            <button onClick={() => select(v)} className="btn ml-auto h-[34px]">
              Ver volume
            </button>
          )}
        </div>
      ))}
      <section className="card flex flex-col gap-3">
        <div className="flex items-baseline gap-3">
          <span className="card-title">Histórico de uso — {current.name}</span>
          <span className="text-xs text-text3">amostra a cada {minutes} min</span>
        </div>
        {histError && <p className="m-0 text-sm text-danger">{histError.message}</p>}
        {history && history.points.length < 2 ? (
          <p className="m-0 text-[13px] text-text3">
            Ainda sem histórico suficiente. Uma amostra é gravada a cada {minutes} min enquanto o macpit estiver
            rodando.
          </p>
        ) : (
          <div className="h-[260px]">
            {history && <DiskHistoryChart history={history} alertPct={alertPct} range={range} />}
          </div>
        )}
      </section>
      <DiskExplorer key={explore.n} initialPath={explore.path} />
    </Workspace>
  );
}

export default DiskPage;
