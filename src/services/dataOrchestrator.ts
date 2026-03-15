/**
 * ============================================================
 * DATA ORCHESTRATOR
 * CORRECTION : clé de cache candles = `${ticker}:${days}`
 * → changement de période dans CandleChart recharge correctement.
 * ============================================================
 */

import * as Finnhub        from "./finnhubService";
import * as Polygon        from "./polygonService";
import * as AlphaVantage   from "./alphaVantageService";
import { fetchMacroMarket } from "./macroService";
import * as Yahoo           from "./yahooFinanceService";
import { REFRESH_INTERVALS } from "../utils/throttle";
import {
  calcRSI, calcSMA, calcEMA, calcATR, calcMACD,
  detectRSISignal, detectVolumeBreakout,
} from "../utils/financialCalculations";
import type {
  PivotQuote, PivotCandle, PivotNewsItem, PivotIndicators,
  PivotMacroData, PivotScreenerSignal, PivotEconomicEvent,
  DataSource,
} from "./types";
import {
  isMockMode, generateMockQuote, generateMockCandles,
  generateMockNews, generateMockMacroData,
  CAC40_TICKERS, SP500_TOP20, TICKER_REGISTRY,
} from "./mockDataService";

const cache = {
  quotes:     new Map<string, { data: PivotQuote;      ts: number }>(),
  candles:    new Map<string, { data: PivotCandle[];   ts: number }>(),
  news:       new Map<string, { data: PivotNewsItem[]; ts: number }>(),
  indicators: new Map<string, { data: PivotIndicators; ts: number }>(),
};

const isFresh = (ts: number, maxAge: number): boolean => Date.now() - ts < maxAge;

const EURONEXT_SUFFIXES = [".PA", ".BR", ".AM", ".LB"] as const;
const OTHER_EU_SUFFIXES  = [".DE", ".F",  ".L",  ".MI", ".MC"] as const;

const isFinnhubBlocked = (ticker: string): boolean => {
  const upper = ticker.toUpperCase();
  return [...EURONEXT_SUFFIXES, ...OTHER_EU_SUFFIXES].some((sfx) => upper.endsWith(sfx));
};

const inferExchangeMeta = (ticker: string): Pick<PivotQuote, "currency" | "exchange" | "country"> => {
  const t = ticker.toUpperCase();
  if (t.endsWith(".PA") || t.endsWith(".BR") || t.endsWith(".AM"))
    return { currency: "EUR", exchange: "EURONEXT", country: "FR" };
  if (t.endsWith(".DE") || t.endsWith(".F")) return { currency: "EUR", exchange: "XETRA", country: "DE" };
  if (t.endsWith(".L"))                       return { currency: "GBP", exchange: "LSE",   country: "GB" };
  if (t.endsWith(".MI") || t.endsWith(".MC")) return { currency: "EUR", exchange: "EURONEXT", country: "FR" };
  return { currency: "USD", exchange: "NYSE", country: "US" };
};

const avQuoteToPivot = (
  ticker: string,
  av: { price: number; open: number; high: number; low: number; prevClose: number; volume: number; change: number; changePercent: number; },
  existingName?: string,
): PivotQuote => ({
  ticker, name: existingName ?? ticker,
  price: av.price, open: av.open || av.price, high: av.high || av.price,
  low: av.low || av.price, prevClose: av.prevClose || (av.price - av.change),
  change: av.change, changePercent: av.changePercent,
  volume: av.volume, avgVolume30d: 0,
  ...inferExchangeMeta(ticker),
  timestamp: Date.now(), source: "alphavantage" as DataSource,
});

