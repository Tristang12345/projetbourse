/**
 * ============================================================
 * DATA ORCHESTRATOR
 * Central coordinator between all API services and the store.
 * Manages refresh cycles, deduplication, and error recovery.
 * Screens call orchestrator methods; never raw services.
 * ============================================================
 */

import * as Finnhub     from "./finnhubService";
import * as Polygon     from "./polygonService";
import * as AlphaVantage from "./alphaVantageService";
import { REFRESH_INTERVALS } from "../utils/throttle";
import {
  calcRSI, calcSMA, calcEMA, calcATR, calcMACD,
  detectRSISignal, detectMACrossSignal, detectVolumeBreakout,
} from "../utils/financialCalculations";
import type {
  PivotQuote, PivotCandle, PivotNewsItem, PivotIndicators,
  PivotMacroData, PivotScreenerSignal, PivotEconomicEvent,
} from "./types";

// ─── Cache ────────────────────────────────────────────────────

const cache = {
  quotes:    new Map<string, { data: PivotQuote;     ts: number }>(),
  candles:   new Map<string, { data: PivotCandle[];  ts: number }>(),
  news:      new Map<string, { data: PivotNewsItem[]; ts: number }>(),
  indicators: new Map<string, { data: PivotIndicators; ts: number }>(),
};

const isFresh = (ts: number, maxAge: number): boolean =>
  Date.now() - ts < maxAge;

// ─── Quote Fetch ──────────────────────────────────────────────

/**
 * Get quote for a single ticker.
 * Prefers Finnhub for real-time; falls back to Polygon snapshot.
 */
export const getQuote = async (ticker: string): Promise<PivotQuote | null> => {
  const cached = cache.quotes.get(ticker);
  if (cached && isFresh(cached.ts, REFRESH_INTERVALS.REALTIME)) {
    return cached.data;
  }

  let quote = await Finnhub.fetchQuote(ticker);
  if (!quote) {
    const snaps = await Polygon.fetchSnapshots([ticker]);
    quote = snaps[0] ?? null;
  }

  if (quote) {
    cache.quotes.set(ticker, { data: quote, ts: Date.now() });
  }
  return quote;
};

/**
 * Fetch quotes for all portfolio tickers in parallel.
 */
export const getBatchQuotes = async (
  tickers: string[],
): Promise<Map<string, PivotQuote>> => {
  const results = new Map<string, PivotQuote>();
  await Promise.allSettled(
    tickers.map(async (t) => {
      const q = await getQuote(t);
      if (q) results.set(t, q);
    }),
  );
  return results;
};

// ─── Candles ──────────────────────────────────────────────────

/**
 * Get daily candles (up to 60 days).
 * Polygon preferred; Finnhub as fallback.
 */
export const getCandles = async (
  ticker: string,
  days = 60,
): Promise<PivotCandle[]> => {
  const cached = cache.candles.get(ticker);
  if (cached && isFresh(cached.ts, REFRESH_INTERVALS.TECHNICAL)) {
    return cached.data;
  }

  let candles = await Polygon.fetchDailyCandles(ticker, days);
  if (!candles.length) {
    candles = await Finnhub.fetchCandles(ticker, "D", days);
  }

  cache.candles.set(ticker, { data: candles, ts: Date.now() });
  return candles;
};

/**
 * Extract last N closes from candle array (for indicators).
 */
export const getCloses = (candles: PivotCandle[]): number[] =>
  candles.map((c) => c.close);

// ─── Indicators ───────────────────────────────────────────────

/**
 * Compute indicators locally from candle data + enrich from AV.
 */
export const getIndicators = async (
  ticker: string,
): Promise<PivotIndicators> => {
  const cached = cache.indicators.get(ticker);
  if (cached && isFresh(cached.ts, REFRESH_INTERVALS.TECHNICAL)) {
    return cached.data;
  }

  const candles = await getCandles(ticker, 220);
  const closes  = getCloses(candles);
  const highs   = candles.map((c) => c.high);
  const lows    = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume);
  const avgVol  = Polygon.computeAvgVolume(candles, 30);
  const lastVol = volumes[volumes.length - 1] ?? 0;

  const rsi14   = calcRSI(closes, 14);
  const sma50   = calcSMA(closes, 50);
  const sma200  = calcSMA(closes, 200);
  const ema20   = calcEMA(closes, 20);
  const macd    = calcMACD(closes);
  const atr14   = calcATR(highs, lows, closes, 14);

  const indicators: PivotIndicators = {
    ticker,
    rsi14,
    sma50,
    sma200,
    ema20,
    macdLine:      macd.line,
    macdSignal:    macd.signal,
    macdHistogram: macd.histogram,
    volumeRatio:   avgVol > 0 ? lastVol / avgVol : null,
    atr14,
    timestamp:     Date.now(),
  };

  cache.indicators.set(ticker, { data: indicators, ts: Date.now() });
  return indicators;
};

// ─── News ─────────────────────────────────────────────────────

/**
 * Fetch news for all portfolio tickers, deduplicated.
 */
