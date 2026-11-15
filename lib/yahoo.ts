// Acceso a Yahoo Finance (gratuito, sin clave, datos con retraso) con caché en memoria.
import YahooFinance from "yahoo-finance2";
import { cagr, runChecks, yearsWithoutCut, type CheckResult } from "./checks";
import { detectSignal, technicals, type Bar, type Signal, type Technicals } from "./indicators";

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
    const res = await yf.chart(symbol, { period1: daysAgo(420), interval: "1d" });
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

// Universo que Vigía revisa sola en busca de oportunidades.
export const UNIVERSE = [
  "SAN.MC", "BBVA.MC", "ITX.MC", "IBE.MC", "TEF.MC", "REP.MC", "CABK.MC", "AENA.MC", "FER.MC", "AMS.MC", "ACS.MC", "ELE.MC",
  "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "JPM", "KO", "JNJ", "V", "COST",
];

export interface Opportunity {
  symbol: string;
  name: string;
  currency: string;
  signal: Signal;
  rsi: number | null;
  revenueGrowth: string;
  passed: number;
  scored: number;
  entry: number;
  stop: number;
  target: number;
  earningsSoon: boolean;
}

export function getOpportunities(): Promise<{ items: Opportunity[]; scanned: number; failed: number; at: number }> {
  return cached("opps", 30 * MIN, async () => {
    const out: Opportunity[] = [];
    let failed = 0;
    const queue = [...UNIVERSE];
    const worker = async () => {
      for (let sym = queue.shift(); sym; sym = queue.shift()) {
        try {
          const a = await getAnalysis(sym);
          const t = a.technicals;
          if (!a.signal || !t || a.price === null || t.atr === null) continue;
          const stop = a.price - 2 * t.atr;
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
            entry: a.price,
            stop,
            target: a.price + 2 * (a.price - stop),
            earningsSoon: a.keyData.nextEarnings !== null && a.keyData.nextEarnings > Date.now() && a.keyData.nextEarnings - Date.now() < 10 * 86_400_000,
          });
        } catch {
          failed++;
        }
      }
    };
    await Promise.all(Array.from({ length: 5 }, worker));
    out.sort((x, y) => y.passed / (y.scored || 1) - x.passed / (x.scored || 1));
    return { items: out, scanned: UNIVERSE.length, failed, at: Date.now() };
  });
}
