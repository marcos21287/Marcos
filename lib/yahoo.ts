// Acceso a Yahoo Finance (gratuito, sin clave, datos con retraso) con caché en memoria.
import YahooFinance from "yahoo-finance2";
import { cagr, runChecks, runContextChecks, yearsWithoutCut, type CheckResult, type ContextResult, type MarketStat } from "./checks";
import { COUNTRIES, SECTORS, WB_INDICATORS } from "./context";
import { backtest, detectSignal, summarize, technicals, STOP_ATR, TARGET_ATR, type Bar, type Signal, type SignalStats, type Technicals, type Trade } from "./indicators";
import { BASE_UNIVERSE, SCREENERS } from "./universe";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const MIN = 60_000;
const cache = new Map<string, { expires: number; value: Promise<unknown> }>();

function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;
  const value = load().catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, { expires: Date.now() + ttl, value });
  return value;
}

const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

export interface Quote {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  currency: string;
  exchange: string;
}

export function getQuotes(symbols: string[]): Promise<Quote[]> {
  const list = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 60);
  if (!list.length) return Promise.resolve([]);
  return cached(`q:${list.join(",")}`, MIN, async () => {
    const rows = await yf.quote(list);
    return rows.map((r) => ({
      symbol: r.symbol,
      name: r.longName ?? r.shortName ?? r.symbol,
      price: n(r.regularMarketPrice),
      change: n(r.regularMarketChange),
      changePct: n(r.regularMarketChangePercent),
      currency: r.currency ?? "",
      exchange: r.fullExchangeName ?? "",
    }));
  });
}

export interface SearchHit {
  symbol: string;
  name: string;
  exchange: string;
}

export function searchSymbols(query: string): Promise<SearchHit[]> {
  const q = query.trim().slice(0, 40);
  if (!q) return Promise.resolve([]);
  return cached(`s:${q.toLowerCase()}`, 10 * MIN, async () => {
    const res = await yf.search(q, { quotesCount: 8, newsCount: 0 });
    return res.quotes
      .filter((x) => "symbol" in x && (x.quoteType === "EQUITY" || x.quoteType === "ETF" || x.quoteType === "INDEX"))
      .map((x) => {
        const r = x as { symbol: string; longname?: string; shortname?: string; exchDisp?: string };
        return { symbol: r.symbol, name: r.longname ?? r.shortname ?? r.symbol, exchange: r.exchDisp ?? "" };
      });
  });
}

export const RANGES = ["1D", "1M", "6M", "1A", "5A"] as const;
export type Range = (typeof RANGES)[number];

export interface Point {
  t: number;
  c: number;
}

export function getHistory(symbol: string, range: Range): Promise<Point[]> {
  const cfg = {
    "1D": { from: daysAgo(5), interval: "5m" as const, ttl: 2 * MIN },
    "1M": { from: daysAgo(31), interval: "1d" as const, ttl: 15 * MIN },
    "6M": { from: daysAgo(183), interval: "1d" as const, ttl: 15 * MIN },
    "1A": { from: daysAgo(366), interval: "1d" as const, ttl: 15 * MIN },
    "5A": { from: daysAgo(5 * 366), interval: "1wk" as const, ttl: 60 * MIN },
  }[range];
  return cached(`h:${symbol}:${range}`, cfg.ttl, async () => {
    const res = await yf.chart(symbol, { period1: cfg.from, interval: cfg.interval });
    let points = res.quotes
      .filter((q) => n(q.close) !== null)
      .map((q) => ({ t: q.date.getTime(), c: q.close as number }));
    if (range === "1D" && points.length) {
      const lastDay = new Date(points[points.length - 1].t).toDateString();
      points = points.filter((p) => new Date(p.t).toDateString() === lastDay);
    }
    return points;
  });
}

function getDailyBars(symbol: string): Promise<Bar[]> {
  return cached(`bars:${symbol}`, 15 * MIN, async () => {
    const res = await yf.chart(symbol, { period1: daysAgo(800), interval: "1d" });
    return res.quotes
      .filter((q) => n(q.close) !== null && n(q.high) !== null && n(q.low) !== null)
      .map((q) => ({ high: q.high as number, low: q.low as number, close: q.close as number, volume: q.volume ?? 0 }));
  });
}

function getDividends(symbol: string): Promise<{ date: Date; amount: number }[]> {
  return cached(`div:${symbol}`, 12 * 60 * MIN, async () => {
    const res = await yf.chart(symbol, { period1: daysAgo(11 * 366), interval: "1mo", events: "div" });
    return (res.events?.dividends ?? []).map((d) => ({ date: new Date(d.date), amount: d.amount }));
  });
}

