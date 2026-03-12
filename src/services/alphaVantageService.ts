/**
 * ============================================================
 * ALPHA VANTAGE SERVICE
 * Handles: technical indicators (RSI, SMA), forex (DXY),
 *          economic calendar, macro indicators.
 * Rate limit: 5 req/min, 500 req/day on free tier.
 * ============================================================
 */

import {
  PivotIndicators,
  PivotMacroData,
  PivotEconomicEvent,
} from "./types";
import { throttler, withRetry } from "../utils/throttle";

const BASE_URL = "https://www.alphavantage.co/query";
const getKey   = (): string => import.meta.env.VITE_ALPHAVANTAGE_KEY ?? "";

// ─── Raw API shapes ───────────────────────────────────────────
interface AvRsiData {
  "Technical Analysis: RSI": Record<string, { RSI: string }>;
}

interface AvSmaData {
  "Technical Analysis: SMA": Record<string, { SMA: string }>;
}

interface AvForexQuote {
  "Realtime Currency Exchange Rate": {
    "5. Exchange Rate": string;
  };
}

interface AvQuoteResponse {
  "Global Quote": {
    "05. price":           string;
    "09. change":          string;
    "10. change percent":  string;
    "06. volume":          string;
  };
}

// ─── Helpers ──────────────────────────────────────────────────

const fetchJSON = async <T>(params: Record<string, string>): Promise<T> => {
  const qp  = new URLSearchParams({ ...params, apikey: getKey() });
  const res = await fetch(`${BASE_URL}?${qp}`);
  if (!res.ok) throw new Error(`AlphaVantage ${res.status}`);
  return res.json() as Promise<T>;
};

const parseFloat2 = (s: string | undefined): number | null => {
  if (!s) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};

// ─── Technical Indicators ─────────────────────────────────────

/**
 * Fetch RSI for a ticker (14-period daily).
 */
export const fetchRSI = async (
  ticker: string,
  period = 14,
): Promise<number | null> => {
  if (!throttler.canRequest("alphavantage")) return null;
  try {
    const raw = await withRetry(() =>
      fetchJSON<AvRsiData>({
        function:   "RSI",
        symbol:     ticker,
        interval:   "daily",
        time_period: String(period),
        series_type: "close",
      }),
    );
    const entries = Object.entries(raw["Technical Analysis: RSI"] ?? {});
    if (!entries.length) return null;
    // Most recent entry is first
    return parseFloat2(entries[0][1].RSI);
  } catch (err) {
    console.error("[AlphaVantage] fetchRSI error:", err);
    return null;
  }
};

/**
 * Fetch SMA for a given period.
 */
export const fetchSMA = async (
  ticker: string,
  period: number,
): Promise<number | null> => {
  if (!throttler.canRequest("alphavantage")) return null;
  try {
    const raw = await withRetry(() =>
      fetchJSON<AvSmaData>({
        function:    "SMA",
        symbol:      ticker,
        interval:    "daily",
        time_period: String(period),
        series_type: "close",
      }),
    );
    const entries = Object.entries(raw["Technical Analysis: SMA"] ?? {});
    if (!entries.length) return null;
    return parseFloat2(entries[0][1].SMA);
  } catch (err) {
    console.error("[AlphaVantage] fetchSMA error:", err);
    return null;
  }
};

/**
 * Fetch full indicator set for a ticker (batched calls).
 * Returns combined PivotIndicators.
 */
export const fetchIndicators = async (
  ticker: string,
): Promise<PivotIndicators> => {
  // Fire in sequence to respect rate limits
  const rsi   = await fetchRSI(ticker);
  const sma50  = await fetchSMA(ticker, 50);
  const sma200 = await fetchSMA(ticker, 200);

  return {
    ticker,
    rsi14:        rsi,
    sma50,
    sma200,
    ema20:        null,  // computed locally from candles
    macdLine:     null,
    macdSignal:   null,
    macdHistogram: null,
    volumeRatio:  null,
    atr14:        null,
    timestamp:    Date.now(),
  };
};

// ─── Macro / Forex ────────────────────────────────────────────

/**
 * Fetch DXY (US Dollar Index) as USD/EUR inverse.
 * AV provides forex rates for free.
 */
export const fetchDXY = async (): Promise<number | null> => {
  if (!throttler.canRequest("alphavantage")) return null;
  try {
    const raw = await withRetry(() =>
      fetchJSON<AvForexQuote>({
        function:  "CURRENCY_EXCHANGE_RATE",
        from_currency: "USD",
        to_currency:   "EUR",
      }),
    );
    const rate = parseFloat2(
      raw["Realtime Currency Exchange Rate"]?.["5. Exchange Rate"],
    );
    if (!rate) return null;
    // DXY ≈ 1/USDEUR * 100 (rough proxy)
    return Math.round((1 / rate) * 100 * 100) / 100;
  } catch {
    return null;
  }
};

