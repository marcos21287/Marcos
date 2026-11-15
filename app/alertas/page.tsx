"use client";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { money, parseNumber, signedPct, timeAgo } from "@/lib/format";
import { newId, useStore } from "@/lib/store";
import { useFetch } from "@/lib/useFetch";
import type { Quote } from "@/lib/yahoo";

const TABS = [
  { id: "all", label: "Todas" },
  { id: "active", label: "Activas" },
  { id: "triggered", label: "Disparadas" },
  { id: "paused", label: "En pausa" },
] as const;

const noop = () => () => {};

export default function Alertas() {
  const [state, update] = useStore();
  const [filter, setFilter] = useState<(typeof TABS)[number]["id"]>("all");
  const [symbol, setSymbol] = useState("");
  const [cond, setCond] = useState<"above" | "below">("above");
  const [target, setTarget] = useState("");
  const [permission, setPermission] = useState<string | null>(null);
  const browserPermission = useSyncExternalStore(noop, () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission), () => "default");
  const perm = permission ?? browserPermission;

  const selected = symbol || state.watchlist[0] || "";
  const symbols = [...new Set([...state.watchlist, ...state.alerts.map((a) => a.symbol)])];
  const { data } = useFetch<Quote[]>(symbols.length ? `/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}` : null, 60_000);
  const quote = new Map((data ?? []).map((q) => [q.symbol, q]));
  const rows = state.alerts.filter((a) => filter === "all" || a.status === filter);
  const count = (id: string) => (id === "all" ? state.alerts.length : state.alerts.filter((a) => a.status === id).length);
  const targetNum = parseNumber(target);
  const sel = quote.get(selected);

  const setStatus = (id: string, status: "active" | "paused") =>
    update((s) => ({ ...s, alerts: s.alerts.map((a) => (a.id === id ? { ...a, status, triggeredAt: undefined } : a)) }));
  const remove = (id: string) => update((s) => ({ ...s, alerts: s.alerts.filter((a) => a.id !== id) }));
  const create = () => {
    if (!targetNum || !selected) return;
    update((s) => ({ ...s, alerts: [{ id: newId(), symbol: selected, cond, target: targetNum, currency: sel?.currency ?? "", status: "active" }, ...s.alerts] }));
    setTarget("");
    setFilter("all");
  };
  const askPermission = async () => {
    if (typeof Notification !== "undefined") setPermission(await Notification.requestPermission());
  };

  return (
    <>
      <div className="head">
        <div>
          <h1>Alertas</h1>
          <p className="muted">Te avisamos cuando un valor cruza el precio que tú marcas.</p>
        </div>
      </div>
      <div className="cols">
        <div className="main-col stack">
          <section className="card">
            <div role="group" aria-label="Filtrar alertas" className="chips pad-chips">
              {TABS.map((t) => (
                <button key={t.id} type="button" aria-pressed={filter === t.id} onClick={() => setFilter(t.id)}>
                  {t.label} <span className="num">{count(t.id)}</span>
                </button>
              ))}
            </div>
            {rows.length === 0 && <p className="empty line-top">No hay alertas en esta vista.</p>}
            {rows.map((a) => {
              const q = quote.get(a.symbol);
              const gap = q?.price ? (a.target / q.price - 1) * 100 : null;
              return (
                <div key={a.id} className="alert-row">
                  <Link href={`/accion/${encodeURIComponent(a.symbol)}`} className="ticker link" aria-label={`Ver ${a.symbol}`}>
                    {a.symbol.replace(".MC", "")}
                  </Link>
                  <div className="grow">
                    <div className="strong num">{a.cond === "above" ? "Sube por encima de" : "Baja por debajo de"} {money(a.target, a.currency)}</div>
                    <div className="muted small num">
                      {a.status === "triggered" && a.triggeredAt
                        ? `Disparada ${timeAgo(a.triggeredAt)}`
                        : q?.price
                          ? `Ahora ${money(q.price, a.currency)} · objetivo a un ${signedPct(gap, 1)}`
                          : "Cargando precio…"}
                    </div>
                  </div>
                  <span className={`tag ${a.status === "active" ? "blue" : a.status === "triggered" ? "green" : ""}`}>
                    {a.status === "active" ? "Activa" : a.status === "triggered" ? "✓ Disparada" : "En pausa"}
                  </span>
                  <div className="actions">
                    <button type="button" className="btn" onClick={() => setStatus(a.id, a.status === "active" ? "paused" : "active")}>
                      {a.status === "active" ? "Pausar" : a.status === "paused" ? "Activar" : "Reactivar"}
                    </button>
                    <button type="button" className="icon-btn boxed" aria-label={`Eliminar alerta de ${a.symbol}`} onClick={() => remove(a.id)}>
                      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="card pad">
            <div className="card-head flat">
              <h2>Historial de avisos</h2>
              {state.notices.length > 0 && (
                <button type="button" className="btn" onClick={() => update((s) => ({ ...s, notices: [] }))}>Vaciar</button>
              )}
            </div>
            {state.notices.length === 0 && <p className="muted">Aquí aparecerán las alertas disparadas y los cambios del chequeo automático.</p>}
            {state.notices.map((n) => (
              <div key={n.id} className="notice">
                <span className={`dot ${n.good ? "up" : "down"}`} />
                <div>
                  <div>{n.text}</div>
                  <div className="muted small">{timeAgo(n.at)}</div>
                </div>
              </div>
            ))}
          </section>
        </div>

        <aside className="side-col">
          <section className="card pad form">
            <h2>Nueva alerta</h2>
            {state.watchlist.length === 0 ? (
              <p className="muted">Añade primero algún valor a tu lista de seguimiento desde el buscador.</p>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="sym">Valor</label>
                  <select id="sym" value={selected} onChange={(e) => setSymbol(e.target.value)}>
                    {state.watchlist.map((s) => (
                      <option key={s} value={s}>{s} · {quote.get(s)?.name ?? ""}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="cond">Avísame cuando el precio</label>
                  <select id="cond" value={cond} onChange={(e) => setCond(e.target.value as "above" | "below")}>
                    <option value="above">Suba por encima de</option>
                    <option value="below">Baje por debajo de</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="target">Precio objetivo</label>
                  <input id="target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
                  <span className="muted small num">Precio actual de {selected}: {money(sel?.price ?? null, sel?.currency ?? "")}</span>
                </div>
                <button type="button" className="btn primary" disabled={!targetNum} onClick={create}>Crear alerta</button>
              </>
            )}
          </section>

          <section className="card pad">
            <h2>Cómo avisarte</h2>
            {perm === "granted" && <p className="ok-msg">Notificaciones del navegador activadas.</p>}
            {perm === "default" && (
              <button type="button" className="btn primary" onClick={askPermission}>Activar notificaciones</button>
            )}
            {perm === "denied" && <p className="muted">Has bloqueado las notificaciones. Permítelas en los ajustes del navegador para este sitio.</p>}
            {perm === "unsupported" && <p className="muted">Este navegador no admite notificaciones; verás los avisos en esta página.</p>}
            <p className="muted small">Las alertas se comprueban cada minuto mientras tengas Vigía abierta en una pestaña.</p>
          </section>
        </aside>
      </div>
    </>
  );
}
