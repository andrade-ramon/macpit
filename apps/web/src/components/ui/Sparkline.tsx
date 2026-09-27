interface SparklineProps {
  values: readonly number[];
  /** Topo da escala; padrão = maior valor da série. */
  max?: number;
  /** Cor do traço e da área (padrão: destaque). */
  color?: string;
  label?: string;
}

/** Mini-gráfico de área em SVG que ocupa a altura do contêiner (design: área 14% + linha 1,5px). */
export function Sparkline({ values, max, color = 'var(--accent)', label }: SparklineProps) {
  const W = 100;
  const H = 30;
  const top = Math.max(max ?? 0, ...values, 1e-9);
  const n = values.length;
  const pts = values.map((v, i) => {
    const x = n === 1 ? W : (i / (n - 1)) * W;
    const y = H - (Math.min(v, top) / top) * H;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className="block h-full w-full"
      style={{ color }}
    >
      {n > 1 && (
        <>
          <polygon points={`0,${H} ${pts.join(' ')} ${W},${H}`} fill="currentColor" opacity={0.14} />
          <polyline
            points={pts.join(' ')}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}
