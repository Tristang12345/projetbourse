/**
 * Polygon.io Service — OHLCV bars, market-wide data.
 */
import type { PivotQuote, PivotCandle } from "../../types";
import { throttledFetch } from "./throttler";

const BASE = "https://api.polygon.io";

async function get<T>(path: string, key: string, params?: Record<string, string>): Promise<T> {
  return throttledFetch("polygon", async () => {
    const q   = new URLSearchParams({ apiKey: key, ...params });
    const res = await fetch(`${BASE}${path}?${q}`);
    if (!res.ok) throw new Error(`Polygon ${path}: ${res.status}`);
    return res.json() as Promise<T>;
  });
}

interface PolySnapshot {
  ticker: { ticker: string; todaysChangePerc: number; todaysChange: number; day: { o: number; h: number; l: number; c: number; v: number; vw: number; }; prevDay: { c: number; }; min: { c: number; }; };
}

export async function fetchSnapshot(ticker: string, key: string): Promise<Partial<PivotQuote>> {
  const raw = await get<PolySnapshot>(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`, key);
  const t   = raw.ticker;
  return {
    ticker,
    price:     t.min?.c ?? t.day?.c ?? 0,
    change:    t.todaysChange ?? 0,
    changePct: t.todaysChangePerc ?? 0,
    open:      t.day?.o ?? 0,
    high:      t.day?.h ?? 0,
    low:       t.day?.l ?? 0,
    prevClose: t.prevDay?.c ?? 0,
    volume:    t.day?.v ?? 0,
    provider:  "polygon",
  };
}

interface PolyBars { results?: { t: number; o: number; h: number; l: number; c: number; v: number; }[]; }

export async function fetchBars(
  ticker: string, key: string,
  multiplier: number, timespan: string,
  from: string, to: string
): Promise<PivotCandle[]> {
  const raw = await get<PolyBars>(
    `/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}`, key,
    { adjusted: "true", sort: "asc", limit: "5000" }
  );
  return (raw.results ?? []).map(b => ({
    time: Math.floor(b.t / 1000),
    open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
  }));
}
