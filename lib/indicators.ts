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
  /** Fecha de la sesión (milisegundos). */
  t?: number;
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

/** Regla común de las señales, usada tanto para hoy como en la prueba histórica. */
export function classify(
  price: number,
  priorHigh: number | null,
  volumeRatio: number | null,
  rsiValue: number | null,
  sma50: number | null,
  sma200: number | null,
): SignalKind | null {
  if (priorHigh !== null && price > priorHigh && volumeRatio !== null && volumeRatio >= 1.3) return "Ruptura";
  if (rsiValue !== null && rsiValue < 30) return "Sobreventa";
  if (sma50 !== null && sma200 !== null && price > sma50 && sma50 > sma200 && rsiValue !== null && rsiValue < 70) return "Tendencia";
  return null;
}

/** Detecta la señal más relevante del día, o null si no hay ninguna. */
export function detectSignal(bars: Bar[]): Signal | null {
  const t = technicals(bars);
  if (!t || bars.length < 64) return null;
  const priorHigh = Math.max(...bars.slice(-64, -1).map((b) => b.high));
  const kind = classify(t.price, priorHigh, t.volumeRatio, t.rsi, t.sma50, t.sma200);
  if (kind === "Ruptura") {
    return { kind, why: `Supera el máximo de 3 meses con un volumen ${(t.volumeRatio ?? 0).toFixed(1).replace(".", ",")} veces superior a la media.` };
  }
  if (kind === "Sobreventa") return { kind, why: `RSI en ${Math.round(t.rsi ?? 0)}, por debajo de 30: caída fuerte que puede rebotar.` };
  if (kind === "Tendencia") return { kind, why: "Precio por encima de las medias de 50 y 200 sesiones, sin sobrecompra." };
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
  /** Si la bolsa mundial estaba en tendencia alcista al entrar (null si no se sabe). */
  bull: boolean | null;
}

export const STOP_ATR = 2;
export const TARGET_ATR = 4;
export const MAX_HOLD = 40;

/** Indicadores de cada día calculados de una pasada, para recorrer años de histórico sin repetir cuentas. */
function dailySeries(bars: Bar[]) {
  const n = bars.length;
  const nul = () => new Array<number | null>(n).fill(null);
  const s50 = nul(), s200 = nul(), rsiS = nul(), atrS = nul(), priorHigh = nul(), volRatio = nul();
  let sum50 = 0, sum200 = 0, gain = 0, loss = 0, trSum = 0, volSum = 0;
  const tr: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = bars[i].close;
    sum50 += c;
    sum200 += c;
    if (i >= 50) sum50 -= bars[i - 50].close;
    if (i >= 200) sum200 -= bars[i - 200].close;
    if (i >= 49) s50[i] = sum50 / 50;
    if (i >= 199) s200[i] = sum200 / 200;
    if (i > 0) {
      const d = c - bars[i - 1].close;
      const up = Math.max(d, 0), down = Math.max(-d, 0);
      if (i <= 14) {
        gain += up / 14;
        loss += down / 14;
      } else {
        gain = (gain * 13 + up) / 14;
        loss = (loss * 13 + down) / 14;
      }
      if (i >= 14) rsiS[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
      const prev = bars[i - 1].close;
      tr[i] = Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - prev), Math.abs(bars[i].low - prev));
      trSum += tr[i];
      if (i > 14) trSum -= tr[i - 14];
      if (i >= 14) atrS[i] = trSum / 14;
    }
    if (i >= 20 && volSum > 0) volRatio[i] = bars[i].volume / (volSum / 20);
    volSum += bars[i].volume;
    if (i >= 20) volSum -= bars[i - 20].volume;
    if (i >= 63) {
      let hi = -Infinity;
      for (let j = i - 63; j < i; j++) if (bars[j].high > hi) hi = bars[j].high;
      priorHigh[i] = hi;
    }
  }
  return { s50, s200, rsiS, atrS, priorHigh, volRatio };
}

/**
 * Recorre el histórico y simula cada vez que aparece una señal nueva: entrada al cierre,
 * stop a 2 ATR, objetivo a 4 ATR y salida al cierre si pasan 40 sesiones sin tocar ninguno.
 * `isBull` indica, para una fecha, si la bolsa mundial estaba en tendencia alcista.
 */
