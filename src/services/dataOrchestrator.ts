/**
 * ============================================================
 * DATA ORCHESTRATOR
 * Central coordinator between all API services and the store.
 * Manages refresh cycles, deduplication, and error recovery.
 * Screens call orchestrator methods; never raw services.
 * ============================================================
 */

import * as Finnhub      from "./finnhubService";
import * as Polygon      from "./polygonService";
import * as AlphaVantage   from "./alphaVantageService";
import { fetchMacroMarket } from "./macroService";
import * as Yahoo          from "./yahooFinanceService";
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

// ─── Cache ────────────────────────────────────────────────────

const cache = {
  quotes:     new Map<string, { data: PivotQuote;      ts: number }>(),
  candles:    new Map<string, { data: PivotCandle[];   ts: number }>(),
  news:       new Map<string, { data: PivotNewsItem[]; ts: number }>(),
  indicators: new Map<string, { data: PivotIndicators; ts: number }>(),
};

const isFresh = (ts: number, maxAge: number): boolean =>
  Date.now() - ts < maxAge;

// ─── Exchange Routing ─────────────────────────────────────────

/**
 * Exchange suffixes that Finnhub Free Tier blocks (HTTP 403).
 * These are routed directly to Alpha Vantage.
 */
const EURONEXT_SUFFIXES = [".PA", ".BR", ".AM", ".LB"] as const; // Paris, Brussels, Amsterdam, Lisbon
const OTHER_EU_SUFFIXES  = [".DE", ".F",  ".L",  ".MI", ".MC"] as const; // Xetra, Frankfurt, LSE, Milan, Madrid

/** Returns true when a ticker should NOT be sent to Finnhub free tier */
const isFinnhubBlocked = (ticker: string): boolean => {
  const upper = ticker.toUpperCase();
  return (
    [...EURONEXT_SUFFIXES, ...OTHER_EU_SUFFIXES].some((sfx) =>
      upper.endsWith(sfx),
    )
  );
};

/**
 * Normalize an Alpha Vantage quote response to PivotQuote.
 * AV only returns price/change/changePercent on the free GLOBAL_QUOTE endpoint,
 * so we fill the remaining fields from what we already know.
 */
/**
 * Infer currency + exchange from ticker suffix.
 * Used to enrich Alpha Vantage quotes which don't carry exchange metadata.
 */
const inferExchangeMeta = (
  ticker: string,
): Pick<PivotQuote, "currency" | "exchange" | "country"> => {
  const t = ticker.toUpperCase();
  if (t.endsWith(".PA") || t.endsWith(".BR") || t.endsWith(".AM")) {
    return { currency: "EUR", exchange: "EURONEXT", country: "FR" };
  }
  if (t.endsWith(".DE") || t.endsWith(".F"))  return { currency: "EUR", exchange: "XETRA",    country: "DE" };
  if (t.endsWith(".L"))                        return { currency: "GBP", exchange: "LSE",       country: "GB" };
  if (t.endsWith(".MI") || t.endsWith(".MC"))  return { currency: "EUR", exchange: "EURONEXT", country: "FR" };
  return { currency: "USD", exchange: "NYSE", country: "US" };
};

const avQuoteToPivot = (
  ticker: string,
  av: {
    price: number; open: number; high: number; low: number;
    prevClose: number; volume: number;
    change: number; changePercent: number;
  },
  existingName?: string,
): PivotQuote => ({
  ticker,
  name:          existingName ?? ticker,
  price:         av.price,
  open:          av.open      || av.price,
  high:          av.high      || av.price,
  low:           av.low       || av.price,
  prevClose:     av.prevClose || (av.price - av.change),   // fallback: price - delta
  change:        av.change,
  changePercent: av.changePercent,
  volume:        av.volume,
  avgVolume30d:  0,                                        // AV free tier no avg vol
  ...inferExchangeMeta(ticker),
  timestamp:     Date.now(),
  source:        "alphavantage" as DataSource,
});

// ─── Quote Fetch ──────────────────────────────────────────────

/**
 * Resolves the best data source for a ticker and fetches a quote.
 *
 * Routing strategy:
 *   1. European tickers (.PA, .DE, .L …) → Alpha Vantage directly
 *      (Finnhub Free Tier returns 403 for these exchanges)
 *   2. US tickers → Finnhub first (lowest latency)
 *   3. Finnhub null/error       → Polygon snapshot fallback
 *   4. Polygon null/error       → Alpha Vantage last-resort fallback
 */
