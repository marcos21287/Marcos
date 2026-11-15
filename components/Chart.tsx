import type { Point } from "@/lib/yahoo";
import { money } from "@/lib/format";

interface Props {
  points: Point[];
  currency: string;
  range: string;
  alert?: number | null;
}

export function Chart({ points, currency, range, alert }: Props) {
  if (points.length < 2) return <p className="empty">No hay datos para este periodo.</p>;
  const values = points.map((p) => p.c);
  const first = values[0];
  const last = values[values.length - 1];
  const showAlert = typeof alert === "number" && Math.abs(alert - last) / last < 0.6;
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (showAlert) {
    lo = Math.min(lo, alert);
    hi = Math.max(hi, alert);
  }
  const pad = (hi - lo) * 0.1 || last * 0.01;
  lo -= pad;
  hi += pad;
  const y = (v: number) => ((hi - v) / (hi - lo)) * 240;
  const line = points.map((p, i) => `${i ? "L" : "M"}${((i * 600) / (points.length - 1)).toFixed(1)} ${y(p.c).toFixed(1)}`).join(" ");
  const color = last >= first ? "var(--up)" : "var(--down)";
  const fmt = (t: number) => {
    const d = new Date(t);
    if (range === "1D") return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    if (range === "5A") return d.toLocaleDateString("es-ES", { month: "short", year: "numeric" });
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  };
  const ticks = [0, 1, 2, 3, 4].map((i) => hi - ((hi - lo) * i) / 4);
  const xs = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const frac = showAlert ? (hi - alert) / (hi - lo) : 0;
  return (
    <div>
      <div className="chart">
        <div className="chart-plot">
          <svg
            role="img"
            aria-label={`Evolución del precio: de ${money(first, currency)} a ${money(last, currency)}`}
            viewBox="0 0 600 240"
            preserveAspectRatio="none"
          >
            <path d="M0 60H600M0 120H600M0 180H600" stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <path d={`${line} L600 240 L0 240 Z`} fill={color} fillOpacity="0.08" />
            <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {showAlert && (
              <line x1="0" x2="600" y1={frac * 240} y2={frac * 240} stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          {showAlert && (
            <span className="chart-alert" style={{ top: `${Math.max(0, frac * 100 - 9)}%` }}>
              Alerta · {money(alert, currency)}
            </span>
          )}
        </div>
        <div className="chart-y" aria-hidden="true">
          {ticks.map((t, i) => (
            <span key={i}>{money(t, currency)}</span>
          ))}
        </div>
      </div>
      <div className="chart-x" aria-hidden="true">
        {xs.map((i) => (
          <span key={i}>{fmt(points[i].t)}</span>
        ))}
      </div>
    </div>
  );
}
