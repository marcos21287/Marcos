"use client";
import Link from "next/link";
import { use, useState } from "react";
import { Change } from "@/components/Change";
import { Chart } from "@/components/Chart";
import type { CheckGroup, CheckStatus } from "@/lib/checks";
import { compact, money, parseNumber, plain, signedPct, timeAgo } from "@/lib/format";
import { newId, useStore } from "@/lib/store";
import { useFetch } from "@/lib/useFetch";
import type { Analysis, NewsItem, Point, Range } from "@/lib/yahoo";

const RANGE_LIST: Range[] = ["1D", "1M", "6M", "1A", "5A"];

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "ok")
    return (
      <svg role="img" aria-label="Cumple" width="20" height="20" viewBox="0 0 20 20" className="status">
        <circle cx="10" cy="10" r="10" fill="var(--up)" />
        <path d="M5.5 10.5l3 3 6-7" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (status === "fail")
    return (
      <svg role="img" aria-label="No cumple" width="20" height="20" viewBox="0 0 20 20" className="status">
        <rect width="20" height="20" rx="5" fill="var(--down)" />
        <path d="M6.5 6.5l7 7M13.5 6.5l-7 7" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg role="img" aria-label="No aplica" width="20" height="20" viewBox="0 0 20 20" className="status">
      <circle cx="10" cy="10" r="9" fill="none" stroke="var(--muted-icon)" strokeWidth="2" />
      <path d="M6 10h8" stroke="var(--muted-icon)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CheckGrid({ groups }: { groups: CheckGroup[] }) {
  return (
    <div className="check-grid">
      {groups.map((g) => (
        <div key={g.name}>
          <h3>{g.name}</h3>
          {g.items.map((c) => (
            <div key={c.id} className="check">
              <StatusIcon status={c.status} />
              <div className="grow">
                <div className="check-top">
                  <span>{c.label}</span>
                  <span className="strong num">{c.value}</span>
                </div>
                <span className="muted small">{c.rule}</span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Accion({ params }: { params: Promise<{ symbol: string }> }) {
  const symbol = decodeURIComponent(use(params).symbol).toUpperCase();
  const [state, update] = useStore();
  const [range, setRange] = useState<Range>("1M");
  const [cond, setCond] = useState<"above" | "below">("above");
  const [target, setTarget] = useState("");
  const [created, setCreated] = useState(false);
  const enc = encodeURIComponent(symbol);
  const { data: a, error } = useFetch<Analysis & { news: NewsItem[] }>(`/api/stock/${enc}`, 5 * 60_000);
  const { data: points, loading: loadingChart } = useFetch<Point[]>(`/api/history/${enc}?range=${range}`);

  if (error && !a) return <p className="error">{error}</p>;
  if (!a) return <p className="card empty">Analizando {symbol}…</p>;

  const cur = a.currency;
  const following = state.watchlist.includes(symbol);
  const watching = symbol in state.watched;
  const targetNum = parseNumber(target);
  const myAlerts = state.alerts.filter((x) => x.symbol === symbol);
  const t = a.technicals;
  const k = a.keyData;
  const periodPct = points && points.length > 1 ? (points[points.length - 1].c / points[0].c - 1) * 100 : null;
  const maxRev = Math.max(...a.yearly.map((y) => y.revenue), 1);

  const toggleFollow = () =>
    update((s) => ({ ...s, watchlist: following ? s.watchlist.filter((x) => x !== symbol) : [...s.watchlist, symbol] }));
  const toggleWatch = () =>
    update((s) => {
      const watched = { ...s.watched };
      if (watching) delete watched[symbol];
      else watched[symbol] = Object.fromEntries(a.checks.groups.flatMap((g) => g.items).map((c) => [c.id, c.status]));
      return { ...s, watched };
    });
  const createAlert = () => {
    if (!targetNum) return;
    update((s) => ({ ...s, alerts: [{ id: newId(), symbol, cond, target: targetNum, currency: cur, status: "active" }, ...s.alerts] }));
    setCreated(true);
    if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
  };

  return (
    <>
      <Link href="/" className="back">← Mercado</Link>
      <div className="head end">
        <div>
          <div className="muted small title-meta">
            <span className="ticker dark">{symbol}</span>
            {[a.exchange, a.sector].filter(Boolean).join(" · ")}
          </div>
          <h1>{a.name}</h1>
          <div className="price-line">
            <span className="price">{money(a.price, cur)}</span>
            <Change pct={a.changePct} pill suffix=" hoy" />
          </div>
        </div>
        <button type="button" className="btn" aria-pressed={following} onClick={toggleFollow}>
          {following ? "✓ Siguiendo" : "+ Seguir"}
        </button>
      </div>

      <div className="cols">
        <div className="main-col stack">
          <section className="card pad">
            <div className="card-head flat">
              <div>
                <h2>Evolución del precio</h2>
                <span className="muted num">{periodPct === null ? " " : `${signedPct(periodPct)} en el periodo`}</span>
              </div>
              <div role="group" aria-label="Periodo" className="segmented">
                {RANGE_LIST.map((r) => (
                  <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            {loadingChart || !points ? <p className="empty chart-wait">Cargando gráfico…</p> : <Chart points={points} currency={cur} range={range} alert={targetNum} />}
          </section>

          <section className="card pad">
            <div className="card-head flat">
              <div>
                <h2>Chequeo automático</h2>
                <span className="muted">Vigía repasa estos controles con cada dato nuevo, sin que hagas nada.</span>
              </div>
              <div className="score">
                <span className="big">{a.checks.passed} de {a.checks.scored}</span>
                <span className={`tag ${a.checks.verdict === "Sólida" ? "green" : a.checks.verdict === "Débil" ? "orange" : ""}`}>{a.checks.verdict}</span>
              </div>
            </div>
            <div className="bar" aria-hidden="true">
              <div style={{ width: `${a.checks.scored ? (a.checks.passed / a.checks.scored) * 100 : 0}%` }} />
            </div>
            <CheckGrid groups={a.checks.groups} />
            <div className="watch">
              <div className="grow">
                <div id="vigilancia" className="strong">Vigilancia automática</div>
                <div className="muted">Te aviso en cuanto un control deja de cumplirse o vuelve a cumplirse.</div>
              </div>
              <button type="button" role="switch" aria-checked={watching} aria-labelledby="vigilancia" className="switch" onClick={toggleWatch}>
                <span />
              </button>
            </div>
          </section>

          <section className="card pad">
            <div className="card-head flat">
              <div>
                <h2>Entorno: macro, país y sector</h2>
                <span className="muted">Lo que rodea a la empresa. Nota total con el chequeo: {a.total.passed} de {a.total.scored}.</span>
              </div>
              <span className="big">{a.context.passed} de {a.context.scored}</span>
            </div>
            <CheckGrid groups={a.context.groups} />
            <p className="muted small">
              PIB, inflación y paro: Banco Mundial, último dato anual. El sector se mide con su fondo cotizado de EE. UU. como termómetro global.
            </p>
          </section>

          <section className="card pad">
            <h2>Datos clave</h2>
            <dl className="stats wide">
              <div><dt>Apertura</dt><dd>{money(k.open, cur)}</dd></div>
              <div><dt>Máximo del día</dt><dd>{money(k.dayHigh, cur)}</dd></div>
              <div><dt>Mínimo del día</dt><dd>{money(k.dayLow, cur)}</dd></div>
              <div><dt>Volumen</dt><dd>{compact(k.volume)}</dd></div>
              <div><dt>Capitalización</dt><dd>{compact(k.marketCap)}</dd></div>
              <div><dt>PER</dt><dd>{plain(k.pe, 1)}</dd></div>
              <div><dt>Rentab. dividendo</dt><dd>{k.dividendYield === null ? "—" : `${plain(k.dividendYield * 100, 1)} %`}</dd></div>
              <div><dt>Rango 52 semanas</dt><dd>{plain(k.low52)} – {plain(k.high52)}</dd></div>
              <div><dt>Ingresos (12 meses)</dt><dd>{compact(k.revenue)}</dd></div>
              <div><dt>EBITDA</dt><dd>{a.isBank ? "No aplica" : compact(k.ebitda)}</dd></div>
              <div><dt>Próximos resultados</dt><dd>{k.nextEarnings ? new Date(k.nextEarnings).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "—"}</dd></div>
            </dl>
          </section>

          <div className="pair">
            <section className="card pad">
              <div className="card-head flat">
                <h2>Análisis técnico</h2>
                {t && <span className={`tag ${t.trend === "alcista" ? "green" : t.trend === "bajista" ? "orange" : ""}`}>Tendencia {t.trend}</span>}
              </div>
              {t ? (
                <dl className="lines">
                  <div><dt>RSI (14)</dt><dd>{t.rsi === null ? "—" : `${Math.round(t.rsi)} · ${t.rsi > 70 ? "sobrecompra" : t.rsi < 30 ? "sobreventa" : "neutral"}`}</dd></div>
                  <div><dt>Media 50 sesiones</dt><dd>{money(t.sma50, cur)}</dd></div>
                  <div><dt>Media 200 sesiones</dt><dd>{money(t.sma200, cur)}</dd></div>
                  <div><dt>MACD</dt><dd>{t.macdHist === null ? "—" : t.macdHist > 0 ? "Alcista" : "Bajista"}</dd></div>
                  <div><dt>Soporte (3 meses)</dt><dd>{money(t.support, cur)}</dd></div>
                  <div><dt>Resistencia (3 meses)</dt><dd>{money(t.resistance, cur)}</dd></div>
                </dl>
              ) : (
                <p className="muted">Sin histórico suficiente.</p>
              )}
            </section>
            <section className="card pad">
              <h2>Ingresos anuales</h2>
              <span className="muted">{a.financialCurrency ? `En ${a.financialCurrency}` : ""}</span>
              {a.yearly.length ? (
                <div className="bars" role="img" aria-label={`Ingresos anuales: ${a.yearly.map((y) => `${compact(y.revenue)} en ${y.year}`).join(", ")}`}>
                  {a.yearly.map((y, i) => (
                    <div key={y.year}>
                      <span className="strong small num">{compact(y.revenue)}</span>
                      <div className={i === a.yearly.length - 1 ? "last" : ""} style={{ height: `${Math.max(4, (y.revenue / maxRev) * 120)}px` }} />
                      <span className="muted small">{y.year}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">Sin datos de ingresos.</p>
              )}
            </section>
          </div>
        </div>

        <aside className="side-col">
          <section className="card pad form">
            <h2>Nueva alerta para {symbol}</h2>
            <div className="field">
              <label htmlFor="cond">Avísame cuando el precio</label>
              <select id="cond" value={cond} onChange={(e) => { setCond(e.target.value as "above" | "below"); setCreated(false); }}>
                <option value="above">Suba por encima de</option>
                <option value="below">Baje por debajo de</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="target">Precio objetivo ({cur})</label>
              <input id="target" inputMode="decimal" value={target} placeholder={a.price ? plain(a.price * 1.05) : ""} onChange={(e) => { setTarget(e.target.value); setCreated(false); }} />
              <span className="muted small num">
                {targetNum && a.price ? `A un ${signedPct((targetNum / a.price - 1) * 100, 1)} del precio actual` : `Precio actual: ${money(a.price, cur)}`}
              </span>
            </div>
            <button type="button" className="btn primary" disabled={!targetNum} onClick={createAlert}>Crear alerta</button>
            {created && <p role="status" className="ok-msg">Alerta creada. Te avisaremos mientras la app esté abierta.</p>}
          </section>

          <section className="card pad">
            <div className="card-head flat">
              <h2>Alertas de {symbol}</h2>
              <Link href="/alertas">Ver todas</Link>
            </div>
            {myAlerts.length === 0 && <p className="muted">Ninguna todavía.</p>}
            {myAlerts.map((x) => (
              <div key={x.id} className="mini-alert">
                <span className="num">{x.cond === "above" ? "Sube por encima de" : "Baja por debajo de"} {money(x.target, x.currency)}</span>
                <span className="tag">{x.status === "active" ? "Activa" : x.status === "paused" ? "En pausa" : "Disparada"}</span>
              </div>
            ))}
          </section>

          <section className="card pad">
            <h2>Noticias</h2>
            {a.news.length === 0 && <p className="muted">Sin noticias recientes.</p>}
            {a.news.map((nw) => (
              <a key={nw.link} href={nw.link} target="_blank" rel="noopener noreferrer" className="news">
                <span>{nw.title}</span>
                <span className="muted small">{nw.publisher} · {timeAgo(nw.time)}</span>
              </a>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}
