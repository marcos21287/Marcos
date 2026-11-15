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
