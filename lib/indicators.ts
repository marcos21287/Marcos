// Indicadores técnicos calculados sobre series de cierres diarios (del más antiguo al más reciente).

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

/** RSI de Wilder. Devuelve null si no hay datos suficientes. */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

function emaSeries(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  values.forEach((v, i) => out.push(i === 0 ? v : v * k + out[i - 1] * (1 - k)));
  return out;
}

/** MACD (12, 26, 9): devuelve la línea, la señal y el histograma del último día. */
export function macd(closes: number[]): { macd: number; signal: number; hist: number } | null {
  if (closes.length < 35) return null;
  const fast = emaSeries(closes, 12);
  const slow = emaSeries(closes, 26);
  const line = fast.map((v, i) => v - slow[i]);
  const signal = emaSeries(line, 9);
  const last = line.length - 1;
  return { macd: line[last], signal: signal[last], hist: line[last] - signal[last] };
}

export interface Bar {
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Rango medio verdadero (ATR) simple de los últimos `period` días. */
export function atr(bars: Bar[], period = 14): number | null {
  if (bars.length <= period) return null;
  let sum = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    sum += Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - prev), Math.abs(bars[i].low - prev));
  }
  return sum / period;
}

export interface Technicals {
  price: number;
  rsi: number | null;
  sma50: number | null;
  sma200: number | null;
  macdHist: number | null;
  support: number | null;
  resistance: number | null;
  atr: number | null;
  volumeRatio: number | null;
  trend: "alcista" | "bajista" | "lateral";
}

export function technicals(bars: Bar[]): Technicals | null {
  if (bars.length < 2) return null;
  const closes = bars.map((b) => b.close);
  const price = closes[closes.length - 1];
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const m = macd(closes);
  const recent = bars.slice(-61, -1);
  const vols = bars.slice(-21, -1).map((b) => b.volume);
  const avgVol = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : 0;
  let trend: Technicals["trend"] = "lateral";
  if (s50 !== null && s200 !== null) {
    if (price > s50 && s50 > s200) trend = "alcista";
    else if (price < s50 && s50 < s200) trend = "bajista";
  }
  return {
    price,
    rsi: rsi(closes),
    sma50: s50,
    sma200: s200,
    macdHist: m ? m.hist : null,
    support: recent.length ? Math.min(...recent.map((b) => b.low)) : null,
    resistance: recent.length ? Math.max(...recent.map((b) => b.high)) : null,
    atr: atr(bars),
    volumeRatio: avgVol > 0 ? bars[bars.length - 1].volume / avgVol : null,
    trend,
  };
}

export type SignalKind = "Ruptura" | "Tendencia" | "Sobreventa";

export interface Signal {
  kind: SignalKind;
  why: string;
}

/** Detecta la señal más relevante del día, o null si no hay ninguna. */
export function detectSignal(bars: Bar[]): Signal | null {
  const t = technicals(bars);
  if (!t || bars.length < 64) return null;
  const prior = bars.slice(-64, -1);
  const priorHigh = Math.max(...prior.map((b) => b.high));
  if (t.price > priorHigh && t.volumeRatio !== null && t.volumeRatio >= 1.3) {
    return {
      kind: "Ruptura",
      why: `Supera el máximo de 3 meses con un volumen ${t.volumeRatio.toFixed(1).replace(".", ",")} veces superior a la media.`,
    };
  }
  if (t.rsi !== null && t.rsi < 30) {
    return { kind: "Sobreventa", why: `RSI en ${Math.round(t.rsi)}, por debajo de 30: caída fuerte que puede rebotar.` };
  }
  if (t.trend === "alcista" && t.rsi !== null && t.rsi < 70) {
    return { kind: "Tendencia", why: "Precio por encima de las medias de 50 y 200 sesiones, sin sobrecompra." };
  }
  return null;
}

// ---- Prueba histórica de las señales ----

export interface Trade {
  kind: SignalKind;
  /** Resultado en múltiplos del riesgo: −1 si salta el stop, +2 si llega al objetivo. */
  r: number;
  /** Sesiones que duró la operación. */
  days: number;
  won: boolean;
}

export const STOP_ATR = 2;
export const TARGET_ATR = 4;
export const MAX_HOLD = 40;

/**
 * Recorre el histórico y simula cada vez que aparece una señal nueva: entrada al cierre,
 * stop a 2 ATR, objetivo a 4 ATR y salida al cierre si pasan 40 sesiones sin tocar ninguno.
 */
export function backtest(bars: Bar[], lookback = 300): Trade[] {
  const trades: Trade[] = [];
  let prev: SignalKind | null = null;
  const start = Math.max(200, bars.length - lookback);
  for (let t = start; t < bars.length - 1; t++) {
    const window = bars.slice(Math.max(0, t - 280), t + 1);
    const kind = detectSignal(window)?.kind ?? null;
    const isNew = kind !== null && kind !== prev;
    prev = kind;
    if (!isNew) continue;
    const a = atr(window);
    const entry = bars[t].close;
    if (!a || !(entry > 0)) continue;
    const stop = entry - STOP_ATR * a;
    const target = entry + TARGET_ATR * a;
    const end = t + MAX_HOLD;
    if (end >= bars.length) break; // sin datos suficientes para saber cómo acabó
    let done = false;
    for (let d = t + 1; d <= end; d++) {
      if (bars[d].low <= stop) {
        trades.push({ kind, r: -1, days: d - t, won: false });
        done = true;
        break;
      }
      if (bars[d].high >= target) {
        trades.push({ kind, r: TARGET_ATR / STOP_ATR, days: d - t, won: true });
        done = true;
        break;
      }
    }
    if (!done) trades.push({ kind, r: (bars[end].close - entry) / (entry - stop), days: MAX_HOLD, won: false });
  }
  return trades;
}

export interface SignalStats {
  trades: number;
  /** Fracción de operaciones que llegaron al objetivo. */
  winRate: number;
  /** Resultado medio por operación, en múltiplos del riesgo. */
  avgR: number;
  /** Duración media de una operación, en sesiones. */
  avgDays: number;
  /** Sesiones que tardaron de media las que llegaron al objetivo. */
  avgDaysToTarget: number | null;
}

export function summarize(trades: Trade[]): Record<SignalKind, SignalStats | null> {
  const out: Record<SignalKind, SignalStats | null> = { Ruptura: null, Tendencia: null, Sobreventa: null };
  for (const kind of Object.keys(out) as SignalKind[]) {
    const list = trades.filter((t) => t.kind === kind);
    if (!list.length) continue;
    const wins = list.filter((t) => t.won);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    out[kind] = {
      trades: list.length,
      winRate: wins.length / list.length,
      avgR: mean(list.map((t) => t.r)),
      avgDays: mean(list.map((t) => t.days)),
      avgDaysToTarget: wins.length ? mean(wins.map((t) => t.days)) : null,
    };
  }
  return out;
}
