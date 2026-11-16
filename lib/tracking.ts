"use client";
// Registro automático de las 10 mejores de cada día y comprobación de cómo acabaron.
import type { Outcome } from "./indicators";
import { getState, update, type TrackedPick } from "./store";
import type { OutcomeRequest, Scan } from "./yahoo";

const localDay = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export async function fetchOutcomes(items: OutcomeRequest[]): Promise<Record<string, Outcome>> {
  if (!items.length) return {};
  const res = await fetch("/api/outcomes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
  if (!res.ok) return {};
  return (await res.json()) as Record<string, Outcome>;
}

export const pickRequest = (p: TrackedPick): OutcomeRequest => ({ id: p.id, symbol: p.symbol, since: p.at, entry: p.entry, stop: p.stop, target: p.target });

/**
 * Apunta las oportunidades de hoy que no estén ya en seguimiento. Un valor que repite en la lista
 * varios días cuenta una sola vez mientras su operación siga abierta, igual que en la simulación.
 */
export async function recordToday() {
  const res = await fetch("/api/opportunities");
  if (!res.ok) return;
  const scan = (await res.json()) as Scan;
  // Solo se apunta una lista reciente, y con la fecha de hoy (no la del cálculo guardado).
  if (!scan.items?.length || Date.now() - scan.at > 3 * 3_600_000) return;
  const day = localDay(Date.now());
  update((s) => {
    if (s.picks.some((p) => p.day === day)) return s;
    const open = new Set(s.picks.filter((p) => !p.result).map((p) => p.symbol));
    const fresh: TrackedPick[] = scan.items
      .map((o, i) => ({
        id: `${day}:${o.symbol}`,
        day,
        rank: i + 1,
        symbol: o.symbol,
        name: o.name,
        currency: o.currency,
        signal: o.signal.kind,
        score: o.totalScored ? o.totalPassed / o.totalScored : null,
        entry: o.entry,
        stop: o.stop,
        target: o.target,
        at: scan.at,
        expectedR: o.expectedPct !== null && o.lossPct > 0 ? o.expectedPct / o.lossPct : null,
      }))
      .filter((p) => !open.has(p.symbol));
    return fresh.length ? { ...s, picks: [...fresh, ...s.picks].slice(0, 800) } : s;
  });
}

/** Comprueba las que siguen abiertas y guarda el resultado de las que ya se han cerrado. */
export async function settlePicks(): Promise<Record<string, Outcome>> {
  const open = getState().picks.filter((p) => !p.result);
  const outcomes = await fetchOutcomes(open.map(pickRequest));
  const closed = Object.entries(outcomes).filter(([, o]) => o.status !== "abierta");
  if (closed.length) {
    update((s) => ({
      ...s,
      picks: s.picks.map((p) => {
        const o = outcomes[p.id];
        return o && o.status !== "abierta" && !p.result ? { ...p, result: { status: o.status, r: o.r, days: o.days, exit: o.exit, exitAt: o.exitAt } } : p;
      }),
    }));
  }
  return outcomes;
}