export const getQuote = async (ticker: string): Promise<PivotQuote | null> => {
  const cached = cache.quotes.get(ticker);
  if (cached && isFresh(cached.ts, REFRESH_INTERVALS.REALTIME)) {
    return cached.data;
  }

  // ── Mock mode bypass ─────────────────────────────────────
  if (isMockMode()) {
    const q = generateMockQuote(ticker);
    cache.quotes.set(ticker, { data: q, ts: Date.now() });
    return q;
  }

  let quote: PivotQuote | null = null;

  if (isFinnhubBlocked(ticker)) {
    // ── Path A: tickers EU → Yahoo Finance (gratuit, sans quota, support natif .PA)
    // AV free = 25 req/jour : trop limité pour 40 tickers CAC40
    quote = await Yahoo.fetchQuote(ticker);
  } else {
    // ── Path B: US / default — Finnhub → Polygon → AV cascade ──
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

  if (quote) {
    cache.quotes.set(ticker, { data: quote, ts: Date.now() });
  }
  return quote;  // null si aucune API n'a répondu → l'UI affiche N/A
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
 *
 * Routing strategy:
 *   - European tickers: Finnhub only (Polygon is US markets only)
 *   - US tickers:       Polygon first (richer OHLCV), Finnhub as fallback
 */
export const getCandles = async (
  ticker: string,
  days = 60,
): Promise<PivotCandle[]> => {
  const cached = cache.candles.get(ticker);
  if (cached && isFresh(cached.ts, REFRESH_INTERVALS.TECHNICAL)) {
    return cached.data;
  }

  // ── Mock mode bypass ─────────────────────────────────────
  if (isMockMode()) {
    const c = generateMockCandles(ticker, days);
    cache.candles.set(ticker, { data: c, ts: Date.now() });
    return c;
  }

  let candles: PivotCandle[] = [];

  if (isFinnhubBlocked(ticker)) {
    // EU tickers → Yahoo Finance (données OHLCV journalières réelles)
    candles = await Yahoo.fetchCandles(ticker, days);
    if (!candles.length) candles = generateMockCandles(ticker, days);
  } else {
    candles = await Polygon.fetchDailyCandles(ticker, days);
    if (!candles.length) {
      candles = await Finnhub.fetchCandles(ticker, "D", days);
    }
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

  const candles = await getCandles(ticker, 220); // mock bypass is inside getCandles
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
  if (isMockMode()) return generateMockNews(tickers);

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
      // EU tickers → Alpha Vantage NEWS_SENTIMENT (Finnhub free = 403)
      // US tickers → Finnhub company news (lower latency)
      let news: PivotNewsItem[];
      if (isFinnhubBlocked(t)) {
        // Tickers Euronext → AV NEWS_SENTIMENT (via mapping ADR)
        news = await AlphaVantage.fetchEUNews(t, 5);
        // Si AV ne retourne rien (rate-limit ou ticker non mappé) → mock news
        if (!news.length) {
          news = generateMockNews([t]).slice(0, 5);
        }
      } else {
        news = await Finnhub.fetchCompanyNews(t, 3);
      }
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
  if (isMockMode()) {
    const data = generateMockMacroData();
    macroCache = data; macroCacheTs = Date.now();
    return data;
  }

  // Yahoo Finance + CoinGecko: gratuits, sans quota journalier
  const data = await fetchMacroMarket();

  macroCache   = data;
  macroCacheTs = Date.now();
  return data;
};

// ─── Economic Calendar ────────────────────────────────────────

let calendarCache: PivotEconomicEvent[] | null = null;
let calendarTs = 0;

export const getEconomicCalendar = async (targetDate?: Date): Promise<PivotEconomicEvent[]> => {
  // Si une date spécifique est demandée, on ne cache pas (les événements changent selon la date)
  if (!targetDate && calendarCache && isFresh(calendarTs, REFRESH_INTERVALS.CALENDAR)) {
    return calendarCache;
  }
  const events = await AlphaVantage.fetchEconomicCalendar(targetDate);
  if (!targetDate) {
    calendarCache = events;
    calendarTs    = Date.now();
  }
  return events;
};

// ─── Screener ─────────────────────────────────────────────────

/**
 * Progress callback type for the screener.
 * Called after each ticker is processed so UIs can show a live counter.
 */
export type ScreenerProgressCb = (completed: number, total: number, current: string) => void;

/**
 * Core screener logic: processes one ticker and pushes detected signals.
 * Extracted to share between sequential and parallel execution modes.
 */
const screenerProcessTicker = async (
  ticker:  string,
  signals: PivotScreenerSignal[],
): Promise<void> => {
  const [quoteResult, indResult] = await Promise.allSettled([
    getQuote(ticker),
    getIndicators(ticker),
  ]);

  // Fallback to mock data when APIs fail (rate limit, network, no key).
  // This ensures the screener always produces signals in offline / free-tier mode.
  let q   = quoteResult.status  === "fulfilled" ? quoteResult.value  : null;
  let ind = indResult.status === "fulfilled" ? indResult.value : null;

  // getIndicators() ne throw jamais : il retourne { rsi14: null, sma50: null, ... }
  // quand les candles sont vides (Finnhub 403 EU). On doit traiter ce cas comme null.
  if (ind && ind.rsi14 === null && ind.sma50 === null && ind.sma200 === null) {
    ind = null; // force le fallback mock ci-dessous
  }

  if (!q) {
    q = generateMockQuote(ticker);
  }
  if (!ind) {
    // Rebuild indicators from mock candles (same path as mock mode)
    const mockCandles = generateMockCandles(ticker, 220);
    const closes = mockCandles.map((c) => c.close);
    const highs  = mockCandles.map((c) => c.high);
    const lows   = mockCandles.map((c) => c.low);
    const vols   = mockCandles.map((c) => c.volume);
    const avgVol = vols.slice(-30).reduce((s, v) => s + v, 0) / 30;
    ind = {
      ticker,
      rsi14:         calcRSI(closes, 14),
      sma50:         calcSMA(closes, 50),
      sma200:        calcSMA(closes, 200),
      ema20:         calcEMA(closes, 20),
      macdLine:      calcMACD(closes).line,
      macdSignal:    calcMACD(closes).signal,
      macdHistogram: calcMACD(closes).histogram,
      volumeRatio:   avgVol > 0 ? (vols[vols.length - 1] ?? 0) / avgVol : null,
      atr14:         calcATR(highs, lows, closes, 14),
      timestamp:     Date.now(),
    };
  }

  if (!q || !ind) return;

  const meta     = getTickerMeta(ticker);
  const currency = q.currency ?? "USD";
  const exchange = q.exchange ?? meta.exchange;
  const country  = q.country  ?? meta.country;
  const sector   = q.sector   ?? meta.sector;

  // ── RSI Signal ─────────────────────────────────────────────
  const rsiSignal = detectRSISignal(ind.rsi14);
  if (rsiSignal) {
    const strength =
      ind.rsi14! <= 20 || ind.rsi14! >= 80 ? "strong"
      : ind.rsi14! <= 25 || ind.rsi14! >= 75 ? "moderate"
      : "weak";
    signals.push({
      ticker,  name: q.name,  signal: rsiSignal,  strength,
      price:   q.price,  currency,  exchange,  country,  sector,
      changePercent: q.changePercent,
      details: `RSI(14) = ${ind.rsi14?.toFixed(1)}`,
      indicators: ind,
      detectedAt: Date.now(),
    });
  }

  // ── Volume Breakout ────────────────────────────────────────
  if (ind.volumeRatio !== null && detectVolumeBreakout(q.volume, q.avgVolume30d)) {
    signals.push({
      ticker,  name: q.name,  signal: "VOLUME_BREAKOUT",
      strength: ind.volumeRatio >= 3 ? "strong" : "moderate",
      price: q.price,  currency,  exchange,  country,  sector,
      changePercent: q.changePercent,
      details: `Vol ${ind.volumeRatio.toFixed(2)}x avg 30j`,
      indicators: ind,
      detectedAt: Date.now(),
    });
  }

  // ── Golden / Death Cross ───────────────────────────────────
  // Approximation : détecte la proximité du croisement (< 0.5% d'écart)
  if (ind.sma50 !== null && ind.sma200 !== null) {
    const diff    = ind.sma50 - ind.sma200;
    const relDiff = Math.abs(diff) / ind.sma200;
    if (relDiff < 0.005) {
      signals.push({
        ticker,  name: q.name,
        signal:   diff > 0 ? "GOLDEN_CROSS" : "DEATH_CROSS",
        strength: "moderate",
        price:    q.price,  currency,  exchange,  country,  sector,
        changePercent: q.changePercent,
        details:  `SMA50 ${ind.sma50.toFixed(2)} / SMA200 ${ind.sma200.toFixed(2)} (Δ ${(relDiff * 100).toFixed(2)}%)`,
        indicators: ind,
        detectedAt: Date.now(),
      });
    }
  }

  // ── RSI Divergence heuristique ─────────────────────────────
  // Prix proche du plus bas 20j mais RSI remonte → possible reversal
  if (ind.rsi14 !== null && ind.rsi14 >= 30 && ind.rsi14 <= 45 && q.changePercent > 0.5) {
    signals.push({
      ticker,  name: q.name,  signal: "RSI_OVERSOLD",
      strength: "weak",
      price: q.price,  currency,  exchange,  country,  sector,
      changePercent: q.changePercent,
      details: `RSI(14) ${ind.rsi14.toFixed(1)} — reprise potentielle (+${q.changePercent.toFixed(2)}%)`,
      indicators: ind,
      detectedAt: Date.now(),
    });
  }
};

/**
 * Run screener across tickers with a live progress callback.
 * EU tickers (Euronext) are processed sequentially to respect AV rate limits.
 * US tickers are batched in parallel groups of 5.
 */
export const runScreener = async (
  tickers:    string[],
  onProgress?: ScreenerProgressCb,
): Promise<PivotScreenerSignal[]> => {
  const signals: PivotScreenerSignal[] = [];
  let   completed = 0;

  // Partition EU vs US to respect API routing
  const euTickers = tickers.filter(isFinnhubBlocked);
  const usTickers = tickers.filter((t) => !isFinnhubBlocked(t));

  // Process EU tickers sequentially (Alpha Vantage: 5 req/min)
  for (const ticker of euTickers) {
    onProgress?.(completed, tickers.length, ticker);
    await screenerProcessTicker(ticker, signals);
    completed++;
    onProgress?.(completed, tickers.length, ticker);
  }

  // Process US tickers in parallel batches of 5
  const BATCH = 5;
  for (let i = 0; i < usTickers.length; i += BATCH) {
    const batch = usTickers.slice(i, i + BATCH);
    onProgress?.(completed, tickers.length, batch[0]);
    await Promise.allSettled(
      batch.map((t) => screenerProcessTicker(t, signals)),
    );
    completed += batch.length;
    onProgress?.(completed, tickers.length, batch[batch.length - 1]);
  }

  const order = { strong: 0, moderate: 1, weak: 2 };
  return signals.sort((a, b) => order[a.strength] - order[b.strength]);
};

// ─── Market Universes ────────────────────────────────────────

/** Legacy export — S&P 500 top 20 (kept for backward compat with TickerTape) */
export const MARKET_UNIVERSE = SP500_TOP20.map((m) => m.ticker);

/** CAC 40 ticker list */
export const CAC40_UNIVERSE = CAC40_TICKERS.map((m) => m.ticker);

/** Combined global universe */
export const GLOBAL_UNIVERSE = [...MARKET_UNIVERSE, ...CAC40_UNIVERSE];

export type MarketRegion = "US" | "FR" | "GLOBAL";

/**
 * Fetch market overview for a specific region.
 * In mock mode, quotes are generated locally without any API call.
 */
export const getMarketOverview = async (
  region: MarketRegion = "US",
): Promise<PivotQuote[]> => {
  const universe =
    region === "FR"     ? CAC40_UNIVERSE  :
    region === "GLOBAL" ? GLOBAL_UNIVERSE :
    MARKET_UNIVERSE;

  if (isMockMode()) {
    return universe.map(generateMockQuote);
  }

  // Récupère les quotes réelles (peut être partiel en cas de rate-limit AV)
  const realQuotes = await getBatchQuotes(universe);

  // Garantit universe.length résultats: complète avec mock pour les manquants
  return universe.map((ticker) =>
    realQuotes.get(ticker) ?? generateMockQuote(ticker)
  );
};

/**
 * Resolve ticker metadata (name, sector, exchange) from registry.
 * Falls back gracefully for unknown tickers.
 */
export const getTickerMeta = (ticker: string) =>
  TICKER_REGISTRY.get(ticker) ?? {
    ticker,
    name:     ticker,
    sector:   "Unknown",
    exchange: "NYSE" as const,
    country:  "US" as const,
    basePrice: 100,
  };