export interface NewsItem {
  title: string;
  publisher: string;
  link: string;
  time: number | null;
}

function getNews(query: string): Promise<(NewsItem & { tickers: string[] })[]> {
  return cached(`news:${query}`, 15 * MIN, async () => {
    const res = await yf.search(query, { quotesCount: 0, newsCount: 8 });
    return res.news.map((x) => ({
      title: x.title,
      publisher: x.publisher,
      link: x.link,
      time: x.providerPublishTime ? new Date(x.providerPublishTime).getTime() : null,
      tickers: (x as { relatedTickers?: string[] }).relatedTickers ?? [],
    }));
  });
}

const NO_STAT: MarketStat = { vsSma200: null, return3m: null };

/** Tendencia y rentabilidad a 3 meses de un índice o fondo. */
async function marketStat(symbol: string): Promise<MarketStat & { last: number | null; ago3m: number | null }> {
  try {
    const bars = await getDailyBars(symbol);
    const closes = bars.map((b) => b.close);
    const last = closes[closes.length - 1] ?? null;
    const ago3m = closes.length > 63 ? closes[closes.length - 64] : null;
    const avg = closes.length >= 200 ? closes.slice(-200).reduce((x, y) => x + y, 0) / 200 : null;
    return { last, ago3m, vsSma200: last !== null && avg ? last / avg - 1 : null, return3m: last !== null && ago3m ? last / ago3m - 1 : null };
  } catch {
    return { ...NO_STAT, last: null, ago3m: null };
  }
}

interface CountryMacro {
  gdp: number | null;
  inflation: number | null;
  unemployment: number | null;
  unemploymentPrev: number | null;
  year: string | null;
}

/** PIB, inflación y paro de todos los países (Banco Mundial, datos anuales). */
function getMacro(): Promise<Record<string, CountryMacro>> {
  return cached("macro", 24 * 60 * MIN, async () => {
    const isos = Object.values(COUNTRIES).map((c) => c.iso).join(";");
    const out: Record<string, CountryMacro> = {};
    const slot = (iso: string) => (out[iso] ??= { gdp: null, inflation: null, unemployment: null, unemploymentPrev: null, year: null });
    await Promise.all(
      (Object.keys(WB_INDICATORS) as (keyof typeof WB_INDICATORS)[]).map(async (key) => {
        try {
          const res = await fetch(`https://api.worldbank.org/v2/country/${isos}/indicator/${WB_INDICATORS[key]}?format=json&mrnev=2&per_page=200`);
          const body = (await res.json()) as [unknown, { countryiso3code: string; date: string; value: number | null }[] | null];
          const seen = new Set<string>();
          for (const row of body[1] ?? []) {
            if (row.value === null) continue;
            const m = slot(row.countryiso3code);
            if (!seen.has(row.countryiso3code)) {
              seen.add(row.countryiso3code);
              m[key] = row.value;
              if (key === "gdp") m.year = row.date;
            } else if (key === "unemployment" && m.unemploymentPrev === null) {
              m.unemploymentPrev = row.value;
            }
          }
        } catch {
          // Sin datos del Banco Mundial: esos controles salen como «Sin datos».
        }
      }),
    );
    return out;
  });
}

export interface Context extends ContextResult {
  country: string | null;
  sector: string | null;
}

/** Entorno de una acción: macro global, su país y su sector. */
export async function getContext(country: string | null, sector: string | null): Promise<Context> {
  const c = country ? COUNTRIES[country] : undefined;
  const sec = sector ? SECTORS[sector] : undefined;
  const [world, vix, tnx, idx, etf, macro] = await Promise.all([
    marketStat("^GSPC"),
    marketStat("^VIX"),
    marketStat("^TNX"),
    c ? marketStat(c.index) : Promise.resolve({ ...NO_STAT, last: null, ago3m: null }),
    sec ? marketStat(sec.etf) : Promise.resolve({ ...NO_STAT, last: null, ago3m: null }),
    getMacro().catch(() => ({}) as Record<string, CountryMacro>),
  ]);
  const m = c ? macro[c.iso] : undefined;
  const result = runContextChecks({
    world,
    vix: vix.last,
    yieldChange3m: tnx.last !== null && tnx.ago3m !== null ? tnx.last - tnx.ago3m : null,
    countryName: c?.name ?? country,
    countryIndex: idx,
    gdpGrowth: m?.gdp ?? null,
    inflation: m?.inflation ?? null,
    unemployment: m?.unemployment ?? null,
    unemploymentPrev: m?.unemploymentPrev ?? null,
    macroYear: m?.year ?? null,
    sectorName: sec?.name ?? sector,
    sector: etf,
  });
  return { ...result, country: c?.name ?? country, sector: sec?.name ?? sector };
}

