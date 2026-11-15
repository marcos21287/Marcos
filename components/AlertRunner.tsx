"use client";
// Trabaja sola mientras la app está abierta: comprueba alertas de precio cada minuto
// y repasa el chequeo de las acciones vigiladas cada 30 minutos.
import { useEffect } from "react";
import type { CheckStatus } from "@/lib/checks";
import { money } from "@/lib/format";
import { addNotice, getState, notify, update } from "@/lib/store";
import type { Analysis, Quote } from "@/lib/yahoo";

async function checkPrices() {
  const active = getState().alerts.filter((a) => a.status === "active");
  if (!active.length) return;
  const symbols = [...new Set(active.map((a) => a.symbol))];
  const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`);
  if (!res.ok) return;
  const quotes = (await res.json()) as Quote[];
  const price = new Map(quotes.map((q) => [q.symbol, q.price]));
  update((s) => {
    let next = s;
    for (const a of s.alerts) {
      const p = price.get(a.symbol);
      if (a.status !== "active" || p === null || p === undefined) continue;
      const hit = a.cond === "above" ? p >= a.target : p <= a.target;
      if (!hit) continue;
      const text = `${a.symbol} ${a.cond === "above" ? "superó" : "bajó de"} ${money(a.target, a.currency)} (ahora ${money(p, a.currency)})`;
      next = addNotice(
        { ...next, alerts: next.alerts.map((x) => (x.id === a.id ? { ...x, status: "triggered", triggeredAt: Date.now() } : x)) },
        a.symbol,
        text,
        a.cond === "above",
      );
      notify("Alerta de precio", text);
    }
    return next;
  });
}

async function checkFundamentals() {
  for (const symbol of Object.keys(getState().watched)) {
    const res = await fetch(`/api/stock/${encodeURIComponent(symbol)}?news=0`);
    if (!res.ok) continue;
    const a = (await res.json()) as Analysis;
    const now: Record<string, CheckStatus> = {};
    const labels: Record<string, string> = {};
    for (const c of a.checks.groups.flatMap((g) => g.items)) {
      now[c.id] = c.status;
      labels[c.id] = c.label;
    }
    update((s) => {
      const before = s.watched[symbol];
      if (!before) return s;
      let next: typeof s = { ...s, watched: { ...s.watched, [symbol]: now } };
      for (const id of Object.keys(now)) {
        if (!before[id] || before[id] === now[id] || now[id] === "na" || before[id] === "na") continue;
        const good = now[id] === "ok";
        const text = `${symbol}: «${labels[id]}» ${good ? "vuelve a cumplirse" : "ha dejado de cumplirse"}`;
        next = addNotice(next, symbol, text, good);
        notify("Chequeo automático", text);
      }
      return next;
    });
  }
}

export function AlertRunner() {
  useEffect(() => {
    const safe = (fn: () => Promise<void>) => () => void fn().catch(() => {});
    const prices = safe(checkPrices);
    const funds = safe(checkFundamentals);
    prices();
    funds();
    const a = setInterval(prices, 60_000);
    const b = setInterval(funds, 30 * 60_000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, []);
  return null;
}
