// Chequeo automático: los controles que Vigía pasa a cada acción y sus criterios.

export type CheckStatus = "ok" | "fail" | "na";

export interface Check {
  id: string;
  label: string;
  value: string;
  rule: string;
  status: CheckStatus;
}

export interface CheckGroup {
  name: string;
  items: Check[];
}

export interface CheckResult {
  groups: CheckGroup[];
  passed: number;
  scored: number;
  verdict: "Sólida" | "Aceptable" | "Débil" | "Sin datos";
}

export interface CheckInput {
  isBank: boolean;
  revenueGrowth: number | null; // crecimiento anual compuesto de ingresos (0,05 = 5 %)
  earningsGrowth: number | null; // crecimiento anual compuesto del beneficio
  roe: number | null;
  ebitdaMargin: number | null;
  profitMargin: number | null;
  freeCashflow: number | null;
  netDebtToEbitda: number | null;
  currentRatio: number | null;
  pe: number | null;
  evToEbitda: number | null;
  priceToBook: number | null;
  dividendYield: number | null;
  payoutRatio: number | null;
  yearsWithoutCut: number | null;
  price: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi: number | null;
}

const pct = (v: number, d = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(d).replace(".", ",")} %`;
const plainPct = (v: number, d = 1) => `${(v * 100).toFixed(d).replace(".", ",")} %`;
const num = (v: number, d = 1) => v.toFixed(d).replace(".", ",");

function check(
  id: string,
  label: string,
  rule: string,
  value: number | null,
  format: (v: number) => string,
  test: (v: number) => boolean,
): Check {
  if (value === null || !Number.isFinite(value)) return { id, label, rule, value: "Sin datos", status: "na" };
  return { id, label, rule, value: format(value), status: test(value) ? "ok" : "fail" };
}

function notApplicable(id: string, label: string, rule: string): Check {
  return { id, label, rule, value: "No aplica", status: "na" };
}

export function runChecks(i: CheckInput): CheckResult {
  const bankNote = "No aplica a bancos: su negocio es la deuda y no tienen EBITDA comparable.";
  const groups: CheckGroup[] = [
    {
      name: "Crecimiento",
      items: [
        check("revenue", "Ingresos, últimos años", "Criterio: más del 5 % anual", i.revenueGrowth, (v) => `${pct(v)} anual`, (v) => v > 0.05),
        check("earnings", "Beneficio, últimos años", "Criterio: más del 5 % anual", i.earningsGrowth, (v) => `${pct(v)} anual`, (v) => v > 0.05),
      ],
    },
    {
      name: "Rentabilidad",
      items: [
        check("roe", "ROE", "Criterio: más del 10 %", i.roe, plainPct, (v) => v > 0.1),
        i.isBank
          ? notApplicable("ebitdaMargin", "Margen EBITDA", bankNote)
          : check("ebitdaMargin", "Margen EBITDA", "Criterio: más del 15 %", i.ebitdaMargin, plainPct, (v) => v > 0.15),
        check("profitMargin", "Margen neto", "Criterio: más del 8 %", i.profitMargin, plainPct, (v) => v > 0.08),
        i.isBank
          ? notApplicable("fcf", "Flujo de caja libre", "No aplica a bancos.")
          : check("fcf", "Flujo de caja libre", "Criterio: positivo", i.freeCashflow, (v) => (v > 0 ? "Positivo" : "Negativo"), (v) => v > 0),
      ],
    },
    {
      name: "Solidez",
      items: [
        i.isBank
          ? notApplicable("netDebt", "Deuda neta / EBITDA", bankNote)
          : check("netDebt", "Deuda neta / EBITDA", "Criterio: menos de 3 veces", i.netDebtToEbitda, (v) => (v <= 0 ? "Caja neta" : `${num(v)} veces`), (v) => v < 3),
        i.isBank
          ? notApplicable("currentRatio", "Liquidez corriente", "No aplica a bancos.")
          : check("currentRatio", "Liquidez corriente", "Criterio: activo corriente mayor que el pasivo corriente", i.currentRatio, (v) => num(v, 2), (v) => v > 1),
      ],
    },
    {
      name: "Valoración",
      items: [
        check("pe", "PER", "Criterio: entre 0 y 25", i.pe, (v) => num(v), (v) => v > 0 && v < 25),
        i.isBank
          ? check("pb", "Precio / valor contable", "Criterio para bancos: menos de 1,5", i.priceToBook, (v) => num(v, 2), (v) => v > 0 && v < 1.5)
          : check("evEbitda", "EV / EBITDA", "Criterio: menos de 12", i.evToEbitda, (v) => num(v), (v) => v > 0 && v < 12),
      ],
    },
    {
      name: "Dividendo",
      items: [
        check("yield", "Rentabilidad por dividendo", "Criterio: más del 2 %", i.dividendYield, plainPct, (v) => v > 0.02),
        check("payout", "Payout", "Criterio: menos del 70 % del beneficio", i.payoutRatio, (v) => plainPct(v, 0), (v) => v > 0 && v < 0.7),
        check("noCut", "Años sin recortarlo", "Criterio: 5 años o más", i.yearsWithoutCut, (v) => String(v), (v) => v >= 5),
      ],
    },
    {
      name: "Técnico",
      items: [
        check(
          "sma200",
          "Precio frente a media de 200",
          "Criterio: precio por encima de la media",
          i.price !== null && i.sma200 !== null ? i.price / i.sma200 - 1 : null,
          (v) => (v > 0 ? "Por encima" : "Por debajo"),
          (v) => v > 0,
        ),
        check(
          "sma50",
          "Precio frente a media de 50",
          "Criterio: precio por encima de la media",
          i.price !== null && i.sma50 !== null ? i.price / i.sma50 - 1 : null,
          (v) => (v > 0 ? "Por encima" : "Por debajo"),
          (v) => v > 0,
        ),
        check("rsi", "RSI (14)", "Criterio: entre 30 y 70", i.rsi, (v) => String(Math.round(v)), (v) => v >= 30 && v <= 70),
      ],
    },
  ];
  const all = groups.flatMap((g) => g.items);
  const scored = all.filter((c) => c.status !== "na").length;
  const passed = all.filter((c) => c.status === "ok").length;
  const ratio = scored ? passed / scored : 0;
  const verdict = scored < 5 ? "Sin datos" : ratio >= 0.75 ? "Sólida" : ratio >= 0.55 ? "Aceptable" : "Débil";
  return { groups, passed, scored, verdict };
}

/** Crecimiento anual compuesto entre el primer y el último valor de una serie anual. */
export function cagr(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2 || v[0] <= 0 || v[v.length - 1] <= 0) return null;
  return Math.pow(v[v.length - 1] / v[0], 1 / (v.length - 1)) - 1;
}

/**
 * Años completos consecutivos, contando hacia atrás desde el último año completo,
 * en los que el dividendo anual no bajó respecto al año anterior.
 */
export function yearsWithoutCut(dividends: { date: Date; amount: number }[], now = new Date()): number | null {
  if (!dividends.length) return null;
  const byYear = new Map<number, number>();
  for (const d of dividends) byYear.set(d.date.getFullYear(), (byYear.get(d.date.getFullYear()) ?? 0) + d.amount);
  let year = now.getFullYear() - 1;
  if (!byYear.has(year)) return 0;
  let count = 0;
  while (byYear.has(year) && byYear.has(year - 1) && byYear.get(year)! >= byYear.get(year - 1)! * 0.98) {
    count++;
    year--;
  }
  return count;
}

/**
 * Tamaño de posición: acciones que limitan la pérdida al riesgo elegido si salta el stop.
 * `cash` es el efectivo disponible (por defecto, todo el capital): la compra nunca lo supera.
 */
export function positionSize(capital: number, riskPct: number, entry: number, stop: number, cash = capital) {
  const perShare = entry - stop;
  if (!(capital > 0) || !(perShare > 0) || !(entry > 0)) return { shares: 0, cost: 0, maxLoss: 0 };
  const shares = Math.max(0, Math.floor(Math.min((capital * riskPct) / 100 / perShare, Math.min(capital, cash) / entry)));
  return { shares, cost: shares * entry, maxLoss: shares * perShare };
}

export interface Costs {
  /** Comisión por cada orden (compra o venta), en euros. */
  commission: number;
  /** Coste del cambio de divisa en cada sentido, en % del importe. */
  fxPct: number;
  /** Impuesto sobre las ganancias, en %. */
  taxPct: number;
}

/** Costes de ida y vuelta de una operación: dos comisiones y, si no cotiza en euros, dos cambios de divisa. */
export function tradeFees(costEur: number, foreign: boolean, c: Costs): number {
  return 2 * c.commission + (foreign ? (2 * costEur * c.fxPct) / 100 : 0);
}

/** Aplica el impuesto solo a las ganancias. */
export function afterTax(amount: number, taxPct: number): number {
  return amount > 0 ? amount * (1 - taxPct / 100) : amount;
}

// ---- Entorno: macroeconomía global, país y sector ----

export interface MarketStat {
  /** Precio dividido por su media de 200 sesiones, menos 1. */
  vsSma200: number | null;
  /** Rentabilidad de los últimos 3 meses (0,05 = 5 %). */
  return3m: number | null;
}

export interface ContextInput {
  world: MarketStat; // bolsa mundial (S&P 500)
  vix: number | null;
  /** Variación del tipo a 10 años de EE. UU. en 3 meses, en puntos porcentuales. */
  yieldChange3m: number | null;
  countryName: string | null;
  countryIndex: MarketStat;
  gdpGrowth: number | null; // % anual
  inflation: number | null; // % anual
  unemployment: number | null; // %
  unemploymentPrev: number | null;
  macroYear: string | null;
  sectorName: string | null;
  sector: MarketStat;
}

export interface ContextResult {
  groups: CheckGroup[];
  passed: number;
  scored: number;
}

export function runContextChecks(i: ContextInput): ContextResult {
  const above = (v: number) => (v > 0 ? "Por encima" : "Por debajo");
  const year = i.macroYear ? ` (${i.macroYear})` : "";
  const rel = i.sector.return3m !== null && i.world.return3m !== null ? i.sector.return3m - i.world.return3m : null;
  const groups: CheckGroup[] = [
    {
      name: "Macro global",
      items: [
        check("worldTrend", "Bolsa mundial (S&P 500)", "Criterio: por encima de su media de 200 sesiones", i.world.vsSma200, above, (v) => v > 0),
        check("vix", "Volatilidad (VIX)", "Criterio: por debajo de 25, mercado sin pánico", i.vix, (v) => num(v), (v) => v < 25),
        check(
          "yields",
          "Tipos a 10 años en EE. UU.",
          "Criterio: no suben más de 0,5 puntos en 3 meses",
          i.yieldChange3m,
          (v) => `${v >= 0 ? "+" : "−"}${num(Math.abs(v), 2)} puntos`,
          (v) => v < 0.5,
        ),
      ],
    },
    {
      name: i.countryName ? `País: ${i.countryName}` : "País",
      items: [
        check("countryTrend", "Bolsa del país", "Criterio: índice por encima de su media de 200 sesiones", i.countryIndex.vsSma200, above, (v) => v > 0),
        check("country3m", "Bolsa del país, 3 meses", "Criterio: en positivo", i.countryIndex.return3m, (v) => pct(v), (v) => v > 0),
        check("gdp", `Crecimiento del PIB${year}`, "Criterio: más del 1 % anual", i.gdpGrowth, (v) => pct(v / 100), (v) => v > 1),
        check("inflation", `Inflación${year}`, "Criterio: entre el 0 % y el 4 %", i.inflation, (v) => plainPct(v / 100), (v) => v >= 0 && v <= 4),
        check(
          "unemployment",
          `Paro${year}`,
          "Criterio: no sube respecto al año anterior",
          i.unemployment !== null && i.unemploymentPrev !== null ? i.unemployment - i.unemploymentPrev : null,
          () => plainPct((i.unemployment ?? 0) / 100),
          (v) => v <= 0.1,
        ),
      ],
    },
    {
      name: i.sectorName ? `Sector: ${i.sectorName}` : "Sector",
      items: [
        check("sectorTrend", "Tendencia del sector", "Criterio: sector por encima de su media de 200 sesiones", i.sector.vsSma200, above, (v) => v > 0),
        check("sectorRel", "Sector frente al mercado, 3 meses", "Criterio: el sector lo hace mejor que la bolsa mundial", rel, (v) => `${pct(v)}`, (v) => v > 0),
      ],
    },
  ];
  const all = groups.flatMap((g) => g.items);
  return { groups, passed: all.filter((c) => c.status === "ok").length, scored: all.filter((c) => c.status !== "na").length };
}