export interface Analysis {
  symbol: string;
  name: string;
  shortName: string;
  currency: string;
  exchange: string;
  sector: string | null;
  industry: string | null;
  isBank: boolean;
  price: number | null;
  change: number | null;
  changePct: number | null;
  keyData: {
    open: number | null;
    dayHigh: number | null;
    dayLow: number | null;
    volume: number | null;
    marketCap: number | null;
    pe: number | null;
    dividendYield: number | null;
    low52: number | null;
    high52: number | null;
    ebitda: number | null;
    revenue: number | null;
    nextEarnings: number | null;
  };
  yearly: { year: number; revenue: number; earnings: number }[];
  financialCurrency: string | null;
  technicals: Technicals | null;
  signal: Signal | null;
  checks: CheckResult;
  context: Context;
  /** Suma de controles de empresa y de entorno. */
  total: { passed: number; scored: number };
}

export function getAnalysis(symbol: string): Promise<Analysis> {
  const sym = symbol.trim().toUpperCase();
  return cached(`a:${sym}`, 15 * MIN, async () => {
    const [summary, bars, dividends] = await Promise.all([
      yf.quoteSummary(sym, {
        modules: ["price", "financialData", "defaultKeyStatistics", "summaryDetail", "assetProfile", "earnings", "calendarEvents"],
      }),
      getDailyBars(sym).catch(() => [] as Bar[]),
      getDividends(sym).catch(() => []),
    ]);
    const fd = summary.financialData;
    const ks = summary.defaultKeyStatistics;
    const sd = summary.summaryDetail;
    const pr = summary.price;
    const profile = summary.assetProfile;
    const yearly = (summary.earnings?.financialsChart?.yearly ?? [])
      .map((y) => ({ year: Number(y.date), revenue: n(y.revenue) ?? NaN, earnings: n(y.earnings) ?? NaN }))
      .filter((y) => Number.isFinite(y.revenue));
    const tech = technicals(bars);
    const price = n(pr?.regularMarketPrice) ?? tech?.price ?? null;
    const industry = profile?.industry ?? null;
    const isBank = !!industry && /bank/i.test(industry);
    const ebitda = n(fd?.ebitda);
    const debt = n(fd?.totalDebt);
    const cash = n(fd?.totalCash);
    const dividendYield = n(sd?.trailingAnnualDividendYield) ?? n(sd?.dividendYield);
    const context = await getContext(profile?.country ?? null, profile?.sector ?? null);
    const earningsDate = summary.calendarEvents?.earnings?.earningsDate?.[0];
    const checks = runChecks({
      isBank,
      revenueGrowth: cagr(yearly.map((y) => y.revenue)),
      earningsGrowth: cagr(yearly.map((y) => y.earnings)),
      roe: n(fd?.returnOnEquity),
      ebitdaMargin: n(fd?.ebitdaMargins),
      profitMargin: n(fd?.profitMargins),
      freeCashflow: n(fd?.freeCashflow),
      netDebtToEbitda: ebitda && ebitda > 0 && debt !== null && cash !== null ? (debt - cash) / ebitda : null,
      currentRatio: n(fd?.currentRatio),
      pe: n(sd?.trailingPE),
      evToEbitda: n(ks?.enterpriseToEbitda),
      priceToBook: n(ks?.priceToBook),
      dividendYield: dividendYield ?? (dividends.length ? null : 0),
      payoutRatio: n(sd?.payoutRatio),
      yearsWithoutCut: yearsWithoutCut(dividends) ?? 0,
      price,
      sma50: tech?.sma50 ?? null,
      sma200: tech?.sma200 ?? null,
      rsi: tech?.rsi ?? null,
    });
    return {
      symbol: sym,
      name: pr?.longName ?? pr?.shortName ?? sym,
      shortName: pr?.shortName ?? "",
      currency: pr?.currency ?? sd?.currency ?? "",
      exchange: pr?.exchangeName ?? "",
      sector: profile?.sector ?? null,
      industry,
      isBank,
      price,
      change: n(pr?.regularMarketChange),
      changePct: n(pr?.regularMarketChangePercent) !== null ? (pr!.regularMarketChangePercent as number) * 100 : null,
      keyData: {
        open: n(sd?.open),
        dayHigh: n(sd?.dayHigh),
        dayLow: n(sd?.dayLow),
        volume: n(sd?.volume),
        marketCap: n(sd?.marketCap),
        pe: n(sd?.trailingPE),
        dividendYield,
        low52: n(sd?.fiftyTwoWeekLow),
        high52: n(sd?.fiftyTwoWeekHigh),
        ebitda,
        revenue: n(fd?.totalRevenue),
        nextEarnings: earningsDate ? new Date(earningsDate).getTime() : null,
      },
      yearly,
      financialCurrency: fd?.financialCurrency ?? null,
      technicals: tech,
      signal: detectSignal(bars),
      checks,
      context,
      total: { passed: checks.passed + context.passed, scored: checks.scored + context.scored },
    };
  });
}