export const getQuote = async (ticker: string): Promise<PivotQuote | null> => {
  const cached = cache.quotes.get(ticker);
  if (cached && isFresh(cached.ts, REFRESH_INTERVALS.REALTIME)) return cached.data;

  if (isMockMode()) {
    const q = generateMockQuote(ticker);
    cache.quotes.set(ticker, { data: q, ts: Date.now() });
    return q;
  }

  let quote: PivotQuote | null = null;
  if (isFinnhubBlocked(ticker)) {
    quote = await Yahoo.fetchQuote(ticker);
  } else {
    quote = await Finnhub.fetchQuote(ticker);
    if (!quote) { const snaps = await Polygon.fetchSnapshots([ticker]); quote = snaps[0] ?? null; }
    if (!quote) { const av = await AlphaVantage.fetchAVQuote(ticker); if (av) quote = avQuoteToPivot(ticker, av); }
  }

  if (quote) cache.quotes.set(ticker, { data: quote, ts: Date.now() });
  return quote;
};

export const getBatchQuotes = async (tickers: string[]): Promise<Map<string, PivotQuote>> => {
  const results = new Map<string, PivotQuote>();
  await Promise.allSettled(tickers.map(async (t) => {
    const q = await getQuote(t);
    if (q) results.set(t, q);
  }));
  return results;
};

/**
 * ✅ CORRECTION BUG CACHE CANDLES
 * Avant : clé = ticker → 1M et 3M retournaient les mêmes données
 * Après : clé = `${ticker}:${days}` → chaque période est indépendante
 */
export const getCandles = async (ticker: string, days = 60): Promise<PivotCandle[]> => {
  const cacheKey = `${ticker}:${days}`;
  const cached = cache.candles.get(cacheKey);
  if (cached && isFresh(cached.ts, REFRESH_INTERVALS.TECHNICAL)) return cached.data;

  if (isMockMode()) {
    const c = generateMockCandles(ticker, days);
    cache.candles.set(cacheKey, { data: c, ts: Date.now() });
    return c;
  }

  let candles: PivotCandle[] = [];
  if (isFinnhubBlocked(ticker)) {
    candles = await Yahoo.fetchCandles(ticker, days);
    if (!candles.length) candles = generateMockCandles(ticker, days);
  } else {
    candles = await Polygon.fetchDailyCandles(ticker, days);
    if (!candles.length) candles = await Finnhub.fetchCandles(ticker, "D", days);
  }

  cache.candles.set(cacheKey, { data: candles, ts: Date.now() });
  return candles;
};

export const getCloses = (candles: PivotCandle[]): number[] => candles.map((c) => c.close);

export const getIndicators = async (ticker: string): Promise<PivotIndicators> => {
  const cached = cache.indicators.get(ticker);
  if (cached && isFresh(cached.ts, REFRESH_INTERVALS.TECHNICAL)) return cached.data;

  const candles = await getCandles(ticker, 220);
  const closes  = getCloses(candles);
  const highs   = candles.map((c) => c.high);
  const lows    = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume);
  const avgVol  = Polygon.computeAvgVolume(candles, 30);
  const lastVol = volumes[volumes.length - 1] ?? 0;

  const indicators: PivotIndicators = {
    ticker,
    rsi14:         calcRSI(closes, 14),
    sma50:         calcSMA(closes, 50),
    sma200:        calcSMA(closes, 200),
    ema20:         calcEMA(closes, 20),
    macdLine:      calcMACD(closes).line,
    macdSignal:    calcMACD(closes).signal,
    macdHistogram: calcMACD(closes).histogram,
    volumeRatio:   avgVol > 0 ? lastVol / avgVol : null,
    atr14:         calcATR(highs, lows, closes, 14),
    timestamp:     Date.now(),
  };

  cache.indicators.set(ticker, { data: indicators, ts: Date.now() });
  return indicators;
};

