import type { DiskHistory, DiskRange } from '@macpit/shared';
import { useId } from 'react';

const W = 1000;
const H = 260;
const L = 44;
const B = 24;

function tick(ts: number, range: DiskRange) {
  const d = new Date(ts);
  return range === '24h'
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/** Gráfico de área do uso (%) com a linha tracejada do alerta — SVG do design, sem biblioteca. */
export function DiskHistoryChart({
  history,
  alertPct,
  range,
  color = 'var(--info)',
}: {
  history: DiskHistory;
  alertPct: number;
  range: DiskRange;
  color?: string;
}) {
  const gid = useId().replace(/:/g, '');
  const points = history.points.map((p) => ({ ts: p.ts, pct: (p.usedBytes / p.totalBytes) * 100 }));
  const n = points.length;
  const xs = (i: number) => L + (i / Math.max(1, n - 1)) * (W - L - 8);
  const ys = (p: number) => 10 + (1 - p / 100) * (H - B - 10);
  const line = points.map((p, i) => `${xs(i)},${ys(p.pct)}`).join(' ');
  const labelIdx = n > 1 ? [...new Set([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (n - 1))))] : [];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Uso do disco — ${range}`}
      className="block h-full w-full"
    >
      <defs>
        <linearGradient id={gid} x1={0} y1={0} x2={0} y2={1}>
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - 8} y1={ys(v)} y2={ys(v)} stroke="var(--line)" />
          <text
            x={L - 8}
            y={ys(v) + 4}
            fill="var(--text3)"
            fontSize={11}
            textAnchor="end"
            fontFamily="var(--font-mono)"
          >
            {v}%
          </text>
        </g>
      ))}
      {labelIdx.map((i, k) => (
        <text
          key={k}
          x={xs(i)}
          y={H - 6}
          fill="var(--text3)"
          fontSize={11}
          textAnchor="middle"
          fontFamily="var(--font-mono)"
        >
          {tick(points[i]!.ts, range)}
        </text>
      ))}
      <line x1={L} x2={W - 8} y1={ys(alertPct)} y2={ys(alertPct)} stroke="var(--danger)" strokeDasharray="5 5" />
      <text
        x={W - 12}
        y={ys(alertPct) - 6}
        fill="var(--danger)"
        fontSize={11}
        textAnchor="end"
        fontFamily="var(--font-mono)"
      >
        alerta {alertPct}%
      </text>
      {n > 1 && (
        <>
          <polygon points={`${xs(0)},${ys(0)} ${line} ${xs(n - 1)},${ys(0)}`} fill={`url(#${gid})`} />
          <polyline points={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </>
      )}
    </svg>
  );
}

/** Crescimento em bytes/dia entre a primeira e a última amostra (`undefined` sem dados suficientes). */
export function growthPerDay(history: DiskHistory | undefined): number | undefined {
  const pts = history?.points ?? [];
  if (pts.length < 2) return undefined;
  const first = pts[0]!;
  const last = pts.at(-1)!;
  const days = (last.ts - first.ts) / 86_400_000;
  if (days <= 0) return undefined;
  return (last.usedBytes - first.usedBytes) / days;
}
