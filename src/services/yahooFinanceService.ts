/**
 * ============================================================
 * YAHOO FINANCE SERVICE
 * Source principale pour les tickers non-US (Euronext, LSE, Xetra…)
 * 
 * Avantages :
 *   - Gratuit, sans clé API
 *   - Supporte nativement BNP.PA, MC.PA, AIR.PA, MT.AS, STM.PA…
 *   - Données temps réel (~15min delay sur free tier)
 *   - Retourne open, prevClose, volume, marketCap
 * 
 * Endpoint : https://query1.finance.yahoo.com/v8/finance/chart/{ticker}
 * ============================================================
 */

import { PivotQuote, PivotCandle } from "./types";
import { throttler, withRetry } from "../utils/throttle";

const BASE = "https://query1.finance.yahoo.com";

// ─── Raw API shapes ───────────────────────────────────────────

interface YahooChartMeta {
  symbol:                      string;
  regularMarketPrice:          number;
  regularMarketOpen:           number;
  regularMarketDayHigh:        number;
  regularMarketDayLow:         number;
  regularMarketPreviousClose:  number;
  regularMarketVolume:         number;
  regularMarketChange:         number;
  regularMarketChangePercent:  number;
  averageDailyVolume3Month?:   number;
  marketCap?:                  number;
  longName?:                   string;
  shortName?:                  string;
  currency?:                   string;
  exchangeTimezoneName?:       string;
  fiftyTwoWeekHigh?:           number;
  fiftyTwoWeekLow?:            number;
}

interface YahooChartResponse {
  chart: {
    result?: Array<{
      meta:        YahooChartMeta;
      timestamp?:  number[];
      indicators?: {
        quote?: Array<{
          open:   (number | null)[];
          high:   (number | null)[];
          low:    (number | null)[];
          close:  (number | null)[];
          volume: (number | null)[];
        }>;
      };
    }>;
    error?: { code: string; description: string };
  };
}

// ─── Currency inference ───────────────────────────────────────

const inferCurrency = (
  yahooCurrency?: string,
  ticker?: string,
): PivotQuote["currency"] => {
  if (yahooCurrency) {
    const c = yahooCurrency.toUpperCase();
    if (c === "EUR") return "EUR";
    if (c === "GBP" || c === "GBp") return "GBP";  // London quotes in pence
    if (c === "JPY") return "JPY";
    if (c === "CHF") return "CHF";
  }
  // Fallback sur le suffixe ticker
  if (ticker) {
    const t = ticker.toUpperCase();
    if (t.endsWith(".PA") || t.endsWith(".BR") || t.endsWith(".AS") ||
        t.endsWith(".MI") || t.endsWith(".MC") || t.endsWith(".DE") || t.endsWith(".F")) {
      return "EUR";
    }
    if (t.endsWith(".L"))  return "GBP";
    if (t.endsWith(".T"))  return "JPY";
    if (t.endsWith(".SW") || t.endsWith(".VX")) return "CHF";
  }
  return "USD";
};

const inferExchange = (ticker: string): PivotQuote["exchange"] => {
  const t = ticker.toUpperCase();
  if (t.endsWith(".PA") || t.endsWith(".BR") || t.endsWith(".AS") ||
      t.endsWith(".MI") || t.endsWith(".MC")) return "EURONEXT";
  if (t.endsWith(".DE") || t.endsWith(".F"))  return "XETRA";
  if (t.endsWith(".L"))                        return "LSE";
  return "NYSE";
};

const inferCountry = (ticker: string): PivotQuote["country"] => {
  const t = ticker.toUpperCase();
  if (t.endsWith(".PA") || t.endsWith(".BR")) return "FR";
  if (t.endsWith(".AS"))                       return "NL";
  if (t.endsWith(".MI"))                       return "FR"; // Stellantis listed FR
  if (t.endsWith(".MC"))                       return "FR";
  if (t.endsWith(".DE") || t.endsWith(".F"))   return "DE";
  if (t.endsWith(".L"))                        return "GB";
  return "US";
};

// ─── Fetch helpers ────────────────────────────────────────────

const fetchChart = async (
  ticker: string,
  interval = "1d",
  range    = "5d",
): Promise<YahooChartResponse | null> => {
  try {
    const url  = `${BASE}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}&includePrePost=false`;
    const res  = await fetch(url, {
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
};

// ─── Public API ───────────────────────────────────────────────

/**
 * Fetch real-time quote for any ticker Yahoo Finance supports.
 * Works natively with .PA, .AS, .MI, .L, .DE suffixes.
 */
export const fetchQuote = async (
  ticker: string,
): Promise<PivotQuote | null> => {
  if (!throttler.canRequest("yahoo")) return null;

  try {
    const raw = await withRetry(() => fetchChart(ticker, "1d", "5d"));
    const result = raw?.chart?.result?.[0];
    if (!result) return null;

    const m = result.meta;
    if (!m.regularMarketPrice) return null;

    const currency = inferCurrency(m.currency, ticker);
    // London Stock Exchange quotes pence (GBp) → convertir en livres
    const penceToGBP = m.currency === "GBp" ? 0.01 : 1;

    const price     = m.regularMarketPrice          * penceToGBP;
    const open      = (m.regularMarketOpen          ?? price)  * penceToGBP;
    const high      = (m.regularMarketDayHigh        ?? price)  * penceToGBP;
    const low       = (m.regularMarketDayLow         ?? price)  * penceToGBP;
    const prevClose = (m.regularMarketPreviousClose  ?? price)  * penceToGBP;
    const change    = m.regularMarketChange          * penceToGBP;
    const changePct = m.regularMarketChangePercent   ?? 0;

    return {
      ticker,
      name:          m.longName ?? m.shortName ?? ticker,
      price,
      open,
      high,
      low,
      prevClose,
      change,
      changePercent: changePct,
      volume:        m.regularMarketVolume         ?? 0,
      avgVolume30d:  m.averageDailyVolume3Month    ?? 0,
      marketCap:     m.marketCap,
      currency,
      exchange:      inferExchange(ticker),
      country:       inferCountry(ticker),
      timestamp:     Date.now(),
      source:        "finnhub", // réutilise source "live" pour styling
    };
  } catch {
    return null;
  }
};

/**
 * Fetch daily candles for EU tickers.
 * range="3mo" gives ~60 trading days — enough for RSI/SMA calculations.
 */
export const fetchCandles = async (
  ticker: string,
  days   = 60,
): Promise<PivotCandle[]> => {
  if (!throttler.canRequest("yahoo")) return [];

  // Map days → Yahoo range param
  const range = days <= 30 ? "1mo" : days <= 90 ? "3mo" : days <= 180 ? "6mo" : "1y";

  try {
    const raw = await withRetry(() => fetchChart(ticker, "1d", range));
    const result = raw?.chart?.result?.[0];
    if (!result?.timestamp?.length) return [];

    const q        = result.indicators?.quote?.[0];
    const pence    = result.meta.currency === "GBp" ? 0.01 : 1;
    const tickers  = result.timestamp;

    return tickers
      .map((ts, i) => ({
        ticker,
        time:   ts * 1000,
        open:   (q?.open[i]   ?? 0) * pence,
        high:   (q?.high[i]   ?? 0) * pence,
        low:    (q?.low[i]    ?? 0) * pence,
        close:  (q?.close[i]  ?? 0) * pence,
        volume: q?.volume[i]  ?? 0,
      }))
      .filter((c) => c.close > 0)
      .slice(-days);
  } catch {
    return [];
  }
};
