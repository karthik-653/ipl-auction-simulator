import { useId, useState } from "react";

const SERIES_STYLES = [
  { color: "var(--chart-1)", dash: "", marker: "circle" },
  { color: "var(--chart-2)", dash: "7 4", marker: "square" },
  { color: "var(--chart-3)", dash: "2 4", marker: "diamond" },
  { color: "var(--chart-4)", dash: "10 3 2 3", marker: "triangle" },
];

const W = 640;
const H = 320;
const M = { l: 56, r: 18, t: 16, b: 46 };

const niceTicks = (lo, hi, n = 5) => {
  const step = (hi - lo) / n;
  return Array.from({ length: n + 1 }, (_, i) => lo + step * i);
};

const fmt = (v) =>
  Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);

function Marker({ kind, x, y, color }) {
  const r = 4.5;
  if (kind === "square")
    return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} fill={color} />;
  if (kind === "diamond")
    return <polygon points={`${x},${y - r - 1} ${x + r + 1},${y} ${x},${y + r + 1} ${x - r - 1},${y}`} fill={color} />;
  if (kind === "triangle")
    return <polygon points={`${x},${y - r - 1} ${x + r + 1},${y + r} ${x - r - 1},${y + r}`} fill={color} />;
  return <circle cx={x} cy={y} r={r} fill={color} />;
}

/**
 * Lightweight themed SVG line chart. All colours are CSS variables, so the
 * chart follows light/dark mode with no JS. Series use different dash
 * patterns and markers so meaning never depends on colour alone.
 *
 * series: [{ name, points:[{x,y}], step? }]
 * lines:  [{ axis:'x'|'y', value, label }]   reference thresholds
 * marker: { x, y, label }                    highlighted point
 */
