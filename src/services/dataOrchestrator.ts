/**
 * ============================================================
 * DATA ORCHESTRATOR
 * Corrections :
 *   - Golden/Death Cross calculé sur 2 jours consécutifs réels
 *   - Calendrier économique délégué à Finnhub (données réelles)
 *   - isMockMode() supprimé des données — 0 hardcodé
 * ============================================================
 */

import * as Finnhub      from "./finnhubService";
import * as Polygon      from "./polygonService";
import * as AlphaVantage from "./alphaVantageService";
import { fetchMacroMarket } from "./macroService";
import * as Yahoo          from "./yahooFinanceService";
import { REFRESH_INTERVALS } from "../utils/throttle";
import {
  calcRSI, calcSMA, calcEMA, calcATR, calcMACD,
  detectRSISignal, detectVolumeBreakout, detectMACrossSignal,
} from "../utils/financialCalculations";
import type {
  PivotQuote, PivotCandle, PivotNewsItem, PivotIndicators,
  PivotMacroData, PivotScreenerSignal, PivotEconomicEvent, DataSource,
} from "./types";
import { CAC40_TICKERS, SP500_TOP20, TICKER_REGISTRY } from "./mockDataService";

// ─── Cache ────────────────────────────────────────────────────

const cache = {
  quotes:     new Map<string, { data: PivotQuote;      ts: number }>(),
  candles:    new Map<string, { data: PivotCandle[];   ts: number }>(),
  news:       new Map<string, { data: PivotNewsItem[]; ts: number }>(),
  indicators: new Map<string, { data: PivotIndicators; ts: number }>(),
};

const isFresh = (ts: number, maxAge: number): boolean => Date.now() - ts < maxAge;

// ─── Exchange Routing ─────────────────────────────────────────

const EURONEXT_SUFFIXES = [".PA", ".BR", ".AM", ".LB"] as const;
const OTHER_EU_SUFFIXES  = [".DE", ".F",  ".L",  ".MI", ".MC"] as const;

const isFinnhubBlocked = (ticker: string): boolean => {
  const upper = ticker.toUpperCase();
  return [...EURONEXT_SUFFIXES, ...OTHER_EU_SUFFIXES].some((sfx) => upper.endsWith(sfx));
};

