"use client";
import Link from "next/link";
import { money, plain, signedMoney, signedPct } from "@/lib/format";
import { useStore, type PaperTrade } from "@/lib/store";
import { costEur, costsOf, MAX_OPEN_RISK_PCT, riskEur, summary, tradeResult } from "@/lib/trades";
import { useFetch } from "@/lib/useFetch";
import type { Quote } from "@/lib/yahoo";

const REASONS = { objetivo: "Llegó al objetivo", stop: "Saltó el stop", plazo: "Fin del plazo", manual: "Cierre manual" } as const;
const BANDS: { label: string; test: (s: number | null) => boolean }[] = [
  { label: "85 % o más de controles cumplidos", test: (s) => s !== null && s >= 0.85 },
  { label: "Entre 75 % y 85 %", test: (s) => s !== null && s >= 0.75 && s < 0.85 },
  { label: "Menos del 75 %", test: (s) => s !== null && s < 0.75 },
  { label: "Sin nota registrada", test: (s) => s === null },
];
const day = (t: number) => new Date(t).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
const tone = (v: number) => (v >= 0 ? "up-text" : "down-text");

export default function Diario() {
  const [state, update] = useStore();
  const book = summary(state);
  const costs = costsOf(state);
  const symbols = [...new Set(book.open.map((t) => t.symbol))];
  const { data } = useFetch<Quote[]>(symbols.length ? `/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}` : null, 60_000);
  const price = new Map((data ?? []).map((q) => [q.symbol, q.price]));
  const latent = book.open.reduce((sum, t) => {
    const p = price.get(t.symbol);
    return p ? sum + tradeResult(t, p, costs).net : sum;
  }, 0);

  const close = (t: PaperTrade) => {
    const p = price.get(t.symbol);
    if (!p) return;
    update((s) => ({ ...s, trades: s.trades.map((x) => (x.id === t.id ? { ...x, status: "closed", exit: p, closedAt: Date.now(), reason: "manual" } : x)) }));
  };
  const clear = () => {
    if (window.confirm("¿Borrar todas las operaciones simuladas del diario?")) update((s) => ({ ...s, trades: [] }));
  };

  return (
    <>
      <div className="head">
        <div>
          <h1>Diario de operaciones simuladas</h1>
          <p className="muted">
            Prueba las oportunidades sin dinero real. Vigía cierra sola cada operación al tocar el stop o el objetivo, o a las 40 sesiones, y
            compara lo que sale con lo que esperaba.
          </p>
        </div>
        {state.trades.length > 0 && (
          <button type="button" className="btn" onClick={clear}>Vaciar diario</button>
        )}
      </div>

      <section aria-label="Resumen" className="tiles">
        <div className="card tile">
          <span className="muted small">Capital inicial</span>
          <span className="big">{money(state.capital, "EUR")}</span>
          <span className="muted small">Efectivo libre: {money(book.cash, "EUR")}</span>
        </div>
        <div className="card tile">
          <span className="muted small">Resultado cerrado, tras costes</span>
          <span className={`big ${tone(book.realized)}`}>{signedMoney(book.realized)}</span>
          <span className="muted small">
            {signedPct(state.capital ? (book.realized / state.capital) * 100 : 0, 1)} del capital · impuestos estimados {money(book.tax, "EUR")}
          </span>
        </div>
        <div className="card tile">
          <span className="muted small">Esperado en esas mismas operaciones</span>
          <span className="big">{signedMoney(book.expected)}</span>
          <span className="muted small">
            {book.closed.length} {book.closed.length === 1 ? "cerrada" : "cerradas"} · {book.wins} con ganancia{book.closed.length ? ` (${Math.round((book.wins / book.closed.length) * 100)} %)` : ""}
          </span>
        </div>
        <div className="card tile">
          <span className="muted small">Abiertas ahora</span>
          <span className={`big ${tone(latent)}`}>{signedMoney(latent)}</span>
          <span className={`small ${book.openRiskPct >= MAX_OPEN_RISK_PCT ? "down-text strong" : "muted"}`}>
            Riesgo abierto {money(book.openRisk, "EUR")} ({plain(book.openRiskPct, 1)} %; máximo {MAX_OPEN_RISK_PCT} %)
          </span>
        </div>
      </section>

      <section className="card pad">
        <h2>Abiertas</h2>
        {book.open.length === 0 && (
          <p className="muted">
            No hay operaciones abiertas. Ve a <Link href="/oportunidades">Oportunidades</Link> y pulsa «Simular compra».
          </p>
        )}
        {book.open.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Valor</th><th>Abierta</th><th>Posición</th><th>Entrada</th><th>Ahora</th><th>Stop / objetivo</th><th>Resultado si cierras</th><th></th></tr>
              </thead>
              <tbody>
                {book.open.map((t) => {
                  const p = price.get(t.symbol);
                  const res = p ? tradeResult(t, p, costs) : null;
                  return (
                    <tr key={t.id}>
                      <th scope="row"><Link href={`/accion/${encodeURIComponent(t.symbol)}`}>{t.symbol.replace(".MC", "")}</Link> <span className="muted small">{t.signal}</span></th>
                      <td>{day(t.openedAt)}</td>
                      <td>{t.shares} · {money(costEur(t), "EUR")}</td>
                      <td>{money(t.entry, t.currency)}</td>
                      <td>{p ? money(p, t.currency) : "…"}</td>
                      <td>{money(t.stop, t.currency)} / {money(t.target, t.currency)}</td>
                      <td className={res ? tone(res.net) : ""}>{res ? signedMoney(res.net) : "…"}</td>
                      <td><button type="button" className="btn" disabled={!p} onClick={() => close(t)}>Cerrar ahora</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card pad">
        <h2>Cerradas</h2>
        {book.closed.length === 0 && <p className="muted">Todavía no se ha cerrado ninguna operación.</p>}
        {book.closed.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Valor</th><th>Fechas</th><th>Posición</th><th>Entrada → salida</th><th>Motivo</th><th>Costes</th><th>Resultado</th><th>Esperado</th></tr>
              </thead>
              <tbody>
                {book.closed.map((t) => {
                  const res = tradeResult(t, t.exit ?? t.entry, costs);
                  return (
                    <tr key={t.id}>
                      <th scope="row"><Link href={`/accion/${encodeURIComponent(t.symbol)}`}>{t.symbol.replace(".MC", "")}</Link> <span className="muted small">{t.signal}</span></th>
                      <td>{day(t.openedAt)} – {t.closedAt ? day(t.closedAt) : ""}</td>
                      <td>{t.shares} · {money(costEur(t), "EUR")}</td>
                      <td>{money(t.entry, t.currency)} → {money(t.exit ?? null, t.currency)}</td>
                      <td>{t.reason ? REASONS[t.reason] : ""}</td>
                      <td>{money(res.fees, "EUR")}</td>
                      <td className={tone(res.net)}>{signedMoney(res.net)}</td>
                      <td>{t.expected === null ? "—" : signedMoney(t.expected)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {book.closed.length > 0 && (
        <section className="card pad">
          <div>
            <h2>¿Aciertan más las notas altas?</h2>
            <p className="muted">Resultado de las operaciones cerradas según la nota que tenían al abrirlas. Con pocas operaciones no significa nada todavía.</p>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Nota al abrir</th><th>Operaciones</th><th>Con ganancia</th><th>Resultado total</th></tr>
              </thead>
              <tbody>
                {BANDS.map((band) => {
                  const list = book.closed.filter((t) => band.test(t.score ?? null));
                  const nets = list.map((t) => tradeResult(t, t.exit ?? t.entry, costs).net);
                  const total = nets.reduce((x, y) => x + y, 0);
                  return (
                    <tr key={band.label}>
                      <th scope="row">{band.label}</th>
                      <td>{list.length}</td>
                      <td>{list.length ? `${nets.filter((x) => x > 0).length} (${Math.round((nets.filter((x) => x > 0).length / list.length) * 100)} %)` : "—"}</td>
                      <td className={list.length ? tone(total) : ""}>{list.length ? signedMoney(total) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="muted small">
        Resultados en euros al cambio del día de la compra, con {money(costs.commission, "EUR")} de comisión por orden y {plain(costs.fxPct)} % de
        cambio de divisa. Riesgo máximo por operación abierta ahora: {money(Math.max(0, ...book.open.map(riskEur)), "EUR")}. Al abrir Vigía se repasa el histórico
        real de precios: si una operación tocó el stop o el objetivo con la app cerrada, se cierra a ese precio y en esa fecha.
      </p>
    </>
  );
}