export const getPortfolioNews = async (tickers: string[]): Promise<PivotNewsItem[]> => {
  if (isMockMode()) return generateMockNews(tickers);

  const allNews: PivotNewsItem[] = [];
  const seen = new Set<string>();

  await Promise.allSettled(tickers.map(async (t) => {
    const cached = cache.news.get(t);
    if (cached && isFresh(cached.ts, REFRESH_INTERVALS.NEWS)) {
      cached.data.forEach((n) => { if (!seen.has(n.id)) { seen.add(n.id); allNews.push(n); } });
      return;
    }
    let news: PivotNewsItem[];
    if (isFinnhubBlocked(t)) {
      news = await AlphaVantage.fetchEUNews(t, 5);
      if (!news.length) news = generateMockNews([t]).slice(0, 5);
    } else {
      news = await Finnhub.fetchCompanyNews(t, 3);
    }
    cache.news.set(t, { data: news, ts: Date.now() });
    news.forEach((n) => { if (!seen.has(n.id)) { seen.add(n.id); allNews.push(n); } });
  }));

  return allNews.sort((a, b) => b.publishedAt - a.publishedAt);
};

let macroCacheTs = 0;
let macroCache: PivotMacroData | null = null;

export const getMacroData = async (): Promise<PivotMacroData> => {
  if (macroCache && isFresh(macroCacheTs, REFRESH_INTERVALS.MACRO)) return macroCache;
  if (isMockMode()) { const d = generateMockMacroData(); macroCache = d; macroCacheTs = Date.now(); return d; }
  const data = await fetchMacroMarket();
  macroCache = data; macroCacheTs = Date.now();
  return data;
};

let calendarCache: PivotEconomicEvent[] | null = null;
let calendarTs = 0;

export const getEconomicCalendar = async (targetDate?: Date): Promise<PivotEconomicEvent[]> => {
  if (!targetDate && calendarCache && isFresh(calendarTs, REFRESH_INTERVALS.CALENDAR)) return calendarCache;
  const events = await AlphaVantage.fetchEconomicCalendar(targetDate);
  if (!targetDate) { calendarCache = events; calendarTs = Date.now(); }
  return events;
};

export type ScreenerProgressCb = (completed: number, total: number, current: string) => void;

const screenerProcessTicker = async (ticker: string, signals: PivotScreenerSignal[]): Promise<void> => {
  const [quoteResult, indResult] = await Promise.allSettled([getQuote(ticker), getIndicators(ticker)]);

  let q   = quoteResult.status === "fulfilled" ? quoteResult.value : null;
  let ind = indResult.status   === "fulfilled" ? indResult.value   : null;

  if (ind && ind.rsi14 === null && ind.sma50 === null && ind.sma200 === null) ind = null;
  if (!q) q = generateMockQuote(ticker);
  if (!ind) {
    const mc = generateMockCandles(ticker, 220);
    const closes = mc.map((c) => c.close);
    const highs  = mc.map((c) => c.high);
    const lows   = mc.map((c) => c.low);
    const vols   = mc.map((c) => c.volume);
    const avgVol = vols.slice(-30).reduce((s, v) => s + v, 0) / 30;
    ind = {
      ticker, rsi14: calcRSI(closes, 14), sma50: calcSMA(closes, 50), sma200: calcSMA(closes, 200),
      ema20: calcEMA(closes, 20), macdLine: calcMACD(closes).line, macdSignal: calcMACD(closes).signal,
      macdHistogram: calcMACD(closes).histogram, volumeRatio: avgVol > 0 ? (vols[vols.length - 1] ?? 0) / avgVol : null,
      atr14: calcATR(highs, lows, closes, 14), timestamp: Date.now(),
    };
  }

  if (!q || !ind) return;

  const meta = getTickerMeta(ticker);
  const currency = q.currency ?? "USD";
  const exchange = q.exchange ?? meta.exchange;
  const country  = q.country  ?? meta.country;
  const sector   = q.sector   ?? meta.sector;

  const rsiSignal = detectRSISignal(ind.rsi14);
  if (rsiSignal) {
    const strength = ind.rsi14! <= 20 || ind.rsi14! >= 80 ? "strong" : ind.rsi14! <= 25 || ind.rsi14! >= 75 ? "moderate" : "weak";
    signals.push({ ticker, name: q.name, signal: rsiSignal, strength, price: q.price, currency, exchange, country, sector,
      changePercent: q.changePercent, details: `RSI(14) = ${ind.rsi14?.toFixed(1)}`, indicators: ind, detectedAt: Date.now() });
  }

  if (ind.volumeRatio !== null && detectVolumeBreakout(q.volume, q.avgVolume30d)) {
    signals.push({ ticker, name: q.name, signal: "VOLUME_BREAKOUT",
      strength: ind.volumeRatio >= 3 ? "strong" : "moderate", price: q.price, currency, exchange, country, sector,
      changePercent: q.changePercent, details: `Vol ${ind.volumeRatio.toFixed(2)}x avg 30j`, indicators: ind, detectedAt: Date.now() });
  }

  if (ind.sma50 !== null && ind.sma200 !== null) {
    const diff = ind.sma50 - ind.sma200;
    const relDiff = Math.abs(diff) / ind.sma200;
    if (relDiff < 0.005) {
      signals.push({ ticker, name: q.name, signal: diff > 0 ? "GOLDEN_CROSS" : "DEATH_CROSS", strength: "moderate",
        price: q.price, currency, exchange, country, sector, changePercent: q.changePercent,
        details: `SMA50 ${ind.sma50.toFixed(2)} / SMA200 ${ind.sma200.toFixed(2)} (Δ ${(relDiff * 100).toFixed(2)}%)`,
        indicators: ind, detectedAt: Date.now() });
    }
  }

  if (ind.rsi14 !== null && ind.rsi14 >= 30 && ind.rsi14 <= 45 && q.changePercent > 0.5) {
    signals.push({ ticker, name: q.name, signal: "RSI_OVERSOLD", strength: "weak",
      price: q.price, currency, exchange, country, sector, changePercent: q.changePercent,
      details: `RSI(14) ${ind.rsi14.toFixed(1)} — reprise potentielle (+${q.changePercent.toFixed(2)}%)`,
      indicators: ind, detectedAt: Date.now() });
  }
};