export default function Chart({
  title,
  series,
  xLabel,
  yLabel,
  xDomain,
  yDomain,
  lines = [],
  marker,
  xFormat = fmt,
  yFormat = fmt,
  height = H,
}) {
  const uid = useId();
  const [hover, setHover] = useState(null);

  const [x0, x1] = xDomain;
  const [y0, y1] = yDomain;
  const sx = (x) => M.l + ((x - x0) / (x1 - x0)) * (W - M.l - M.r);
  const sy = (y) => height - M.b - ((y - y0) / (y1 - y0)) * (height - M.t - M.b);
  const clampY = (y) => Math.min(y1, Math.max(y0, y));

  const path = (s) => {
    const pts = s.points;
    if (!pts.length) return "";
    if (!s.step) return pts.map((p, i) => `${i ? "L" : "M"}${sx(p.x)},${sy(clampY(p.y))}`).join(" ");
    let d = `M${sx(pts[0].x)},${sy(clampY(pts[0].y))}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` L${sx(pts[i].x)},${sy(clampY(pts[i - 1].y))} L${sx(pts[i].x)},${sy(clampY(pts[i].y))}`;
    }
    return d;
  };

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const x = x0 + ((px - M.l) / (W - M.l - M.r)) * (x1 - x0);
    if (x < x0 || x > x1) return setHover(null);
    setHover(x);
  };

  const nearest = (s, x) =>
    s.points.reduce((best, p) => (Math.abs(p.x - x) < Math.abs(best.x - x) ? p : best), s.points[0]);

  const hoverRows =
    hover === null
      ? []
      : series.filter((s) => s.points.length).map((s, i) => ({ s, i, p: nearest(s, hover) }));

  return (
    <figure className="chart" aria-label={title}>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        aria-label={`${title}. ${yLabel} versus ${xLabel}.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <title>{title}</title>
        {niceTicks(y0, y1).map((t) => (
          <g key={`y${t}`}>
            <line x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} stroke="var(--chart-grid)" />
            <text x={M.l - 8} y={sy(t) + 4} textAnchor="end" fill="var(--chart-axis)" fontSize="11">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {niceTicks(x0, x1).map((t) => (
          <g key={`x${t}`}>
            <line x1={sx(t)} x2={sx(t)} y1={M.t} y2={height - M.b} stroke="var(--chart-grid)" strokeOpacity="0.5" />
            <text x={sx(t)} y={height - M.b + 16} textAnchor="middle" fill="var(--chart-axis)" fontSize="11">
              {xFormat(t)}
            </text>
          </g>
        ))}
        <line x1={M.l} x2={W - M.r} y1={height - M.b} y2={height - M.b} stroke="var(--chart-axis)" />
        <line x1={M.l} x2={M.l} y1={M.t} y2={height - M.b} stroke="var(--chart-axis)" />
        <text x={(M.l + W - M.r) / 2} y={height - 8} textAnchor="middle" fill="var(--chart-axis)" fontSize="12">
          {xLabel}
        </text>
        <text transform={`translate(14 ${(M.t + height - M.b) / 2}) rotate(-90)`} textAnchor="middle" fill="var(--chart-axis)" fontSize="12">
          {yLabel}
        </text>

        {lines.map((l, i) =>
          l.axis === "x" ? (
            <g key={i}>
              <line x1={sx(l.value)} x2={sx(l.value)} y1={M.t} y2={height - M.b} stroke="var(--danger)" strokeDasharray="4 4" />
              <text x={sx(l.value) + 4} y={M.t + 11} fill="var(--danger)" fontSize="11">{l.label}</text>
            </g>
          ) : (
            <g key={i}>
              <line x1={M.l} x2={W - M.r} y1={sy(l.value)} y2={sy(l.value)} stroke="var(--danger)" strokeDasharray="4 4" />
              <text x={W - M.r - 4} y={sy(l.value) - 5} textAnchor="end" fill="var(--danger)" fontSize="11">{l.label}</text>
            </g>
          ),
        )}

        {series.map((s, i) => {
          const st = SERIES_STYLES[i % SERIES_STYLES.length];
          return (
            <path key={s.name} d={path(s)} fill="none" stroke={st.color} strokeWidth="2.5" strokeDasharray={st.dash} strokeLinejoin="round" />
          );
        })}

        {marker && (
          <g>
            <circle cx={sx(marker.x)} cy={sy(clampY(marker.y))} r="7" fill="none" stroke="var(--text-strong)" strokeWidth="2" />
            <text x={sx(marker.x)} y={sy(clampY(marker.y)) - 12} textAnchor="middle" fill="var(--text-strong)" fontSize="12" fontWeight="700">
              {marker.label}
            </text>
          </g>
        )}

        {hover !== null && (
          <g pointerEvents="none">
            <line x1={sx(hover)} x2={sx(hover)} y1={M.t} y2={height - M.b} stroke="var(--text-muted)" strokeDasharray="2 3" />
            {hoverRows.map(({ s, i, p }) => (
              <Marker key={s.name} kind={SERIES_STYLES[i % 4].marker} x={sx(p.x)} y={sy(clampY(p.y))} color={SERIES_STYLES[i % 4].color} />
            ))}
          </g>
        )}
      </svg>

      <div className="chart-legend" aria-hidden={series.length < 2}>
        {series.map((s, i) => {
          const st = SERIES_STYLES[i % 4];
          return (
            <span key={s.name} className="chart-legend-item">
              <svg width="34" height="12" aria-hidden="true">
                <line x1="1" x2="26" y1="6" y2="6" stroke={st.color} strokeWidth="2.5" strokeDasharray={st.dash} />
                <Marker kind={st.marker} x={29} y={6} color={st.color} />
              </svg>
              {s.name}
            </span>
          );
        })}
      </div>

      <div className="chart-readout" aria-live="polite" id={`${uid}-readout`}>
        {hover === null ? (
          <span className="muted">Hover or touch the chart to read exact values.</span>
        ) : (
          <>
            <strong>{xLabel}: {xFormat(hover)}</strong>
            {hoverRows.map(({ s, p }) => (
              <span key={s.name}>{s.name}: {yFormat(p.y)}</span>
            ))}
          </>
        )}
      </div>
    </figure>
  );
}
