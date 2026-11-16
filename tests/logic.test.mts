import test from "node:test";
import assert from "node:assert/strict";
import { sma, rsi, detectSignal, technicals, backtest, summarize, summarizeByRegime } from "../lib/indicators.ts";
import { runChecks, runContextChecks, cagr, yearsWithoutCut, positionSize, tradeFees, afterTax } from "../lib/checks.ts";

test("sma y rsi", () => {
  assert.equal(sma([1, 2, 3, 4], 2), 3.5);
  assert.equal(sma([1], 2), null);
  const up = Array.from({ length: 30 }, (_, i) => 10 + i);
  assert.equal(rsi(up), 100);
  const down = Array.from({ length: 30 }, (_, i) => 100 - i);
  assert.ok(rsi(down)! < 1);
});

test("señal de tendencia y de sobreventa", () => {
  const bar = (c: number, v = 100) => ({ high: c * 1.01, low: c * 0.99, close: c, volume: v });
  const trend = Array.from({ length: 260 }, (_, i) => bar(50 + i * 0.1 + (i % 2 ? 0.4 : -0.4)));
  assert.equal(technicals(trend)!.trend, "alcista");
  assert.equal(detectSignal(trend)!.kind, "Tendencia");
  const crash = [...trend.slice(0, 240), ...Array.from({ length: 20 }, (_, i) => bar(74 - i * 1.5))];
  assert.equal(detectSignal(crash)!.kind, "Sobreventa");
});

test("cagr y años sin recorte", () => {
  assert.ok(Math.abs(cagr([100, 110, 121])! - 0.1) < 1e-9);
  assert.equal(cagr([0, 5]), null);
  const d = (y: number, a: number) => ({ date: new Date(y, 5, 1), amount: a });
  const now = new Date(2026, 10, 15);
  assert.equal(yearsWithoutCut([d(2021, 1), d(2022, 0.5), d(2023, 0.6), d(2024, 0.7), d(2025, 0.7), d(2026, 0.3)], now), 3);
  assert.equal(yearsWithoutCut([d(2020, 1)], now), 0);
  assert.equal(yearsWithoutCut([], now), null);
});

test("tamaño de posición", () => {
  assert.deepEqual(positionSize(1000, 2, 4.62, 4.4).shares, 90);
  assert.equal(positionSize(1000, 2, 138.72, 131).shares, 2);
  assert.equal(positionSize(1000, 5, 10, 9.9).shares, 100); // limitado por el capital
  assert.equal(positionSize(1000, 2, 10, 11).shares, 0);
});

test("chequeo: bancos no puntúan EBITDA y los datos ausentes no cuentan", () => {
  const base = {
    isBank: false, revenueGrowth: 0.08, earningsGrowth: 0.02, roe: 0.2, ebitdaMargin: 0.25, profitMargin: 0.12,
    freeCashflow: 1, netDebtToEbitda: 1, currentRatio: 1.2, pe: 18, evToEbitda: 10, priceToBook: 3,
    dividendYield: 0.03, payoutRatio: 0.5, yearsWithoutCut: 6, price: 10, sma50: 9, sma200: 8, rsi: 55,
    sectorPe: null, targetUpside: 0.1, recommendation: 2, analysts: 10, shortPct: 0.02, insiderNet: 0.01,
  };
  const r = runChecks(base);
  assert.equal(r.scored, 20);
  assert.equal(r.passed, 19);
  assert.equal(r.verdict, "Sólida");
  const bank = runChecks({ ...base, isBank: true, priceToBook: 0.9 });
  const ids = bank.groups.flatMap((g) => g.items).filter((c) => c.status === "na").map((c) => c.id);
  assert.deepEqual(ids, ["ebitdaMargin", "fcf", "netDebt", "currentRatio"]);
  assert.equal(bank.scored, 16);
  const empty = runChecks({ ...base, roe: null, pe: null });
  assert.equal(empty.scored, 18);
  // PER frente al sector: 18 pasa con un sector a 20 y falla con un sector a 12.
  const pe = (sectorPe: number) => runChecks({ ...base, sectorPe }).groups.flatMap((g) => g.items).find((c) => c.id === "pe")!.status;
  assert.equal(pe(20), "ok");
  assert.equal(pe(12), "fail");
  // Con menos de 3 analistas, su opinión no puntúa.
  assert.equal(runChecks({ ...base, analysts: 1 }).scored, 18);
});

