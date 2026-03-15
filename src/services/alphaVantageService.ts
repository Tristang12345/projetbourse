/**
 * ============================================================
 * ALPHA VANTAGE SERVICE
 * Corrections :
 *   - Clés chargées via useApiKeys (sécurisé)
 *   - fetchEconomicCalendar délégué à Finnhub (données réelles)
 * ============================================================
 */

import type { PivotIndicators, PivotMacroData, PivotEconomicEvent } from "./types";
import { throttler, withRetry } from "../utils/throttle";
import { loadApiKeys } from "../hooks/useApiKeys";
import { fetchEconomicCalendar as finnhubCalendar } from "./finnhubService";

const BASE_URL = "https://www.alphavantage.co/query";

const getKey = async (): Promise<string> => {
  const keys = await loadApiKeys();
  return keys.alphavantage ?? "";
};

interface AvRsiData  { "Technical Analysis: RSI":  Record<string, { RSI: string }>; }
interface AvSmaData  { "Technical Analysis: SMA":  Record<string, { SMA: string }>; }
interface AvForexQuote { "Realtime Currency Exchange Rate": { "5. Exchange Rate": string }; }
interface AvQuoteResponse {
  "Global Quote": {
    "01. symbol": string; "02. open": string; "03. high": string;
    "04. low": string; "05. price": string; "06. volume": string;
    "08. previous close": string; "09. change": string; "10. change percent": string;
  };
}
interface AvNewsResponse {
  feed?: Array<{
    title: string; url: string; time_published: string; summary: string; source: string;
    overall_sentiment_label: "Bullish" | "Bearish" | "Neutral" | "Somewhat-Bullish" | "Somewhat-Bearish";
    ticker_sentiment?: Array<{ ticker: string; relevance_score: string; ticker_sentiment_label: string; }>;
  }>;
}

const fetchJSON = async <T>(params: Record<string, string>): Promise<T> => {
  const key = await getKey();
  const qp  = new URLSearchParams({ ...params, apikey: key });
  const res = await fetch(`${BASE_URL}?${qp}`);
  if (!res.ok) throw new Error(`AlphaVantage ${res.status}`);
  return res.json() as Promise<T>;
};

const parseFloat2 = (s: string | undefined): number | null => {
  if (!s) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};

export const fetchRSI = async (ticker: string, period = 14): Promise<number | null> => {
  if (!throttler.canRequest("alphavantage")) return null;
  try {
    const raw = await withRetry(() =>
      fetchJSON<AvRsiData>({ function: "RSI", symbol: ticker, interval: "daily", time_period: String(period), series_type: "close" }),
    );
    const entries = Object.entries(raw["Technical Analysis: RSI"] ?? {});
    if (!entries.length) return null;
    return parseFloat2(entries[0][1].RSI);
  } catch { return null; }
};

export const fetchSMA = async (ticker: string, period: number): Promise<number | null> => {
  if (!throttler.canRequest("alphavantage")) return null;
  try {
    const raw = await withRetry(() =>
      fetchJSON<AvSmaData>({ function: "SMA", symbol: ticker, interval: "daily", time_period: String(period), series_type: "close" }),
    );
    const entries = Object.entries(raw["Technical Analysis: SMA"] ?? {});
    if (!entries.length) return null;
    return parseFloat2(entries[0][1].SMA);
  } catch { return null; }
};

export const fetchIndicators = async (ticker: string): Promise<PivotIndicators> => {
  const rsi    = await fetchRSI(ticker);
  const sma50  = await fetchSMA(ticker, 50);
  const sma200 = await fetchSMA(ticker, 200);
  return {
    ticker, rsi14: rsi, sma50, sma200,
    ema20: null, macdLine: null, macdSignal: null, macdHistogram: null,
    volumeRatio: null, atr14: null, timestamp: Date.now(),
  };
};

const EU_ADR_MAP: Record<string, string> = {
  "BNP.PA": "BNPQY", "AI.PA":  "AIQUY", "AIR.PA": "EADSY",
  "MC.PA":  "LVMUY", "OR.PA":  "LRLCY", "SAN.PA": "SNY",
  "TTE.PA": "TTE",   "RMS.PA": "HESAY", "SAF.PA": "SAFRY",
  "KER.PA": "PPRUY", "SU.PA":  "SBGSY", "DG.PA":  "VCISY",
  "EL.PA":  "ESLOY", "CAP.PA": "CGEMY", "DSY.PA": "DASTY",
  "ORA.PA": "ORAN",  "MT.AS":  "MT",    "STM.PA": "STM",
};