export const runScreener = async (tickers: string[], onProgress?: ScreenerProgressCb): Promise<PivotScreenerSignal[]> => {
  const signals: PivotScreenerSignal[] = [];
  let completed = 0;
  const euTickers = tickers.filter(isFinnhubBlocked);
  const usTickers = tickers.filter((t) => !isFinnhubBlocked(t));

  for (const ticker of euTickers) {
    onProgress?.(completed, tickers.length, ticker);
    await screenerProcessTicker(ticker, signals);
    completed++;
    onProgress?.(completed, tickers.length, ticker);
  }

  const BATCH = 5;
  for (let i = 0; i < usTickers.length; i += BATCH) {
    const batch = usTickers.slice(i, i + BATCH);
    onProgress?.(completed, tickers.length, batch[0]);
    await Promise.allSettled(batch.map((t) => screenerProcessTicker(t, signals)));
    completed += batch.length;
    onProgress?.(completed, tickers.length, batch[batch.length - 1]);
  }

  const order = { strong: 0, moderate: 1, weak: 2 };
  return signals.sort((a, b) => order[a.strength] - order[b.strength]);
};

export const MARKET_UNIVERSE = SP500_TOP20.map((m) => m.ticker);
export const CAC40_UNIVERSE  = CAC40_TICKERS.map((m) => m.ticker);
export const GLOBAL_UNIVERSE = [...MARKET_UNIVERSE, ...CAC40_UNIVERSE];
export type  MarketRegion    = "US" | "FR" | "GLOBAL";

export const getMarketOverview = async (region: MarketRegion = "US"): Promise<PivotQuote[]> => {
  const universe = region === "FR" ? CAC40_UNIVERSE : region === "GLOBAL" ? GLOBAL_UNIVERSE : MARKET_UNIVERSE;
  if (isMockMode()) return universe.map(generateMockQuote);
  const realQuotes = await getBatchQuotes(universe);
  return universe.map((ticker) => realQuotes.get(ticker) ?? generateMockQuote(ticker));
};

export const getTickerMeta = (ticker: string) =>
  TICKER_REGISTRY.get(ticker) ?? { ticker, name: ticker, sector: "Unknown", exchange: "NYSE" as const, country: "US" as const, basePrice: 100 };
