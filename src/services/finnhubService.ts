/**
 * ============================================================
 * FINNHUB SERVICE
 * Corrections :
 *   - Clés API chargées via useApiKeys (sécurisé, non hardcodé)
 *   - fetchEconomicCalendar : vraies données Finnhub (plus de mock)
 * ============================================================
 */

import type { PivotQuote, PivotNewsItem, PivotCandle, PivotEconomicEvent, EventImportance } from "./types";
import { throttler, withRetry } from "../utils/throttle";
import { loadApiKeys } from "../hooks/useApiKeys";

const BASE_URL = "https://finnhub.io/api/v1";

/** Charge la clé Finnhub depuis le store sécurisé (Tauri) ou .env.local */
const getKey = async (): Promise<string> => {
  const keys = await loadApiKeys();
  return keys.finnhub ?? "";
};

interface FhQuote   { c: number; d: number; dp: number; h: number; l: number; o: number; pc: number; t: number; }
interface FhProfile { name: string; ticker: string; finnhubIndustry: string; marketCapitalization: number; }
interface FhNewsItem { id: number; category: string; datetime: number; headline: string; related: string; source: string; summary: string; url: string; }
interface FhCandle  { c: number[]; h: number[]; l: number[]; o: number[]; t: number[]; v: number[]; s: "ok" | "no_data"; }

/** Calendrier économique Finnhub */
interface FhEconomicEvent {
  actual?:   number;
  country:   string;
  estimate?: number;
  event:     string;
  impact:    "low" | "medium" | "high";
  prev?:     number;
  time:      string; // ISO string
  unit?:     string;
}

const fetchJSON = async <T>(path: string): Promise<T> => {
  const key = await getKey();
  const url = `${BASE_URL}${path}${path.includes("?") ? "&" : "?"}token=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub ${res.status}: ${path}`);
  return res.json() as Promise<T>;
};

const normalizeQuote = (raw: FhQuote, profile: FhProfile, ticker: string): PivotQuote => ({
  ticker, name: profile.name || ticker,
  price: raw.c, open: raw.o, high: raw.h, low: raw.l, prevClose: raw.pc,
  change: raw.d, changePercent: raw.dp,
  volume: 0, avgVolume30d: 0,
  marketCap: profile.marketCapitalization * 1_000_000,
  sector: profile.finnhubIndustry,
  currency: "USD", exchange: "NYSE", country: "US",
  timestamp: raw.t ? raw.t * 1000 : Date.now(),
  source: "finnhub",
});

const normalizeNews = (raw: FhNewsItem, ticker?: string): PivotNewsItem => ({
  id: `fh-${raw.id}`, ticker, headline: raw.headline, summary: raw.summary,
  source: raw.source, url: raw.url, publishedAt: raw.datetime * 1000,
  tags: raw.related ? raw.related.split(",").map((t) => t.trim()) : [],
  sentiment: "neutral",
});

const normalizeCandles = (raw: FhCandle, ticker: string): PivotCandle[] => {
  if (raw.s !== "ok") return [];
  return raw.t.map((t, i) => ({
    ticker, time: t * 1000,
    open: raw.o[i], high: raw.h[i], low: raw.l[i], close: raw.c[i], volume: raw.v[i],
  }));
};

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

export const fetchCompanyNews = async (ticker: string, days = 3): Promise<PivotNewsItem[]> => {
  if (!throttler.canRequest("finnhub")) return [];
  const to   = new Date();
  const from = new Date(Date.now() - days * 86_400_000);
  const fmt  = (d: Date) => d.toISOString().split("T")[0];
  try {
    const raw = await withRetry(() =>
      fetchJSON<FhNewsItem[]>(`/company-news?symbol=${ticker}&from=${fmt(from)}&to=${fmt(to)}`),
    );
    return raw.slice(0, 20).map((n) => normalizeNews(n, ticker));
  } catch (err) {
    console.error("[Finnhub] fetchNews error:", err);
    return [];
  }
};

export const fetchMarketNews = async (category = "general"): Promise<PivotNewsItem[]> => {
  if (!throttler.canRequest("finnhub")) return [];
  try {
    const raw = await withRetry(() => fetchJSON<FhNewsItem[]>(`/news?category=${category}`));
    return raw.slice(0, 30).map((n) => normalizeNews(n));
  } catch (err) {
    console.error("[Finnhub] fetchMarketNews error:", err);
    return [];
  }
};

export const fetchCandles = async (
  ticker: string, resolution = "D", days = 60,
): Promise<PivotCandle[]> => {
  if (!throttler.canRequest("finnhub")) return [];
  const to   = Math.floor(Date.now() / 1000);
  const from = to - days * 86_400;
  try {
    const raw = await withRetry(() =>
      fetchJSON<FhCandle>(`/stock/candle?symbol=${ticker}&resolution=${resolution}&from=${from}&to=${to}`),
    );
    return normalizeCandles(raw, ticker);
  } catch (err) {
    console.error("[Finnhub] fetchCandles error:", err);
    return [];
  }
};

export const fetchVIX = async (): Promise<number | null> => {
  if (!throttler.canRequest("finnhub")) return null;
  try {
    const q = await fetchJSON<FhQuote>("/quote?symbol=VIX");
    return q.c ?? null;
  } catch { return null; }
};

/**
 * Calendrier économique REEL via Finnhub /calendar/economic.
 * Remplace le mock hardcodé dans alphaVantageService.ts.
 * Données réelles : Fed, BCE, NFP, CPI, PIB, etc.
 * @param from Date de début (défaut: aujourd'hui - 7j)
 * @param to   Date de fin   (défaut: aujourd'hui + 30j)
 */
export const fetchEconomicCalendar = async (
  from?: Date, to?: Date,
): Promise<PivotEconomicEvent[]> => {
  if (!throttler.canRequest("finnhub")) return [];

  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const fromDate = from ?? new Date(Date.now() - 7  * 86_400_000);
  const toDate   = to   ?? new Date(Date.now() + 30 * 86_400_000);

  try {
    const raw = await withRetry(() =>
      fetchJSON<{ economicCalendar: FhEconomicEvent[] }>(
        `/calendar/economic?from=${fmt(fromDate)}&to=${fmt(toDate)}`,
      ),
    );

    return (raw.economicCalendar ?? []).map((e, i): PivotEconomicEvent => {
      const impMap: Record<string, EventImportance> = {
        high: "high", medium: "medium", low: "low",
      };
      return {
        id:         `fh-eco-${i}-${e.time}`,
        title:      e.event,
        country:    e.country.toUpperCase(),
        datetime:   new Date(e.time).getTime(),
        importance: impMap[e.impact] ?? "low",
        actual:     e.actual  != null ? String(e.actual)   : undefined,
        forecast:   e.estimate != null ? String(e.estimate) : undefined,
        previous:   e.prev    != null ? String(e.prev)     : undefined,
        currency:   e.unit    ?? "",
      };
    });
  } catch (err) {
    console.error("[Finnhub] fetchEconomicCalendar error:", err);
    return [];
  }
};
