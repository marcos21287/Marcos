"use client";
import Link from "next/link";
import { Change } from "@/components/Change";
import { money, timeAgo } from "@/lib/format";
import { useStore } from "@/lib/store";
import { useFetch } from "@/lib/useFetch";
import type { Quote } from "@/lib/yahoo";

const INDICES = ["^IBEX", "^GSPC", "^NDX", "^STOXX50E"];

export default function Home() {
  const [state, update] = useStore();
  const symbols = [...INDICES, ...state.watchlist];
  const { data, error, loading } = useFetch<Quote[]>(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`, 60_000);
  const bySymbol = new Map((data ?? []).map((q) => [q.symbol, q]));
  const stocks = state.watchlist.map((s) => bySymbol.get(s) ?? { symbol: s, name: s, price: null, change: null, changePct: null, currency: "", exchange: "" });
  const movers = stocks.filter((s) => s.changePct !== null).sort((a, b) => Math.abs(b.changePct!) - Math.abs(a.changePct!)).slice(0, 4);
  const remove = (symbol: string) => update((s) => ({ ...s, watchlist: s.watchlist.filter((x) => x !== symbol) }));

  return (
    <>
      <div className="head">
        <div>
          <h1>Mercado</h1>
          <p className="muted">Tus valores y los índices principales de un vistazo.</p>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <section aria-label="Índices" className="tiles">
        {INDICES.map((sym) => {
          const q = bySymbol.get(sym);
          return (
            <div key={sym} className="card tile">
              <span className="muted small">{q?.name ?? sym}</span>
              <span className="big">{q ? money(q.price, "") : loading ? "…" : "—"}</span>
              <Change pct={q?.changePct ?? null} />
            </div>
          );
        })}
      </section>

      <div className="cols">
        <section className="card main-col">
          <div className="card-head">
            <h2>Lista de seguimiento</h2>
            <span className="muted small">Usa el buscador para añadir valores</span>
          </div>
          {stocks.length === 0 && <p className="empty">Tu lista está vacía. Busca una acción arriba y pulsa «Seguir».</p>}
          {stocks.map((s) => (
            <div key={s.symbol} className="row">
              <Link href={`/accion/${encodeURIComponent(s.symbol)}`} className="row-link">
                <span className="ticker">{s.symbol.replace(".MC", "")}</span>
                <span className="grow ellipsis">{s.name}</span>
                <span className="num strong">{money(s.price, s.currency)}</span>
                <Change pct={s.changePct} pill />
              </Link>
              <button type="button" className="icon-btn" aria-label={`Quitar ${s.symbol} de la lista`} onClick={() => remove(s.symbol)}>
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          ))}
        </section>

        <aside className="side-col">
          <section className="card pad">
            <div className="card-head flat">
              <h2>Avisos recientes</h2>
              <Link href="/alertas">Ver todos</Link>
            </div>
            {state.notices.length === 0 && <p className="muted">Aún no hay avisos. Crea una alerta o activa la vigilancia automática en una acción.</p>}
            {state.notices.slice(0, 4).map((n) => (
              <div key={n.id} className="notice">
                <span className={`dot ${n.good ? "up" : "down"}`} />
                <div>
                  <div>{n.text}</div>
                  <div className="muted small">{timeAgo(n.at)}</div>
                </div>
              </div>
            ))}
            <Link href="/alertas" className="btn primary">
              Crear alerta
            </Link>
          </section>
          <section className="card pad">
            <h2>Mayores movimientos</h2>
            {movers.length === 0 && <p className="muted">{loading ? "Cargando…" : "Sin datos."}</p>}
            {movers.map((m) => (
              <Link key={m.symbol} href={`/accion/${encodeURIComponent(m.symbol)}`} className="mover">
                <span className="strong">{m.symbol.replace(".MC", "")}</span>
                <span className="grow muted ellipsis">{m.name}</span>
                <Change pct={m.changePct} />
              </Link>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}