const cleanName = (name: string) => name.replace(/,?\s+(S\.?A\.?|Inc\.?|Corporation|Corp\.?|plc|N\.V\.|SE|AG|& Co\.?|Company|Holdings?)\b\.?/gi, "").trim();

/**
 * Noticias de la empresa. La búsqueda de Yahoo es difusa, así que se prueban varias
 * consultas y solo se aceptan noticias etiquetadas con el ticker de la acción.
 */
export async function getStockNews(symbol: string, names: string[]): Promise<NewsItem[]> {
  const sym = symbol.toUpperCase();
  const base = sym.split(".")[0];
  const queries = [...new Set([sym, ...names.filter(Boolean).map(cleanName)])];
  for (const q of queries) {
    const items = await getNews(q).catch(() => []);
    const related = items.filter((i) => i.tickers.includes(sym) || i.tickers.includes(base));
    if (related.length) return related.slice(0, 5).map(({ title, publisher, link, time }) => ({ title, publisher, link, time }));
  }
  return [];
}

export interface Opportunity {
  symbol: string;
  name: string;
  currency: string;
  signal: Signal;
  rsi: number | null;
  revenueGrowth: string;
  passed: number;
  scored: number;
  envPassed: number;
  envScored: number;
  totalPassed: number;
  totalScored: number;
  country: string | null;
  sector: string | null;
  entry: number;
  stop: number;
  target: number;
  /** Ganancia si llega al objetivo y pérdida si salta el stop, en % sobre la entrada. */
  gainPct: number;
  lossPct: number;
  /** Resultado medio esperado según el histórico de esta señal, en % (null si no hay histórico). */
  expectedPct: number | null;
  /** Duración media histórica de una operación con esta señal, en sesiones. */
  expectedDays: number | null;
  winRate: number | null;
  earningsSoon: boolean;
}

export interface Scan {
  items: Opportunity[];
  /** Valores con cotización revisados. */
  scanned: number;
  /** Valores que superan el filtro previo y cuyo histórico se ha analizado. */
  candidates: number;
  /** Valores con señal confirmada. */
  withSignal: number;
  /** Valores con análisis completo, de los que salen los 10 mejores. */
  analyzed: number;
  /** Qué pasó históricamente al seguir cada señal en todos los valores revisados. */
  stats: Record<Signal["kind"], SignalStats | null>;
  failed: number;
  at: number;
}

const DEEP_LIMIT = 80;
const TOP = 10;
const SIGNAL_ORDER = { Ruptura: 0, Sobreventa: 1, Tendencia: 2 } as const;

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: size }, async () => {
      for (let it = queue.shift(); it !== undefined; it = queue.shift()) await fn(it);
    }),
  );
}

/** Universo del día: lista fija más lo que devuelven los filtros públicos de Yahoo. */
async function loadUniverse(): Promise<string[]> {
  const extra: string[] = [];
  await Promise.all(
    SCREENERS.map(async (id) => {
      try {
        const res = await yf.screener({ scrIds: id, count: 100 });
        for (const q of res.quotes) if (q.symbol && validUniverseSymbol(q.symbol)) extra.push(q.symbol);
      } catch {
        // Si un filtro falla, se sigue con la lista fija.
      }
    }),
  );
  return [...new Set([...BASE_UNIVERSE, ...extra])];
}

const validUniverseSymbol = (s: string) => /^[A-Z0-9.\-]{1,12}$/.test(s);