export function backtest(bars: Bar[], isBull?: (t: number) => boolean | null): Trade[] {
  const trades: Trade[] = [];
  const x = dailySeries(bars);
  let prev: SignalKind | null = null;
  for (let t = 200; t < bars.length - 1; t++) {
    const kind = classify(bars[t].close, x.priorHigh[t], x.volRatio[t], x.rsiS[t], x.s50[t], x.s200[t]);
    const isNew = kind !== null && kind !== prev;
    prev = kind;
    if (!isNew) continue;
    const a = x.atrS[t];
    const entry = bars[t].close;
    if (!a || !(entry > 0)) continue;
    const stop = entry - STOP_ATR * a;
    const target = entry + TARGET_ATR * a;
    const end = t + MAX_HOLD;
    if (end >= bars.length) break; // sin datos suficientes para saber cómo acabó
    const bull = isBull && bars[t].t !== undefined ? isBull(bars[t].t as number) : null;
    let done = false;
    for (let d = t + 1; d <= end; d++) {
      if (bars[d].low <= stop) {
        trades.push({ kind, r: -1, days: d - t, won: false, bull });
        done = true;
        break;
      }
      if (bars[d].high >= target) {
        trades.push({ kind, r: TARGET_ATR / STOP_ATR, days: d - t, won: true, bull });
        done = true;
        break;
      }
    }
    if (!done) trades.push({ kind, r: (bars[end].close - entry) / (entry - stop), days: MAX_HOLD, won: false, bull });
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

export interface RegimeStats {
  all: Record<SignalKind, SignalStats | null>;
  /** Operaciones abiertas con la bolsa mundial por encima de su media de 200 sesiones. */
  bull: Record<SignalKind, SignalStats | null>;
  /** Operaciones abiertas con la bolsa mundial por debajo de su media de 200 sesiones. */
  bear: Record<SignalKind, SignalStats | null>;
}

export function summarizeByRegime(trades: Trade[]): RegimeStats {
  return {
    all: summarize(trades),
    bull: summarize(trades.filter((t) => t.bull === true)),
    bear: summarize(trades.filter((t) => t.bull === false)),
  };
}

// ---- Seguimiento de operaciones reales o simuladas ----

export interface Outcome {
  status: "abierta" | "objetivo" | "stop" | "plazo";
  /** Resultado en múltiplos del riesgo (latente si sigue abierta). */
  r: number;
  /** Sesiones transcurridas desde la entrada. */
  days: number;
  /** Precio de salida, o último cierre si sigue abierta. */
  exit: number;
  /** Fecha de la sesión de salida, o de la última sesión si sigue abierta. */
  exitAt: number | null;
  /** Variación del índice de referencia en el mismo periodo (0,02 = +2 %), si se pidió. */
  benchPct?: number | null;
}

/**
 * Qué pasó con una entrada hecha en `since` a precio `entry`: recorre las sesiones posteriores y
 * mira si tocó antes el stop o el objetivo, o si agotó las 40 sesiones. Funciona aunque nadie
 * estuviera mirando, porque usa los máximos y mínimos de cada día.
 */
export function evaluate(bars: Bar[], since: number, entry: number, stop: number, target: number): Outcome {
  const risk = entry - stop;
  const later = bars.filter((b) => b.t !== undefined && (b.t as number) > since);
  for (let i = 0; i < later.length && i < MAX_HOLD; i++) {
    const b = later[i];
    if (b.low <= stop) return { status: "stop", r: -1, days: i + 1, exit: stop, exitAt: b.t ?? null };
    if (b.high >= target) return { status: "objetivo", r: (target - entry) / risk, days: i + 1, exit: target, exitAt: b.t ?? null };
  }
  if (later.length >= MAX_HOLD) {
    const b = later[MAX_HOLD - 1];
    return { status: "plazo", r: (b.close - entry) / risk, days: MAX_HOLD, exit: b.close, exitAt: b.t ?? null };
  }
  const last = later[later.length - 1];
  return { status: "abierta", r: last ? (last.close - entry) / risk : 0, days: later.length, exit: last ? last.close : entry, exitAt: last?.t ?? null };
}

// ---- Protecciones: alarma de mercado y caídas recientes ----

/** Umbral de volatilidad a partir del cual el mercado se considera en alerta. */
export const VIX_ALERT = 20;

/**
 * Alarma rápida de mercado: salta si el VIX supera 20 o si el S&P 500 cierra por debajo de su media
 * de 50 sesiones. Reacciona en días, frente a las semanas que tarda la media de 200.
 */
export function marketAlarm(vix: number | null, spx: number | null, spxSma50: number | null): { caution: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (vix !== null && vix > VIX_ALERT) reasons.push(`volatilidad (VIX) en ${vix.toFixed(1).replace(".", ",")}, por encima de ${VIX_ALERT}`);
  if (spx !== null && spxSma50 !== null && spx < spxSma50) reasons.push("S&P 500 por debajo de su media de 50 sesiones");
  return { caution: reasons.length > 0, reasons };
}

/**
 * Caída reciente en múltiplos del ATR: distancia entre el cierre más alto de las últimas 10 sesiones
 * y el precio actual. A partir de 2 equivale a haber saltado el stop si se hubiera comprado arriba.
 */
export function recentDropAtr(bars: Bar[], sessions = 10): number | null {
  const t = technicals(bars);
  if (!t || !t.atr || bars.length < sessions + 1) return null;
  const high = Math.max(...bars.slice(-sessions - 1, -1).map((b) => b.close));
  return Math.max(0, (high - t.price) / t.atr);
}