test("entorno: macro, país y sector", () => {
  const good = { vsSma200: 0.05, return3m: 0.04 };
  const base = {
    world: good, vix: 18, yieldChange3m: 0.1, countryName: "España", countryIndex: good,
    gdpGrowth: 2.8, inflation: 2.9, unemployment: 11, unemploymentPrev: 11.4, macroYear: "2025",
    sectorName: "Finanzas", sector: { vsSma200: 0.02, return3m: 0.06 }, currency: "EUR", euroChange3m: null,
  };
  const r = runContextChecks(base);
  assert.equal(r.scored, 10);
  assert.equal(r.passed, 10);
  const bad = runContextChecks({ ...base, vix: 32, inflation: 6, sector: { vsSma200: -0.03, return3m: 0.01 }, gdpGrowth: null });
  assert.equal(bad.scored, 9);
  assert.equal(bad.passed, 5);
  // Divisa: si el euro sube un 5 % frente al dólar, el control falla; si sube un 1 %, pasa.
  const fx = (euroChange3m: number) => runContextChecks({ ...base, currency: "USD", euroChange3m });
  assert.equal(fx(0.05).passed, 10);
  assert.equal(fx(0.01).passed, 11);
});

test("prueba histórica: tendencia limpia llega al objetivo y un desplome salta el stop", () => {
  const bar = (c: number) => ({ high: c * 1.01, low: c * 0.99, close: c, volume: 100 });
  // Lateral con ruido y después subida constante: la señal de tendencia aparece y alcanza el objetivo.
  const flat = Array.from({ length: 260 }, (_, i) => bar(50 + (i % 2 ? 0.6 : -0.6)));
  const rise = Array.from({ length: 120 }, (_, i) => bar(50 + i * 0.4 + (i % 2 ? 0.3 : -0.3)));
  const up = backtest([...flat, ...rise].map((b, i) => ({ ...b, t: i })), (t) => t < 300);
  assert.ok(up.length >= 1);
  assert.equal(up[0].kind, "Tendencia");
  assert.equal(up[0].won, true);
  assert.equal(up[0].r, 2);
  const stats = summarize(up);
  assert.equal(stats.Tendencia!.winRate, up.filter((t) => t.won).length / up.length);
  assert.equal(stats.Ruptura, null);
  // Subida y desplome inmediato: la operación abierta acaba en el stop.
  const crash = Array.from({ length: 60 }, (_, i) => bar(Math.max(5, 66 - i * 1.2)));
  const byRegime = summarizeByRegime(up);
  assert.equal(byRegime.bull.Tendencia!.trades + (byRegime.bear.Tendencia?.trades ?? 0), up.length);
  const down = backtest([...flat, ...rise.slice(0, 40), ...crash]);
  assert.ok(down.some((t) => t.r === -1));
});

test("costes: comisiones, cambio de divisa, impuestos y límite de efectivo", () => {
  const costs = { commission: 1, fxPct: 0.5, taxPct: 19 };
  assert.equal(tradeFees(500, false, costs), 2);
  assert.equal(tradeFees(500, true, costs), 7);
  assert.equal(afterTax(100, 19), 81);
  assert.equal(afterTax(-20, 19), -20);
  // Con solo 100 de efectivo libre, la compra no puede superar ese importe.
  assert.equal(positionSize(1000, 2, 4.62, 4.4, 100).shares, 21);
  assert.equal(positionSize(1000, 2, 4.62, 4.4, 0).shares, 0);
});