/**
 * Revisión en tres pasos para abarcar muchos valores con pocas peticiones:
 * 1) cotización en bloque de todo el universo y filtro previo barato,
 * 2) histórico diario de los candidatos para confirmar la señal,
 * 3) análisis completo (fundamentales y dividendos) de los mejores.
 */
export function getOpportunities(): Promise<Scan> {
  return cached("opps", 60 * MIN, async () => {
    const universe = await loadUniverse();
    let failed = 0;

    // Paso 1: cotizaciones en bloques de 50.
    const candidates: string[] = [];
    const quoted: string[] = [];
    let scanned = 0;
    const chunks: string[][] = [];
    for (let i = 0; i < universe.length; i += 50) chunks.push(universe.slice(i, i + 50));
    await pool(chunks, 3, async (chunk) => {
      try {
        const rows = await yf.quote(chunk);
        for (const r of rows) {
          const p = n(r.regularMarketPrice);
          const m50 = n(r.fiftyDayAverage);
          const m200 = n(r.twoHundredDayAverage);
          const hi = n(r.fiftyTwoWeekHigh);
          if (r.quoteType !== "EQUITY" || p === null || m50 === null || m200 === null) continue;
          scanned++;
          quoted.push(r.symbol);
          const trend = p > m50 && m50 > m200;
          const dropped = p < m50 * 0.92;
          const nearHigh = hi !== null && p >= hi * 0.985;
          if (trend || dropped || nearHigh) candidates.push(r.symbol);
        }
      } catch {
        failed += chunk.length;
      }
    });

    // Paso 2: histórico de todos los valores para confirmar la señal de hoy y
    // medir qué pasó en el pasado al seguir cada señal (stop a 2 ATR, objetivo a 4 ATR).
    const signals: { symbol: string; kind: Signal["kind"]; momentum: number }[] = [];
    const trades: Trade[] = [];
    const isCandidate = new Set(candidates);
    await pool(quoted, 8, async (sym) => {
      try {
        const bars = await getDailyBars(sym);
        trades.push(...backtest(bars));
        if (!isCandidate.has(sym)) return;
        const signal = detectSignal(bars);
        const t = technicals(bars);
        if (signal && t && t.sma200) signals.push({ symbol: sym, kind: signal.kind, momentum: t.price / t.sma200 });
      } catch {
        failed++;
      }
    });
    const stats = summarize(trades);
    signals.sort((a, b) => SIGNAL_ORDER[a.kind] - SIGNAL_ORDER[b.kind] || b.momentum - a.momentum);

    // Paso 3: análisis completo de los mejores.
    const out: Opportunity[] = [];
    await pool(signals.slice(0, DEEP_LIMIT), 5, async ({ symbol }) => {
      try {
        const a = await getAnalysis(symbol);
        const t = a.technicals;
        if (!a.signal || !t || a.price === null || t.atr === null) return;
        const stop = a.price - STOP_ATR * t.atr;
        const target = a.price + TARGET_ATR * t.atr;
        const lossPct = ((a.price - stop) / a.price) * 100;
        const st = stats[a.signal.kind];
        const growth = a.checks.groups[0].items[0];
        out.push({
          symbol: a.symbol,
          name: a.name,
          currency: a.currency,
          signal: a.signal,
          rsi: t.rsi,
          revenueGrowth: growth.status === "na" ? "Sin datos" : growth.value,
          passed: a.checks.passed,
          scored: a.checks.scored,
          envPassed: a.context.passed,
          envScored: a.context.scored,
          totalPassed: a.total.passed,
          totalScored: a.total.scored,
          country: a.context.country,
          sector: a.context.sector,
          entry: a.price,
          stop,
          target,
          gainPct: (target / a.price - 1) * 100,
          lossPct,
          expectedPct: st ? st.avgR * lossPct : null,
          expectedDays: st ? st.avgDays : null,
          winRate: st ? st.winRate : null,
          earningsSoon: a.keyData.nextEarnings !== null && a.keyData.nextEarnings > Date.now() && a.keyData.nextEarnings - Date.now() < 10 * 86_400_000,
        });
      } catch {
        failed++;
      }
    });
    // Solo cuentan los valores con datos suficientes; se ordenan por la nota total y se dejan los 10 mejores.
    const ranked = out
      .filter((o) => o.scored >= 8)
      .sort((x, y) => y.totalPassed / y.totalScored - x.totalPassed / x.totalScored || y.totalScored - x.totalScored)
      .slice(0, TOP);
    return { items: ranked, stats, analyzed: out.length, scanned, candidates: candidates.length, withSignal: signals.length, failed, at: Date.now() };
  });
}
