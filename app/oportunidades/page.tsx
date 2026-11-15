"use client";
import Link from "next/link";
import { useState } from "react";
import { positionSize } from "@/lib/checks";
import { money, parseNumber, timeAgo } from "@/lib/format";
import { useStore } from "@/lib/store";
import { useFetch } from "@/lib/useFetch";
import type { Scan } from "@/lib/yahoo";

const FILTERS = ["Todas", "Ruptura", "Tendencia", "Sobreventa"] as const;

export default function Oportunidades() {
  const [state, update] = useStore();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Todas");
  const [capitalText, setCapitalText] = useState<string | null>(null);
  const { data, error, loading } = useFetch<Scan>("/api/opportunities");
  const rows = (data?.items ?? []).filter((o) => filter === "Todas" || o.signal.kind === filter);
  const setCapital = (text: string) => {
    setCapitalText(text);
    const v = parseNumber(text);
    if (v) update((s) => ({ ...s, capital: v }));
  };

  return (
    <>
      <div className="head">
        <div>
          <h1>Oportunidades</h1>
          <p className="muted">
            {data
              ? `Vigía ha revisado sola ${data.scanned} valores de España, Europa y EE. UU.: ${data.withSignal} cumplen hoy una señal y aquí están los ${data.items.length} mejores, con su chequeo de fundamentales y el tamaño de posición para tu capital.`
              : "Vigía revisa sola cientos de valores de España, Europa y EE. UU. y muestra los que hoy cumplen una señal."}
          </p>
        </div>
        {data && <span className="tag">Actualizado {timeAgo(data.at)}</span>}
      </div>

      <section aria-label="Tu plan" className="card pad plan">
        <div className="field">
          <label htmlFor="capital">Tu capital (€)</label>
          <input id="capital" inputMode="decimal" value={capitalText ?? String(state.capital)} onChange={(e) => setCapital(e.target.value)} />
        </div>
        <div className="field">
          <span id="riesgo">Riesgo por operación</span>
          <div role="group" aria-labelledby="riesgo" className="segmented">
            {[1, 2, 5].map((r) => (
              <button key={r} type="button" aria-pressed={state.risk === r} onClick={() => update((s) => ({ ...s, risk: r }))}>
                {r} %
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Pérdida máxima por operación</span>
          <span className="big">{money((state.capital * state.risk) / 100, "EUR")}</span>
        </div>
        <p className="muted grow">
          Cuanto más rápido quieras crecer, más riesgo por operación asumes. El tamaño sugerido limita cada pérdida a ese importe si salta el
          stop.
        </p>
      </section>

      <div role="group" aria-label="Tipo de señal" className="chips">
        {FILTERS.map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>

      {loading && <p className="card empty">Analizando cientos de valores… la primera vez puede tardar cerca de un minuto.</p>}
      {error && <p className="error">{error}</p>}
      {data && rows.length === 0 && <p className="card empty">Hoy no hay valores con esta señal.</p>}
      {data && data.failed > 0 && <p className="muted small">No se pudieron analizar {data.failed} valores.</p>}

      <div className="stack">
        {rows.map((o) => {
          const size = positionSize(state.capital, state.risk, o.entry, o.stop);
          return (
            <article key={o.symbol} className="card pad opp">
              <div className="opp-main">
                <div className="opp-title">
                  <span className="ticker dark">{o.symbol.replace(".MC", "")}</span>
                  <span className="strong">{o.name}</span>
                  <span className="tag blue">{o.signal.kind}</span>
                  {o.earningsSoon && <span className="tag">Resultados en menos de 10 días</span>}
                </div>
                <p className="muted">{o.signal.why}</p>
              </div>
              <dl className="stats">
                <div><dt>Chequeo</dt><dd>{o.passed} de {o.scored}</dd></div>
                <div><dt>RSI (14)</dt><dd>{o.rsi === null ? "—" : Math.round(o.rsi)}</dd></div>
                <div><dt>Ingresos</dt><dd>{o.revenueGrowth}</dd></div>
                <div><dt>Entrada</dt><dd>{money(o.entry, o.currency)}</dd></div>
                <div><dt>Stop</dt><dd className="down-text">{money(o.stop, o.currency)}</dd></div>
                <div><dt>Objetivo</dt><dd className="up-text">{money(o.target, o.currency)}</dd></div>
              </dl>
              <div className="opp-side">
                <div className="size">
                  <span className="muted small strong">Tamaño sugerido</span>
                  {size.shares > 0 ? (
                    <>
                      <span className="strong num">{size.shares} {size.shares === 1 ? "acción" : "acciones"} · {money(size.cost, o.currency)}</span>
                      <span className="muted small num">Pérdida si salta el stop: {money(size.maxLoss, o.currency)}</span>
                    </>
                  ) : (
                    <>
                      <span className="strong">Menos de 1 acción</span>
                      <span className="muted small">Necesitarías comprar fracciones</span>
                    </>
                  )}
                </div>
                <Link href={`/accion/${encodeURIComponent(o.symbol)}`} className="btn primary">Ver análisis</Link>
              </div>
            </article>
          );
        })}
      </div>
      <p className="muted small">
        Stop a 2 veces el rango medio diario (ATR) bajo la entrada; objetivo al doble de esa distancia. El tamaño no convierte divisas: para
        valores en dólares, el importe está en dólares.
      </p>
    </>
  );
}