export const fetchEUNews = async (
  ticker: string, limit = 5,
): Promise<import("./types").PivotNewsItem[]> => {
  if (!throttler.canRequest("alphavantage")) return [];
  const avTicker = EU_ADR_MAP[ticker] ?? ticker.replace(/\.[A-Z]+$/, "");
  try {
    const raw = await withRetry(() =>
      fetchJSON<AvNewsResponse>({ function: "NEWS_SENTIMENT", tickers: avTicker, limit: String(limit * 2), sort: "LATEST" }),
    );
    if (!raw.feed?.length) return [];
    const sentMap: Record<string, "bullish" | "bearish" | "neutral"> = {
      Bullish: "bullish", "Somewhat-Bullish": "bullish",
      Bearish: "bearish", "Somewhat-Bearish": "bearish", Neutral: "neutral",
    };
    return raw.feed.slice(0, limit).map((item, i) => {
      const ds = item.time_published;
      const dt = new Date(`${ds.slice(0,4)}-${ds.slice(4,6)}-${ds.slice(6,8)}T${ds.slice(9,11)}:${ds.slice(11,13)}:${ds.slice(13,15)}Z`);
      return {
        id: `av-${ticker}-${i}-${ds}`, ticker,
        headline: item.title, summary: item.summary?.slice(0, 300) ?? "",
        source: item.source, url: item.url,
        sentiment: sentMap[item.overall_sentiment_label] ?? "neutral",
        publishedAt: isNaN(dt.getTime()) ? Date.now() : dt.getTime(),
        tags: [ticker],
      };
    });
  } catch { return []; }
};

export const fetchDXY = async (): Promise<number | null> => {
  if (!throttler.canRequest("alphavantage")) return null;
  try {
    const raw = await withRetry(() =>
      fetchJSON<AvForexQuote>({ function: "CURRENCY_EXCHANGE_RATE", from_currency: "USD", to_currency: "EUR" }),
    );
    const rate = parseFloat2(raw["Realtime Currency Exchange Rate"]?.["5. Exchange Rate"]);
    if (!rate) return null;
    return Math.round((1 / rate) * 100 * 100) / 100;
  } catch { return null; }
};

export const fetchAVQuote = async (symbol: string): Promise<{
  price: number; open: number; high: number; low: number;
  prevClose: number; volume: number; change: number; changePercent: number;
} | null> => {
  if (!throttler.canRequest("alphavantage")) return null;
  try {
    const raw = await withRetry(() => fetchJSON<AvQuoteResponse>({ function: "GLOBAL_QUOTE", symbol }));
    const q = raw["Global Quote"];
    if (!q || !q["05. price"]) return null;
    const cp = q["10. change percent"]?.replace("%", "");
    return {
      price: parseFloat2(q["05. price"]) ?? 0, open: parseFloat2(q["02. open"]) ?? 0,
      high: parseFloat2(q["03. high"]) ?? 0, low: parseFloat2(q["04. low"]) ?? 0,
      prevClose: parseFloat2(q["08. previous close"]) ?? 0, volume: parseFloat2(q["06. volume"]) ?? 0,
      change: parseFloat2(q["09. change"]) ?? 0, changePercent: parseFloat2(cp) ?? 0,
    };
  } catch { return null; }
};

export const fetchMacroData = async (): Promise<PivotMacroData> => {
  const [sp500, gold, oil, btc] = await Promise.allSettled([
    fetchAVQuote("SPY"), fetchAVQuote("GLD"), fetchAVQuote("USO"), fetchAVQuote("COIN"),
  ]);
  const ok = (r: PromiseSettledResult<any>) => r.status === "fulfilled" ? r.value : null;
  const sp = ok(sp500), gl = ok(gold), ol = ok(oil), bt = ok(btc);
  return {
    vix: null, dxy: null,
    sp500: sp?.price ?? null, sp500Change: sp?.changePercent ?? null,
    gold: gl?.price ?? null, goldChange: gl?.changePercent ?? null,
    oil: ol?.price ?? null, oilChange: ol?.changePercent ?? null,
    btc: bt?.price ?? null, btcChange: bt?.changePercent ?? null,
    us10y: null, timestamp: Date.now(),
  };
};

/**
 * Calendrier économique REEL — délégué à Finnhub.
 * Alpha Vantage ne fournit pas de calendrier sur le plan gratuit.
 * Finnhub /calendar/economic est gratuit et contient BCE, Fed, NFP, CPI, etc.
 */
export const fetchEconomicCalendar = async (targetDate?: Date): Promise<PivotEconomicEvent[]> => {
  // Calcul de la fenêtre autour de la date cible
  const anchor = targetDate ?? new Date();
  const from   = new Date(anchor.getTime() - 14 * 86_400_000);  // -14 jours
  const to     = new Date(anchor.getTime() + 30 * 86_400_000);  // +30 jours
  return finnhubCalendar(from, to);
};
