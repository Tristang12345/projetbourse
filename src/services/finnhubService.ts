/**
 * ============================================================
 * FINNHUB SERVICE
 * Handles: real-time quotes, news, basic company info.
 * Rate limit: 60 req/min on free tier.
 * Normalizes all data to Pivot format.
 * ============================================================
 */

import { PivotQuote, PivotNewsItem, PivotCandle } from "./types";
import { throttler, withRetry } from "../utils/throttle";

const BASE_URL = "https://finnhub.io/api/v1";

/** Read API key from Vite env variable */
const getKey = (): string => import.meta.env.VITE_FINNHUB_KEY ?? "";

// ─── Raw API shapes ───────────────────────────────────────────
interface FhQuote {
  c: number;  // current price
  d: number;  // change
  dp: number; // change %
  h: number;  // high
  l: number;  // low
  o: number;  // open
  pc: number; // prev close
  t: number;  // timestamp
}

interface FhProfile {
  name:            string;
  ticker:          string;
  finnhubIndustry: string;
  marketCapitalization: number;
  shareOutstanding: number;
}

interface FhNewsItem {
  id:       number;
  category: string;
  datetime: number;
  headline: string;
  image:    string;
  related:  string;
  source:   string;
  summary:  string;
  url:      string;
}

interface FhCandle {
  c: number[];
  h: number[];
  l: number[];
  o: number[];
  t: number[];
  v: number[];
  s: "ok" | "no_data";
}

// ─── Normalizers ──────────────────────────────────────────────

const normalizeQuote = (
  raw:     FhQuote,
  profile: FhProfile,
  ticker:  string,
): PivotQuote => ({
  ticker,
  name:          profile.name || ticker,
  price:         raw.c,
  open:          raw.o,
  high:          raw.h,
  low:           raw.l,
  prevClose:     raw.pc,
  change:        raw.d,
  changePercent: raw.dp,
  volume:        0,            // Finnhub free tier doesn't include volume in /quote
  avgVolume30d:  0,
  marketCap:     profile.marketCapitalization * 1_000_000,
  sector:        profile.finnhubIndustry,
  timestamp:     raw.t ? raw.t * 1000 : Date.now(),
  source:        "finnhub",
});

const normalizeNews = (raw: FhNewsItem, ticker?: string): PivotNewsItem => ({
  id:          `fh-${raw.id}`,
  ticker,
  headline:    raw.headline,
  summary:     raw.summary,
  source:      raw.source,
  url:         raw.url,
  publishedAt: raw.datetime * 1000,
  tags:        raw.related ? raw.related.split(",").map((t) => t.trim()) : [],
  sentiment:   "neutral",
});

const normalizeCandles = (raw: FhCandle, ticker: string): PivotCandle[] => {
  if (raw.s !== "ok") return [];
  return raw.t.map((t, i) => ({
    ticker,
    time:   t * 1000,
    open:   raw.o[i],
    high:   raw.h[i],
    low:    raw.l[i],
    close:  raw.c[i],
    volume: raw.v[i],
  }));
};

// ─── API Calls ────────────────────────────────────────────────

const fetchJSON = async <T>(path: string): Promise<T> => {
  const url = `${BASE_URL}${path}&token=${getKey()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub ${res.status}: ${path}`);
  return res.json() as Promise<T>;
};

/**
 * Fetch real-time quote + profile for a ticker.
 * Profile is needed for name/sector enrichment.
 */
export const fetchQuote = async (ticker: string): Promise<PivotQuote | null> => {
  if (!throttler.canRequest("finnhub")) return null;
  try {
    const [quote, profile] = await withRetry(() =>
      Promise.all([
        fetchJSON<FhQuote>(`/quote?symbol=${ticker}`),
        fetchJSON<FhProfile>(`/stock/profile2?symbol=${ticker}`),
      ]),
    );
    if (!quote.c) return null;
    return normalizeQuote(quote, profile, ticker);
  } catch (err) {
    console.error("[Finnhub] fetchQuote error:", err);
    return null;
  }
};

/**
 * Fetch company news for a ticker over last N days.
 */
export const fetchCompanyNews = async (
  ticker: string,
  days   = 3,
): Promise<PivotNewsItem[]> => {
  if (!throttler.canRequest("finnhub")) return [];
  const to   = new Date();
  const from = new Date(Date.now() - days * 86_400_000);
  const fmt  = (d: Date) => d.toISOString().split("T")[0];
  try {
    const raw = await withRetry(() =>
      fetchJSON<FhNewsItem[]>(
        `/company-news?symbol=${ticker}&from=${fmt(from)}&to=${fmt(to)}`,
      ),
    );
    return raw.slice(0, 20).map((n) => normalizeNews(n, ticker));
  } catch (err) {
    console.error("[Finnhub] fetchNews error:", err);
    return [];
  }
};

/**
 * Fetch general market news (no ticker filter).
 */
export const fetchMarketNews = async (
  category = "general",
): Promise<PivotNewsItem[]> => {
  if (!throttler.canRequest("finnhub")) return [];
  try {
    const raw = await withRetry(() =>
      fetchJSON<FhNewsItem[]>(`/news?category=${category}`),
    );
    return raw.slice(0, 30).map((n) => normalizeNews(n));
  } catch (err) {
    console.error("[Finnhub] fetchMarketNews error:", err);
    return [];
  }
};

/**
 * Fetch OHLCV candles for sparklines / indicators.
 * resolution: 1|5|15|30|60|D|W|M
 */
export const fetchCandles = async (
  ticker:     string,
  resolution: string = "D",
  days:       number = 60,
): Promise<PivotCandle[]> => {
  if (!throttler.canRequest("finnhub")) return [];
  const to   = Math.floor(Date.now() / 1000);
  const from = to - days * 86_400;
  try {
    const raw = await withRetry(() =>
      fetchJSON<FhCandle>(
        `/stock/candle?symbol=${ticker}&resolution=${resolution}&from=${from}&to=${to}`,
      ),
    );
    return normalizeCandles(raw, ticker);
  } catch (err) {
    console.error("[Finnhub] fetchCandles error:", err);
    return [];
  }
};

/**
 * Fetch VIX (CBOE Volatility Index) via Finnhub.
 */
export const fetchVIX = async (): Promise<number | null> => {
  if (!throttler.canRequest("finnhub")) return null;
  try {
    const q = await fetchJSON<FhQuote>("/quote?symbol=VIX");
    return q.c ?? null;
  } catch {
    return null;
  }
};
