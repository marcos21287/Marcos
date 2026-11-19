"use client";
import Link from "next/link";
import { useState } from "react";
import { afterTax, positionSize, tradeFees } from "@/lib/checks";
import { money, parseNonNegative, parseNumber, plain, signedMoney, signedPct, timeAgo } from "@/lib/format";
import { newId, useStore, type State } from "@/lib/store";
import { costsOf, fxRate, fxSymbol, MAX_OPEN_RISK_PCT, summary } from "@/lib/trades";
import { useFetch } from "@/lib/useFetch";
import type { SignalStats } from "@/lib/indicators";
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
  // Precio en vivo de las 10 y cambio de divisa (el análisis se recalcula cada hora; el precio, cada minuto).
  const fxSymbols = [...new Set(rows.map((o) => fxSymbol(o.currency)).filter((x): x is string => !!x))];
  const liveSymbols = [...rows.map((o) => o.symbol), ...fxSymbols];
  const { data: quotes } = useFetch<Quote[]>(liveSymbols.length ? `/api/quotes?symbols=${encodeURIComponent(liveSymbols.join(","))}` : null, 60_000);
  const live = new Map((quotes ?? []).map((q) => [q.symbol, q]));
  const costs = costsOf(state);
  const book = summary(state);
  const [costText, setCostText] = useState<Partial<Record<"commission" | "fxPct" | "taxPct", string>>>({});
  const setCost = (key: "commission" | "fxPct" | "taxPct", text: string) => {
    setCostText((t) => ({ ...t, [key]: text }));
    const v = parseNonNegative(text);
    if (v !== null) update((s) => ({ ...s, [key]: v }) as State);
  };
  const setCapital = (text: string) => {
    setCapitalText(text);
    const v = parseNumber(text);
    if (v) update((s) => ({ ...s, capital: v }));
  };

  return (
    <>
      <div className="head">
        <div>
          <h1>Las mejores oportunidades</h1>
          <p className="muted">
            {data
              ? `Vigía ha revisado sola ${data.scanned} valores de España, Europa y EE. UU.: ${data.withSignal} cumplen hoy una señal y ${data.items.length === 1 ? "esta es la única que pasa todos los filtros" : data.items.length ? `estas son las ${data.items.length} con mejor nota` : "ninguna llega a la nota mínima"}, sumando la empresa y su entorno (macro global, país y sector). Solo entran las que cumplen al menos el ${Math.round(data.minScore * 100)} % de los controles, como mucho 10.`
              : "Vigía revisa sola cientos de valores de España, Europa y EE. UU. y muestra los que hoy cumplen una señal."}
          </p>
        </div>
        {data && (
          <span className={`tag ${data.alarm.caution || data.regime === "bajista" ? "orange" : data.regime === "alcista" ? "green" : ""}`}>
            {data.alarm.caution ? "Mercado en alerta · " : data.regime ? `Bolsa mundial ${data.regime} · ` : ""}actualizado {timeAgo(data.at)}
          </span>
        )}
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
        <div className="field">
          <label htmlFor="commission">Comisión por orden (€)</label>
          <input id="commission" inputMode="decimal" value={costText.commission ?? String(state.commission)} onChange={(e) => setCost("commission", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="fx">Cambio de divisa (%)</label>
          <input id="fx" inputMode="decimal" value={costText.fxPct ?? String(state.fxPct)} onChange={(e) => setCost("fxPct", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="tax">Impuestos (%)</label>
          <input id="tax" inputMode="decimal" value={costText.taxPct ?? String(state.taxPct)} onChange={(e) => setCost("taxPct", e.target.value)} />
        </div>
        <p className="muted plan-note">
          Cuanto más rápido quieras crecer, más riesgo por operación asumes. Las ganancias de cada tarjeta ya descuentan estos costes; cámbialos
          por los de tu bróker cuando lo tengas.
        </p>
        <p className={`plan-note ${book.openRiskPct >= MAX_OPEN_RISK_PCT ? "down-text strong" : "muted"}`}>
          Diario: {book.open.length} {book.open.length === 1 ? "operación abierta" : "operaciones abiertas"}, riesgo abierto {money(book.openRisk, "EUR")} (
          {plain(book.openRiskPct, 1)} % de tu capital; máximo {MAX_OPEN_RISK_PCT} %), efectivo libre {money(book.cash, "EUR")}.
        </p>
      </section>

      {data?.alarm.caution && (
        <section className="card pad alarm">
          <h2>Mercado en alerta</h2>
          <p>
            Se detecta {data.alarm.reasons.join(" y ")}. Con el mercado así, la simulación da las compras en tendencia y ruptura casi planas o
            en pérdidas, así que hoy solo se proponen sobreventas ({data.pausedByMarket} señales de tendencia o ruptura en pausa). Los resultados
            esperados usan lo que pasó con bolsa bajista.
          </p>
        </section>
      )}
      {data && (
        <p className="muted small">
          {data.belowScore} analizadas no llegan a la nota mínima y {data.recentDrop} se han apartado por haber caído con fuerza en los últimos
          días (como si hubieran saltado el stop).{" "}
          Fuera de la lista por requisitos imprescindibles: {data.excluded} de {data.analyzed} analizadas ({data.excludedBy.ingresos} por ingresos a
          la baja, {data.excludedBy.perdidas} en pérdidas, {data.excludedBy.deuda} con deuda neta superior a 4 veces el EBITDA,{" "}
          {data.excludedBy.valoracion} con PER por encima de 50 y {data.excludedBy.resultados} que publican resultados en los próximos 7 días).
          Además, {data.illiquid} valores no se revisan por negociar menos de 5 millones al día.
        </p>
      )}
      {loading && <p className="card empty">Analizando cientos de valores… la primera vez puede tardar cerca de un minuto.</p>}
      {error && <p className="error">{error}</p>}
      {data && rows.length === 0 && (
        <p className="card empty">
          Hoy no hay oportunidades buenas: ninguna llega al {Math.round(data.minScore * 100)} % de controles cumplidos
          {data.alarm.caution ? " con el mercado en alerta" : ""}. No operar también es una decisión.
        </p>
      )}
      {data && data.failed > 0 && <p className="muted small">No se pudieron analizar {data.failed} valores.</p>}

      <div className="stack">
        {rows.map((o, i) => {
          const fxQuote = fxSymbol(o.currency) ? live.get(fxSymbol(o.currency)!)?.price : null;
          const rate = fxRate(o.currency, fxQuote);
          const r = rate ?? 1;
          const size = positionSize(state.capital * r, state.risk, o.entry, o.stop, Math.max(0, book.cash) * r);
          const costEur = size.cost / r;
          const fees = tradeFees(costEur, o.currency !== "EUR", costs);
          const gainNet = afterTax((size.shares * (o.target - o.entry)) / r - fees, costs.taxPct);
          const lossNet = size.maxLoss / r + fees;
          const expectedGross = o.expectedPct === null ? null : (costEur * o.expectedPct) / 100 - fees;
          const expectedNet = expectedGross === null ? null : afterTax(expectedGross, costs.taxPct);
          const held = book.open.some((t) => t.symbol === o.symbol);
          const overRisk = book.openRisk + size.maxLoss / r > (state.capital * MAX_OPEN_RISK_PCT) / 100 + 0.01;
          const simulate = () =>
            update((s) => ({
              ...s,
              trades: [
                {
                  id: newId(), symbol: o.symbol, name: o.name, currency: o.currency, sector: o.sector, signal: o.signal.kind,
                  score: o.totalScored ? o.totalPassed / o.totalScored : null,
                  shares: size.shares, entry: live.get(o.symbol)?.price ?? o.entry, stop: o.stop, target: o.target, rate: r,
                  openedAt: Date.now(), expected: expectedGross, status: "open",
                },
                ...s.trades,
              ],
            }));
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
                  {rate === null ? (
                    <span className="muted small">Cargando el cambio de divisa…</span>
                  ) : size.shares > 0 ? (
                    <>
                      <span className="strong num">{size.shares} {size.shares === 1 ? "acción" : "acciones"} · {money(costEur, "EUR")}</span>
                      <span className="small num up-text">Si llega al objetivo: {signedMoney(gainNet)} netos</span>
                      <span className="small num down-text">Si salta el stop: {signedMoney(-lossNet)}</span>
                      <span className={`small num strong ${expectedNet !== null && expectedNet < 0 ? "down-text" : ""}`}>
                        Ganancia media esperada: {expectedNet === null ? "sin histórico" : `${signedMoney(expectedNet)} netos`}
                      </span>
                      <span className="muted small num">Costes incluidos: {money(fees, "EUR")}</span>
                    </>
                  ) : (
                    <>
                      <span className="strong">Menos de 1 acción</span>
                      <span className="muted small">{book.cash < o.entry / r ? "No queda efectivo libre suficiente" : "Necesitarías comprar fracciones"}</span>
                    </>
                  )}
                </div>
                <div className="actions">
                  <Link href={`/accion/${encodeURIComponent(o.symbol)}`} className="btn">Ver análisis</Link>
                  <button type="button" className="btn primary" disabled={held || overRisk || size.shares === 0 || rate === null} onClick={simulate}>
                    {held ? "En el diario" : "Simular compra"}
                  </button>
                </div>
                {!held && overRisk && size.shares > 0 && <span className="small down-text">Superarías el {MAX_OPEN_RISK_PCT} % de riesgo abierto.</span>}
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
              Vigía ha simulado cada señal en los {data.scanned} valores durante unos cuatro años y medio, caída de 2022 incluida: comprar al
              aparecer la señal, stop a 2 veces el rango medio diario (ATR), objetivo a 4 veces y salida a las 40 sesiones si no toca ninguno.
              El resultado se separa según la bolsa mundial estuviera alcista o bajista al entrar; las tarjetas usan el de la situación actual
              {data.alarm.caution ? " (mercado en alerta, se usa el de bolsa bajista)" : data.regime ? ` (${data.regime})` : ""}.
            </p>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Señal</th><th>Operaciones</th><th>Llegan al objetivo</th><th>Duración media</th><th>Resultado medio</th><th>Con bolsa alcista</th><th>Con bolsa bajista</th></tr>
              </thead>
              <tbody>
                {KINDS.map((k) => {
                  const st = data.stats.all[k];
                  const cell = (x: SignalStats | null) =>
                    x ? (
                      <td className={x.avgR < 0 ? "down-text" : "up-text"}>
                        {x.avgR >= 0 ? "+" : "−"}{plain(Math.abs(x.avgR), 2)} R <span className="muted small">({Math.round(x.winRate * 100)} % · {x.trades.toLocaleString("es-ES", { useGrouping: "always" })})</span>
                      </td>
                    ) : (
                      <td>—</td>
                    );
                  return (
                    <tr key={k}>
                      <th scope="row">{k}</th>
                      {st ? (
                        <>
                          <td>{st.trades.toLocaleString("es-ES", { useGrouping: "always" })}</td>
                          <td>{Math.round(st.winRate * 100)} %</td>
                          <td>{weeks(st.avgDays)}</td>
                          <td className={st.avgR < 0 ? "down-text" : "up-text"}>{st.avgR >= 0 ? "+" : "−"}{plain(Math.abs(st.avgR), 2)} R</td>
                          {cell(data.stats.bull[k])}
                          {cell(data.stats.bear[k])}
                        </>
                      ) : (
                        <td colSpan={6}>Sin operaciones en el periodo</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            R = veces lo arriesgado: +0,20 R significa ganar de media 0,20 € por cada euro arriesgado. Entre paréntesis, el porcentaje que llega
            al objetivo y el número de operaciones.
          </p>
          <p className="muted small">
            «Resultado medio esperado» de cada tarjeta = resultado medio histórico de su señal × lo que arriesgas en esa acción. Es una media
            de muchas operaciones pasadas y ese porcentaje no incluye costes: una operación concreta acaba en el stop, en el objetivo o entre medias,
            y el pasado no garantiza el futuro. Los importes de las tarjetas están en euros al cambio actual, con comisiones, cambio de divisa e
            impuestos descontados; como mucho aparecen 3 valores de un mismo sector.
          </p>
        </section>
      )}
    </>
  );
}
