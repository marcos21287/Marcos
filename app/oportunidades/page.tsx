"use client";
import Link from "next/link";
import { useState } from "react";
import { positionSize } from "@/lib/checks";
import { money, parseNumber, plain, signedPct, timeAgo } from "@/lib/format";
import { useStore } from "@/lib/store";
import { useFetch } from "@/lib/useFetch";
import type { Quote, Scan } from "@/lib/yahoo";
import { Change } from "@/components/Change";

/** Sesiones de bolsa expresadas en semanas (5 sesiones por semana). */
function weeks(days: number | null): string {
  if (days === null) return "—";
  const w = days / 5;
  return w < 1.5 ? `${Math.round(days)} sesiones` : `unas ${Math.round(w)} semanas`;
}

const KINDS = ["Ruptura", "Tendencia", "Sobreventa"] as const;

export default function Oportunidades() {
  const [state, update] = useStore();
  const [capitalText, setCapitalText] = useState<string | null>(null);
  const { data, error, loading } = useFetch<Scan>("/api/opportunities");
  const rows = data?.items ?? [];
  // Precio en vivo de las 10 (el análisis se recalcula cada hora; el precio, cada minuto).
  const { data: quotes } = useFetch<Quote[]>(rows.length ? `/api/quotes?symbols=${encodeURIComponent(rows.map((o) => o.symbol).join(","))}` : null, 60_000);
  const live = new Map((quotes ?? []).map((q) => [q.symbol, q]));
  const setCapital = (text: string) => {
    setCapitalText(text);
    const v = parseNumber(text);
    if (v) update((s) => ({ ...s, capital: v }));
  };

  return (
    <>
      <div className="head">
        <div>
          <h1>Las 10 mejores oportunidades</h1>
          <p className="muted">
            {data
              ? `Vigía ha revisado sola ${data.scanned} valores de España, Europa y EE. UU.: ${data.withSignal} cumplen hoy una señal y estos son los ${data.items.length} con mejor nota, sumando la empresa y su entorno (macro global, país y sector).`
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

      {loading && <p className="card empty">Analizando cientos de valores… la primera vez puede tardar cerca de un minuto.</p>}
      {error && <p className="error">{error}</p>}
      {data && rows.length === 0 && <p className="card empty">Hoy ningún valor cumple una señal.</p>}
      {data && data.failed > 0 && <p className="muted small">No se pudieron analizar {data.failed} valores.</p>}

      <div className="stack">
        {rows.map((o, i) => {
          const size = positionSize(state.capital, state.risk, o.entry, o.stop);
          return (
            <article key={o.symbol} className="card pad opp">
              <div className="opp-main">
                <div className="opp-title">
                  <span className="rank">{i + 1}</span>
                  <span className="ticker dark">{o.symbol.replace(".MC", "")}</span>
                  <span className="strong">{o.name}</span>
                  <span className="tag blue">{o.signal.kind}</span>
                  {o.earningsSoon && <span className="tag">Resultados en menos de 10 días</span>}
                </div>
                <p className="muted">{o.signal.why}</p>
                <p className="muted small">{[o.country, o.sector, `RSI ${o.rsi === null ? "—" : Math.round(o.rsi)}`, `ingresos ${o.revenueGrowth}`].filter(Boolean).join(" · ")}</p>
              </div>
              <dl className="stats">
                <div><dt>Nota total</dt><dd>{o.totalPassed} de {o.totalScored}</dd></div>
                <div><dt>Empresa</dt><dd>{o.passed} de {o.scored}</dd></div>
                <div><dt>Entorno</dt><dd>{o.envPassed} de {o.envScored}</dd></div>
                                <div><dt>Precio ahora</dt><dd>{money(live.get(o.symbol)?.price ?? o.entry, o.currency)} <Change pct={live.get(o.symbol)?.changePct ?? null} /></dd></div>
                <div><dt>Stop</dt><dd className="down-text">{money(o.stop, o.currency)} ({signedPct(-o.lossPct, 1)})</dd></div>
                <div><dt>Objetivo</dt><dd className="up-text">{money(o.target, o.currency)} ({signedPct(o.gainPct, 1)})</dd></div>
                <div><dt>Resultado medio esperado</dt><dd className={o.expectedPct !== null && o.expectedPct < 0 ? "down-text" : ""}>{o.expectedPct === null ? "Sin histórico" : signedPct(o.expectedPct, 1)}</dd></div>
                <div><dt>Plazo medio</dt><dd>{weeks(o.expectedDays)}</dd></div>
                <div><dt>Llega al objetivo</dt><dd>{o.winRate === null ? "—" : `${Math.round(o.winRate * 100)} % de las veces`}</dd></div>
              </dl>
              <div className="opp-side">
                <div className="size">
                  <span className="muted small strong">Tamaño sugerido</span>
                  {size.shares > 0 ? (
                    <>
                      <span className="strong num">{size.shares} {size.shares === 1 ? "acción" : "acciones"} · {money(size.cost, o.currency)}</span>
                      <span className="small num up-text">Ganancia si llega al objetivo: {money(size.shares * (o.target - o.entry), o.currency)}</span>
                      <span className="small num down-text">Pérdida si salta el stop: {money(size.maxLoss, o.currency)}</span>
                      <span className="small num strong">
                        Ganancia media esperada: {o.expectedPct === null ? "sin histórico" : money((size.cost * o.expectedPct) / 100, o.currency)}
                      </span>
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
      {data && (
        <section className="card pad">
          <div>
            <h2>Qué puedes esperar: el histórico de cada señal</h2>
            <p className="muted">
              Vigía ha simulado cada señal en los {data.scanned} valores durante algo más de un año: comprar al aparecer la señal, stop a 2 veces
              el rango medio diario (ATR), objetivo a 4 veces y salida a las 40 sesiones si no toca ninguno.
            </p>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Señal</th><th>Operaciones</th><th>Llegan al objetivo</th><th>Tardan en llegar</th><th>Duración media</th><th>Resultado medio</th></tr>
              </thead>
              <tbody>
                {KINDS.map((k) => {
                  const st = data.stats[k];
                  return (
                    <tr key={k}>
                      <th scope="row">{k}</th>
                      {st ? (
                        <>
                          <td>{st.trades.toLocaleString("es-ES")}</td>
                          <td>{Math.round(st.winRate * 100)} %</td>
                          <td>{weeks(st.avgDaysToTarget)}</td>
                          <td>{weeks(st.avgDays)}</td>
                          <td className={st.avgR < 0 ? "down-text" : "up-text"}>{st.avgR >= 0 ? "+" : "−"}{plain(Math.abs(st.avgR), 2)} veces el riesgo</td>
                        </>
                      ) : (
                        <td colSpan={5}>Sin operaciones en el periodo</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            «Resultado medio esperado» de cada tarjeta = resultado medio histórico de su señal × lo que arriesgas en esa acción. Es una media
            de muchas operaciones pasadas, sin comisiones ni impuestos: una operación concreta acaba en el stop, en el objetivo o entre medias,
            y el pasado no garantiza el futuro. El tamaño no convierte divisas: en valores en dólares, el importe está en dólares.
          </p>
        </section>
      )}
    </>
  );
}
