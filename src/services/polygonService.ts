/**
 * ============================================================
 * POLYGON.IO SERVICE
 * Correction : clés chargées via useApiKeys (sécurisé).
 * ============================================================
 */

import type { PivotCandle, PivotQuote } from "./types";
import { throttler, withRetry } from "../utils/throttle";
import { loadApiKeys } from "../hooks/useApiKeys";

const BASE_URL = "https://api.polygon.io";

const getKey = async (): Promise<string> => {
  const keys = await loadApiKeys();
  return keys.polygon ?? "";
};

interface PolyBar { o: number; h: number; l: number; c: number; v: number; vw: number; t: number; n: number; }
interface PolyAggsResponse  { ticker: string; status: string; resultsCount: number; results: PolyBar[]; }
interface PolySnapshotTicker {
  ticker: string;
  day:     { o: number; h: number; l: number; c: number; v: number; vw: number; };
  prevDay: { o: number; h: number; l: number; c: number; v: number; vw: number; };
  lastTrade: { p: number; t: number; };
  todaysChangePerc: number;
  todaysChange:     number;
}
interface PolySnapshotResponse { tickers: PolySnapshotTicker[]; status: string; }

const normalizeBar = (bar: PolyBar, ticker: string): PivotCandle => ({
  ticker, time: bar.t, open: bar.o, high: bar.h, low: bar.l, close: bar.c, volume: bar.v,
});

const normalizeSnapshot = (snap: PolySnapshotTicker, avgVolume: number): PivotQuote => ({
  ticker: snap.ticker, name: snap.ticker,
  price: snap.lastTrade.p, open: snap.day.o, high: snap.day.h, low: snap.day.l,
  prevClose: snap.prevDay.c, change: snap.todaysChange, changePercent: snap.todaysChangePerc,
  volume: snap.day.v, avgVolume30d: avgVolume,
  currency: "USD", exchange: "NYSE", country: "US",
  timestamp: snap.lastTrade.t, source: "polygon",
});

const fetchJSON = async <T>(path: string): Promise<T> => {
  const key = await getKey();
  const sep = path.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${path}${sep}apiKey=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Polygon ${res.status}: ${path}`);
  return res.json() as Promise<T>;
};

export const fetchDailyCandles = async (ticker: string, days = 60): Promise<PivotCandle[]> => {
  if (!throttler.canRequest("polygon")) return [];
  const to   = new Date().toISOString().split("T")[0];
  const from = new Date(Date.now() - days * 86_400_000).toISOString().split("T")[0];
  try {
    const raw = await withRetry(() =>
      fetchJSON<PolyAggsResponse>(`/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=${days}`),
    );
    return (raw.results ?? []).map((b) => normalizeBar(b, ticker));
  } catch (err) {
    console.error("[Polygon] fetchDailyCandles error:", err);
    return [];
  }
};

export const fetchIntradayCandles = async (ticker: string): Promise<PivotCandle[]> => {
  if (!throttler.canRequest("polygon")) return [];
  const today = new Date().toISOString().split("T")[0];
  try {
    const raw = await withRetry(() =>
      fetchJSON<PolyAggsResponse>(`/v2/aggs/ticker/${ticker}/range/5/minute/${today}/${today}?adjusted=true&sort=asc`),
    );
    return (raw.results ?? []).map((b) => normalizeBar(b, ticker));
  } catch (err) {
    console.error("[Polygon] fetchIntradayCandles error:", err);
    return [];
  }
};

export const fetchSnapshots = async (
  tickers: string[], avgVolumes: Record<string, number> = {},
): Promise<PivotQuote[]> => {
  if (!throttler.canRequest("polygon")) return [];
  if (!tickers.length) return [];
  const list = tickers.join(",");
  try {
    const raw = await withRetry(() =>
      fetchJSON<PolySnapshotResponse>(`/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${list}`),
    );
    return (raw.tickers ?? []).map((s) => normalizeSnapshot(s, avgVolumes[s.ticker] ?? 0));
  } catch (err) {
    console.error("[Polygon] fetchSnapshots error:", err);
    return [];
  }
};

export const computeAvgVolume = (candles: PivotCandle[], days = 30): number => {
  const slice = candles.slice(-days);
  if (!slice.length) return 0;
  return slice.reduce((sum, c) => sum + c.volume, 0) / slice.length;
};
