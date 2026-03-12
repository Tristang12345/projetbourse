/**
 * Finnhub Service — Real-time quotes, news, company info.
 * Transforms raw Finnhub responses into the internal PivotQuote format.
 */
import type { PivotQuote, PivotNews, PivotCandle } from "../../types";
import { throttledFetch } from "./throttler";

const BASE = "https://finnhub.io/api/v1";

function url(path: string, key: string, params?: Record<string, string>) {
  const q = new URLSearchParams({ token: key, ...params });
  return `${BASE}${path}?${q}`;
}

async function get<T>(path: string, key: string, params?: Record<string, string>): Promise<T> {
  return throttledFetch("finnhub", async () => {
    const res = await fetch(url(path, key, params));
    if (!res.ok) throw new Error(`Finnhub ${path}: ${res.status}`);
    return res.json() as Promise<T>;
  });
}

// ── Quote ────────────────────────────────────────────────────
interface FinnhubQuote { c: number; d: number; dp: number; h: number; l: number; o: number; pc: number; t: number; }
interface FinnhubProfile { name: string; marketCapitalization: number; peRatio: number; currency: string; }
interface FinnhubMetric { metric: { "52WeekHigh": number; "52WeekLow": number; "10DayAverageTradingVolume": number; "3MonthAverageTradingVolume": number; }; }

export async function fetchQuote(ticker: string, key: string): Promise<PivotQuote> {
  const [q, profile, metric] = await Promise.allSettled([
    get<FinnhubQuote>("/quote", key, { symbol: ticker }),
    get<FinnhubProfile>("/stock/profile2", key, { symbol: ticker }),
    get<FinnhubMetric>("/stock/metric", key, { symbol: ticker, metric: "all" }),
  ]);

  const quote   = q.status === "fulfilled" ? q.value : null;
  const prof    = profile.status === "fulfilled" ? profile.value : null;
  const met     = metric.status === "fulfilled" ? metric.value : null;

  return {
    ticker,
    name:         prof?.name ?? ticker,
    price:        quote?.c ?? 0,
    change:       quote?.d ?? 0,
    changePct:    quote?.dp ?? 0,
    open:         quote?.o ?? 0,
    high:         quote?.h ?? 0,
    low:          quote?.l ?? 0,
    prevClose:    quote?.pc ?? 0,
    volume:       (met?.metric?.["10DayAverageTradingVolume"] ?? 0) * 1_000_000,
    avgVolume30d: (met?.metric?.["3MonthAverageTradingVolume"] ?? 0) * 1_000_000,
    marketCap:    (prof?.marketCapitalization ?? 0) * 1_000_000,
    pe:           prof?.peRatio ?? 0,
    week52High:   met?.metric?.["52WeekHigh"] ?? 0,
    week52Low:    met?.metric?.["52WeekLow"] ?? 0,
    timestamp:    (quote?.t ?? Date.now() / 1000) * 1000,
    provider:     "finnhub",
  };
}

// ── News ─────────────────────────────────────────────────────
interface FinnhubNews { id: number; category: string; datetime: number; headline: string; image: string; related: string; source: string; summary: string; url: string; }

export async function fetchNews(ticker: string, key: string, from: string, to: string): Promise<PivotNews[]> {
  const raw = await get<FinnhubNews[]>("/company-news", key, { symbol: ticker, from, to });
  return (raw ?? []).map(n => ({
    id:          String(n.id),
    ticker,
    headline:    n.headline,
    summary:     n.summary,
    source:      n.source,
    url:         n.url,
    publishedAt: new Date(n.datetime * 1000),
    sentiment:   0, // filled by sentiment analysis
    tags:        [n.category].filter(Boolean),
    imageUrl:    n.image || undefined,
  }));
}

// ── Candles (intraday) ────────────────────────────────────────
interface FinnhubCandles { c: number[]; h: number[]; l: number[]; o: number[]; t: number[]; v: number[]; s: string; }

export async function fetchCandles(
  ticker: string, key: string,
  resolution: string, from: number, to: number
): Promise<PivotCandle[]> {
  const raw = await get<FinnhubCandles>("/stock/candle", key, {
    symbol: ticker, resolution, from: String(from), to: String(to),
  });
  if (raw.s !== "ok" || !raw.t?.length) return [];
  return raw.t.map((t, i) => ({
    time: t,
    open: raw.o[i], high: raw.h[i], low: raw.l[i],
    close: raw.c[i], volume: raw.v[i],
  }));
}