const inferExchangeMeta = (
  ticker: string,
): Pick<PivotQuote, "currency" | "exchange" | "country"> => {
  const t = ticker.toUpperCase();
  if (t.endsWith(".PA") || t.endsWith(".BR") || t.endsWith(".AM"))
    return { currency: "EUR", exchange: "EURONEXT", country: "FR" };
  if (t.endsWith(".DE") || t.endsWith(".F"))
    return { currency: "EUR", exchange: "XETRA", country: "DE" };
  if (t.endsWith(".L"))
    return { currency: "GBP", exchange: "LSE", country: "GB" };
  if (t.endsWith(".MI") || t.endsWith(".MC"))
    return { currency: "EUR", exchange: "EURONEXT", country: "FR" };
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

// ─── Quote Fetch ──────────────────────────────────────────────

export const getQuote = async (ticker: string): Promise<PivotQuote | null> => {
  const cached = cache.quotes.get(ticker);
  if (cached && isFresh(cached.ts, REFRESH_INTERVALS.REALTIME)) return cached.data;

  let quote: PivotQuote | null = null;

  if (isFinnhubBlocked(ticker)) {
    quote = await Yahoo.fetchQuote(ticker);
  } else {
    quote = await Finnhub.fetchQuote(ticker);
    if (!quote) {
      const snaps = await Polygon.fetchSnapshots([ticker]);
      quote = snaps[0] ?? null;
    }
    if (!quote) {
      const av = await AlphaVantage.fetchAVQuote(ticker);
      if (av) quote = avQuoteToPivot(ticker, av);
    }
  }

  if (quote) cache.quotes.set(ticker, { data: quote, ts: Date.now() });
  return quote;
};

export const getBatchQuotes = async (tickers: string[]): Promise<Map<string, PivotQuote>> => {
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

export const getCandles = async (ticker: string, days = 60): Promise<PivotCandle[]> => {
  const cached = cache.candles.get(ticker);
  if (cached && isFresh(cached.ts, REFRESH_INTERVALS.TECHNICAL)) return cached.data;

  let candles: PivotCandle[] = [];

  if (isFinnhubBlocked(ticker)) {
    candles = await Yahoo.fetchCandles(ticker, days);
  } else {
    candles = await Polygon.fetchDailyCandles(ticker, days);
    if (!candles.length) candles = await Finnhub.fetchCandles(ticker, "D", days);
  }

  cache.candles.set(ticker, { data: candles, ts: Date.now() });
  return candles;
};

export const getCloses = (candles: PivotCandle[]): number[] => candles.map((c) => c.close);

// ─── Indicators ───────────────────────────────────────────────

export const getIndicators = async (ticker: string): Promise<PivotIndicators> => {
  const cached = cache.indicators.get(ticker);
  if (cached && isFresh(cached.ts, REFRESH_INTERVALS.TECHNICAL)) return cached.data;

  // 221 candles pour avoir SMA200 + 1 jour précédent (pour le cross)
  const candles = await getCandles(ticker, 221);
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

// ─── News ─────────────────────────────────────────────────────

export const getPortfolioNews = async (tickers: string[]): Promise<PivotNewsItem[]> => {
  const allNews: PivotNewsItem[] = [];
  const seen = new Set<string>();

  await Promise.allSettled(
    tickers.map(async (t) => {
      const cached = cache.news.get(t);
      if (cached && isFresh(cached.ts, REFRESH_INTERVALS.NEWS)) {
        cached.data.forEach((n) => { if (!seen.has(n.id)) { seen.add(n.id); allNews.push(n); } });
        return;
      }
      let news: PivotNewsItem[];
      if (isFinnhubBlocked(t)) {
        news = await AlphaVantage.fetchEUNews(t, 5);
      } else {
        news = await Finnhub.fetchCompanyNews(t, 3);
      }
      cache.news.set(t, { data: news, ts: Date.now() });
      news.forEach((n) => { if (!seen.has(n.id)) { seen.add(n.id); allNews.push(n); } });
    }),
  );

  return allNews.sort((a, b) => b.publishedAt - a.publishedAt);
};

// ─── Macro ────────────────────────────────────────────────────

let macroCacheTs = 0;
let macroCache: PivotMacroData | null = null;

export const getMacroData = async (): Promise<PivotMacroData> => {
  if (macroCache && isFresh(macroCacheTs, REFRESH_INTERVALS.MACRO)) return macroCache;
  const data = await fetchMacroMarket();
  macroCache = data; macroCacheTs = Date.now();
  return data;
};

// ─── Economic Calendar — données réelles Finnhub ──────────────

let calendarCache: PivotEconomicEvent[] | null = null;
let calendarTs = 0;

export const getEconomicCalendar = async (targetDate?: Date): Promise<PivotEconomicEvent[]> => {
  if (!targetDate && calendarCache && isFresh(calendarTs, REFRESH_INTERVALS.CALENDAR))
    return calendarCache;

  // Délégue à AlphaVantage qui délègue lui-même à Finnhub /calendar/economic
  const events = await AlphaVantage.fetchEconomicCalendar(targetDate);

  if (!targetDate) { calendarCache = events; calendarTs = Date.now(); }
  return events;
};

// ─── Screener ─────────────────────────────────────────────────

export type ScreenerProgressCb = (completed: number, total: number, current: string) => void;

const screenerProcessTicker = async (
  ticker: string, signals: PivotScreenerSignal[],
): Promise<void> => {
  const [quoteResult, indResult] = await Promise.allSettled([
    getQuote(ticker), getIndicators(ticker),
  ]);

  const q   = quoteResult.status  === "fulfilled" ? quoteResult.value  : null;
  const ind = indResult.status === "fulfilled" ? indResult.value : null;

  if (!q || !ind) return;

  const meta     = getTickerMeta(ticker);
  const currency = q.currency ?? "USD";
  const exchange = q.exchange ?? meta.exchange;
  const country  = q.country  ?? meta.country;
  const sector   = q.sector   ?? meta.sector;

  // ── RSI Signal ────────────────────────────────────────────
  const rsiSignal = detectRSISignal(ind.rsi14);
  if (rsiSignal) {
    const strength =
      ind.rsi14! <= 20 || ind.rsi14! >= 80 ? "strong"
      : ind.rsi14! <= 25 || ind.rsi14! >= 75 ? "moderate"
      : "weak";
    signals.push({
      ticker, name: q.name, signal: rsiSignal, strength,
      price: q.price, currency, exchange, country, sector,
      changePercent: q.changePercent,
      details: `RSI(14) = ${ind.rsi14?.toFixed(1)}`,
      indicators: ind, detectedAt: Date.now(),
    });
  }

  // ── Volume Breakout ───────────────────────────────────────
  if (ind.volumeRatio !== null && detectVolumeBreakout(q.volume, q.avgVolume30d)) {
    signals.push({
      ticker, name: q.name, signal: "VOLUME_BREAKOUT",
      strength: ind.volumeRatio >= 3 ? "strong" : "moderate",
      price: q.price, currency, exchange, country, sector,
      changePercent: q.changePercent,
      details: `Vol ${ind.volumeRatio.toFixed(2)}x avg 30j`,
      indicators: ind, detectedAt: Date.now(),
    });
  }

  // ── Golden / Death Cross CORRIGE ─────────────────────────
  // On calcule les SMA sur J-1 pour avoir le vrai croisement 2 jours consécutifs.
  // On récupère les candles pour recalculer les SMA sur n-1 bars.
  const candles = cache.candles.get(ticker)?.data ?? [];
  if (candles.length >= 201 && ind.sma50 !== null && ind.sma200 !== null) {
    const closesYday = candles.slice(0, -1).map((c) => c.close);
    const prevSma50  = calcSMA(closesYday, 50);
    const prevSma200 = calcSMA(closesYday, 200);
    const cross = detectMACrossSignal(ind.sma50, ind.sma200, prevSma50, prevSma200);
    if (cross) {
      signals.push({
        ticker, name: q.name, signal: cross, strength: "moderate",
        price: q.price, currency, exchange, country, sector,
        changePercent: q.changePercent,
        details: `SMA50 ${ind.sma50.toFixed(2)} / SMA200 ${ind.sma200.toFixed(2)}`,
        indicators: ind, detectedAt: Date.now(),
      });
    }
  }

  // ── MACD Signal (nouveau) ─────────────────────────────────
  // Croisement MACD line / signal line → signal réel grâce au MACD corrigé
  if (ind.macdLine !== null && ind.macdSignal !== null && ind.macdHistogram !== null) {
    // Croisement haussier : histogramme passe positif
    if (ind.macdHistogram > 0 && ind.macdLine > ind.macdSignal) {
      const strength = Math.abs(ind.macdHistogram) > Math.abs(ind.macdLine) * 0.1 ? "moderate" : "weak";
      signals.push({
        ticker, name: q.name, signal: "PRICE_BREAKOUT", strength,
        price: q.price, currency, exchange, country, sector,
        changePercent: q.changePercent,
        details: `MACD ${ind.macdLine.toFixed(3)} > Signal ${ind.macdSignal.toFixed(3)} (histo: +${ind.macdHistogram.toFixed(3)})`,
        indicators: ind, detectedAt: Date.now(),
      });
    }
  }
};

export const runScreener = async (
  tickers: string[], onProgress?: ScreenerProgressCb,
): Promise<PivotScreenerSignal[]> => {
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

// ─── Market Universes ─────────────────────────────────────────

export const MARKET_UNIVERSE  = SP500_TOP20.map((m) => m.ticker);
export const CAC40_UNIVERSE   = CAC40_TICKERS.map((m) => m.ticker);
export const GLOBAL_UNIVERSE  = [...MARKET_UNIVERSE, ...CAC40_UNIVERSE];
export type  MarketRegion     = "US" | "FR" | "GLOBAL";

export const getMarketOverview = async (region: MarketRegion = "US"): Promise<PivotQuote[]> => {
  const universe =
    region === "FR"     ? CAC40_UNIVERSE  :
    region === "GLOBAL" ? GLOBAL_UNIVERSE :
    MARKET_UNIVERSE;

  const realQuotes = await getBatchQuotes(universe);
  // Retourner seulement les tickers pour lesquels on a une vraie quote
  return universe
    .map((ticker) => realQuotes.get(ticker))
    .filter((q): q is PivotQuote => q !== undefined);
};

export const getTickerMeta = (ticker: string) =>
  TICKER_REGISTRY.get(ticker) ?? {
    ticker, name: ticker, sector: "Unknown",
    exchange: "NYSE" as const, country: "US" as const, basePrice: 100,
  };