export const getPortfolioNews = async (
  tickers: string[],
): Promise<PivotNewsItem[]> => {
  const allNews: PivotNewsItem[] = [];
  const seen = new Set<string>();

  await Promise.allSettled(
    tickers.map(async (t) => {
      const cached = cache.news.get(t);
      if (cached && isFresh(cached.ts, REFRESH_INTERVALS.NEWS)) {
        cached.data.forEach((n) => {
          if (!seen.has(n.id)) { seen.add(n.id); allNews.push(n); }
        });
        return;
      }
      const news = await Finnhub.fetchCompanyNews(t, 3);
      cache.news.set(t, { data: news, ts: Date.now() });
      news.forEach((n) => {
        if (!seen.has(n.id)) { seen.add(n.id); allNews.push(n); }
      });
    }),
  );

  // Sort by most recent
  return allNews.sort((a, b) => b.publishedAt - a.publishedAt);
};

// ─── Macro ────────────────────────────────────────────────────

let macroCacheTs = 0;
let macroCache: PivotMacroData | null = null;

export const getMacroData = async (): Promise<PivotMacroData> => {
  if (macroCache && isFresh(macroCacheTs, REFRESH_INTERVALS.MACRO)) {
    return macroCache;
  }

  const [base, vix, dxy] = await Promise.allSettled([
    AlphaVantage.fetchMacroData(),
    Finnhub.fetchVIX(),
    AlphaVantage.fetchDXY(),
  ]);

  const data: PivotMacroData = {
    ...(base.status === "fulfilled" ? base.value : {
      sp500: null, sp500Change: null, gold: null, goldChange: null,
      oil: null, oilChange: null, btc: null, btcChange: null, us10y: null,
    }),
    vix: vix.status === "fulfilled" ? vix.value : null,
    dxy: dxy.status === "fulfilled" ? dxy.value : null,
    timestamp: Date.now(),
  };

  macroCache   = data;
  macroCacheTs = Date.now();
  return data;
};

// ─── Economic Calendar ────────────────────────────────────────

let calendarCache: PivotEconomicEvent[] | null = null;
let calendarTs = 0;

export const getEconomicCalendar = async (): Promise<PivotEconomicEvent[]> => {
  if (calendarCache && isFresh(calendarTs, REFRESH_INTERVALS.CALENDAR)) {
    return calendarCache;
  }
  const events = await AlphaVantage.fetchEconomicCalendar();
  calendarCache = events;
  calendarTs    = Date.now();
  return events;
};

// ─── Screener ─────────────────────────────────────────────────

/**
 * Run screener across a set of tickers.
 * Returns all detected signals sorted by strength.
 */
export const runScreener = async (
  tickers: string[],
): Promise<PivotScreenerSignal[]> => {
  const signals: PivotScreenerSignal[] = [];

  await Promise.allSettled(
    tickers.map(async (ticker) => {
      const [quote, indicators] = await Promise.allSettled([
        getQuote(ticker),
        getIndicators(ticker),
      ]);

      const q = quote.status === "fulfilled" ? quote.value : null;
      const ind = indicators.status === "fulfilled" ? indicators.value : null;
      if (!q || !ind) return;

      // RSI Signal
      const rsiSignal = detectRSISignal(ind.rsi14);
      if (rsiSignal) {
        const strength =
          ind.rsi14! <= 20 || ind.rsi14! >= 80 ? "strong"
          : ind.rsi14! <= 25 || ind.rsi14! >= 75 ? "moderate"
          : "weak";
        signals.push({
          ticker,
          name:          q.name,
          signal:        rsiSignal,
          strength,
          price:         q.price,
          changePercent: q.changePercent,
          details:       `RSI(14) = ${ind.rsi14?.toFixed(1)}`,
          indicators:    ind,
          detectedAt:    Date.now(),
        });
      }

      // Volume Breakout
      if (ind.volumeRatio !== null && detectVolumeBreakout(q.volume, q.avgVolume30d)) {
        signals.push({
          ticker,
          name:          q.name,
          signal:        "VOLUME_BREAKOUT",
          strength:      ind.volumeRatio >= 3 ? "strong" : "moderate",
          price:         q.price,
          changePercent: q.changePercent,
          details:       `Vol ratio: ${ind.volumeRatio?.toFixed(2)}x avg`,
          indicators:    ind,
          detectedAt:    Date.now(),
        });
      }

      // Golden/Death cross (requires yesterday's values — simplified)
      if (ind.sma50 !== null && ind.sma200 !== null) {
        const diff = ind.sma50 - ind.sma200;
        if (Math.abs(diff) / ind.sma200 < 0.005) {
          // Very close to crossing
          signals.push({
            ticker,
            name:          q.name,
            signal:        diff > 0 ? "GOLDEN_CROSS" : "DEATH_CROSS",
            strength:      "moderate",
            price:         q.price,
            changePercent: q.changePercent,
            details:       `SMA50=${ind.sma50.toFixed(2)}, SMA200=${ind.sma200.toFixed(2)}`,
            indicators:    ind,
            detectedAt:    Date.now(),
          });
        }
      }
    }),
  );

  const order = { strong: 0, moderate: 1, weak: 2 };
  return signals.sort((a, b) => order[a.strength] - order[b.strength]);
};

// ─── Market Heatmap Data ──────────────────────────────────────

/** Default market universe for heatmap */
export const MARKET_UNIVERSE = [
  "AAPL","MSFT","NVDA","GOOGL","AMZN","META","TSLA","AVGO","JPM","V",
  "MA","UNH","WMT","JNJ","PG","HD","MRK","CVX","BAC","ABBV",
];

export const getMarketOverview = async (): Promise<PivotQuote[]> => {
  const quotes = await getBatchQuotes(MARKET_UNIVERSE);
  return Array.from(quotes.values());
};