/**
 * Fetch a global stock/ETF quote via AV (for VIX, SPY, GLD, etc.)
 */
export const fetchAVQuote = async (
  symbol: string,
): Promise<{ price: number; change: number; changePercent: number } | null> => {
  if (!throttler.canRequest("alphavantage")) return null;
  try {
    const raw = await withRetry(() =>
      fetchJSON<AvQuoteResponse>({
        function: "GLOBAL_QUOTE",
        symbol,
      }),
    );
    const q = raw["Global Quote"];
    if (!q) return null;
    const cp = q["10. change percent"]?.replace("%", "");
    return {
      price:         parseFloat2(q["05. price"]) ?? 0,
      change:        parseFloat2(q["09. change"]) ?? 0,
      changePercent: parseFloat2(cp) ?? 0,
    };
  } catch {
    return null;
  }
};

/**
 * Assemble macro dashboard data from multiple symbol fetches.
 */
export const fetchMacroData = async (): Promise<PivotMacroData> => {
  const [sp500, gold, oil, btc] = await Promise.allSettled([
    fetchAVQuote("SPY"),
    fetchAVQuote("GLD"),
    fetchAVQuote("USO"),
    fetchAVQuote("COIN"),
  ]);

  const resolve = (r: PromiseSettledResult<any>) =>
    r.status === "fulfilled" ? r.value : null;

  const sp = resolve(sp500);
  const gl = resolve(gold);
  const ol = resolve(oil);
  const bt = resolve(btc);

  return {
    vix:         null,    // fetched from Finnhub
    dxy:         null,    // fetched separately
    sp500:       sp?.price    ?? null,
    sp500Change: sp?.changePercent ?? null,
    gold:        gl?.price    ?? null,
    goldChange:  gl?.changePercent ?? null,
    oil:         ol?.price    ?? null,
    oilChange:   ol?.changePercent ?? null,
    btc:         bt?.price    ?? null,
    btcChange:   bt?.changePercent ?? null,
    us10y:       null,
    timestamp:   Date.now(),
  };
};

// ─── Economic Calendar (mock data — AV doesn't provide free calendar) ──────

/**
 * NOTE: Alpha Vantage free tier does not expose an economic calendar.
 * In production, replace with Investing.com / Econoday scraper or
 * a dedicated provider. This returns realistic mock data for demo.
 */
export const fetchEconomicCalendar = async (): Promise<PivotEconomicEvent[]> => {
  const now = Date.now();
  const day = 86_400_000;

  return [
    {
      id:         "ev-1",
      title:      "US Non-Farm Payrolls",
      country:    "US",
      datetime:   now + day * 2,
      importance: "high",
      forecast:   "180K",
      previous:   "175K",
      currency:   "USD",
    },
    {
      id:         "ev-2",
      title:      "Fed Interest Rate Decision",
      country:    "US",
      datetime:   now + day * 5,
      importance: "high",
      forecast:   "5.25%",
      previous:   "5.25%",
      currency:   "USD",
    },
    {
      id:         "ev-3",
      title:      "EU CPI (YoY)",
      country:    "EU",
      datetime:   now + day,
      importance: "high",
      forecast:   "2.3%",
      previous:   "2.5%",
      currency:   "EUR",
    },
    {
      id:         "ev-4",
      title:      "US Initial Jobless Claims",
      country:    "US",
      datetime:   now + day * 1,
      importance: "medium",
      forecast:   "215K",
      previous:   "220K",
      currency:   "USD",
    },
    {
      id:         "ev-5",
      title:      "US ISM Manufacturing PMI",
      country:    "US",
      datetime:   now + day * 3,
      importance: "medium",
      forecast:   "48.5",
      previous:   "47.8",
      currency:   "USD",
    },
    {
      id:         "ev-6",
      title:      "JP BoJ Rate Decision",
      country:    "JP",
      datetime:   now + day * 4,
      importance: "high",
      forecast:   "0.10%",
      previous:   "0.10%",
      currency:   "JPY",
    },
    {
      id:         "ev-7",
      title:      "US Retail Sales",
      country:    "US",
      datetime:   now + day * 6,
      importance: "medium",
      forecast:   "0.3%",
      previous:   "0.6%",
      currency:   "USD",
    },
    {
      id:         "ev-8",
      title:      "US CPI Core (MoM)",
      country:    "US",
      datetime:   now - day,
      importance: "high",
      actual:     "0.3%",
      forecast:   "0.3%",
      previous:   "0.4%",
      currency:   "USD",
    },
  ];
};
