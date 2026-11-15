// Cálculos del diario de operaciones simuladas. Todos los importes se devuelven en euros.
import { tradeFees, type Costs } from "./checks";
import type { PaperTrade, State } from "./store";

/** Máximo de riesgo abierto a la vez, en % del capital. */
export const MAX_OPEN_RISK_PCT = 6;
/** Sesiones máximas de una operación, igual que en la simulación histórica (40 sesiones ≈ 56 días). */
export const MAX_HOLD_DAYS = 56;

export const costsOf = (s: State): Costs => ({ commission: s.commission, fxPct: s.fxPct, taxPct: s.taxPct });

/** Divisa → símbolo de Yahoo del cambio frente al euro, o null si ya es euro. */
export function fxSymbol(currency: string): string | null {
  if (!currency || currency === "EUR") return null;
  return `EUR${currency === "GBp" ? "GBP" : currency}=X`;
}

/** Unidades de la divisa por euro (las acciones de Londres cotizan en peniques). */
export function fxRate(currency: string, quote: number | null | undefined): number | null {
  if (!currency || currency === "EUR") return 1;
  if (!quote) return null;
  return currency === "GBp" ? quote * 100 : quote;
}

export const costEur = (t: PaperTrade) => (t.shares * t.entry) / t.rate;
export const riskEur = (t: PaperTrade) => (t.shares * (t.entry - t.stop)) / t.rate;

/** Resultado de una operación a un precio de salida: bruto, costes y neto (antes de impuestos). */
export function tradeResult(t: PaperTrade, exit: number, costs: Costs) {
  const gross = (t.shares * (exit - t.entry)) / t.rate;
  const fees = tradeFees(costEur(t), t.currency !== "EUR", costs);
  return { gross, fees, net: gross - fees };
}

export function summary(s: State) {
  const costs = costsOf(s);
  const open = s.trades.filter((t) => t.status === "open");
  const closed = s.trades.filter((t) => t.status === "closed");
  const results = closed.map((t) => tradeResult(t, t.exit ?? t.entry, costs).net);
  const realized = results.reduce((a, b) => a + b, 0);
  const invested = open.reduce((a, t) => a + costEur(t), 0);
  const openRisk = open.reduce((a, t) => a + riskEur(t), 0);
  return {
    open,
    closed,
    realized,
    tax: realized > 0 ? (realized * s.taxPct) / 100 : 0,
    wins: results.filter((r) => r > 0).length,
    expected: closed.reduce((a, t) => a + (t.expected ?? 0), 0),
    invested,
    cash: s.capital + realized - invested,
    openRisk,
    openRiskPct: s.capital > 0 ? (openRisk / s.capital) * 100 : 0,
  };
}
