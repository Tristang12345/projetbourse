/**
 * ============================================================
 * POLYGON.IO SERVICE
 * Handles: aggregated candles, volume stats, market snapshots.
 * Rate limit: 5 req/min on free tier (delayed data).
 * ============================================================
 */

import { PivotCandle, PivotQuote } from "./types";
import { throttler, withRetry } from "../utils/throttle";

const BASE_URL = "https://api.polygon.io";
const getKey   = (): string => import.meta.env.VITE_POLYGON_KEY ?? "";

// ─── Raw API shapes ───────────────────────────────────────────
interface PolyBar {
  o:  number;
  h:  number;
  l:  number;
  c:  number;
  v:  number;
  vw: number;  // volume-weighted avg price
  t:  number;  // epoch ms
  n:  number;  // number of transactions
}

interface PolyAggsResponse {
  ticker:    string;
  status:    string;
  resultsCount: number;
  results:   PolyBar[];
}

interface PolySnapshotTicker {
  ticker: string;
  day: {
    o: number; h: number; l: number; c: number; v: number; vw: number;
  };
  prevDay: {
    o: number; h: number; l: number; c: number; v: number; vw: number;
  };
  lastTrade: { p: number; t: number };
  todaysChangePerc: number;
  todaysChange:     number;
}

interface PolySnapshotResponse {
  tickers: PolySnapshotTicker[];
  status:  string;
}

// ─── Normalizers ──────────────────────────────────────────────

const normalizeBar = (bar: PolyBar, ticker: string): PivotCandle => ({
  ticker,
  time:   bar.t,
  open:   bar.o,
  high:   bar.h,
  low:    bar.l,
  close:  bar.c,
  volume: bar.v,
});

const normalizeSnapshot = (
  snap: PolySnapshotTicker,
  avgVolume: number,
): PivotQuote => ({
  ticker:        snap.ticker,
  name:          snap.ticker,  // enriched later
  price:         snap.lastTrade.p,
  open:          snap.day.o,
  high:          snap.day.h,
  low:           snap.day.l,
  prevClose:     snap.prevDay.c,
  change:        snap.todaysChange,
  changePercent: snap.todaysChangePerc,
  volume:        snap.day.v,
  avgVolume30d:  avgVolume,
  timestamp:     snap.lastTrade.t,
  source:        "polygon",
});

// ─── Helpers ──────────────────────────────────────────────────

const fetchJSON = async <T>(path: string): Promise<T> => {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${path}${sep}apiKey=${getKey()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Polygon ${res.status}: ${path}`);
  return res.json() as Promise<T>;
};

/**
 * Fetch daily OHLCV aggregates for a ticker.
 * Used for SMA/RSI calculation and sparklines.
 */
export const fetchDailyCandles = async (
  ticker: string,
  days   = 60,
): Promise<PivotCandle[]> => {
  if (!throttler.canRequest("polygon")) return [];
  const to   = new Date().toISOString().split("T")[0];
  const from = new Date(Date.now() - days * 86_400_000)
    .toISOString()
    .split("T")[0];
  try {
    const raw = await withRetry(() =>
      fetchJSON<PolyAggsResponse>(
        `/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=${days}`,
      ),
    );
    return (raw.results ?? []).map((b) => normalizeBar(b, ticker));
  } catch (err) {
    console.error("[Polygon] fetchDailyCandles error:", err);
    return [];
  }
};

/**
 * Fetch intraday 5-min candles for sparklines.
 */
export const fetchIntradayCandles = async (
  ticker: string,
): Promise<PivotCandle[]> => {
  if (!throttler.canRequest("polygon")) return [];
  const today = new Date().toISOString().split("T")[0];
  try {
    const raw = await withRetry(() =>
      fetchJSON<PolyAggsResponse>(
        `/v2/aggs/ticker/${ticker}/range/5/minute/${today}/${today}?adjusted=true&sort=asc`,
      ),
    );
    return (raw.results ?? []).map((b) => normalizeBar(b, ticker));
  } catch (err) {
    console.error("[Polygon] fetchIntradayCandles error:", err);
    return [];
  }
};

/**
 * Fetch snapshot for multiple tickers at once.
 * Returns current price, day change, volume.
 * Also computes volume ratio against provided avg volumes.
 */
export const fetchSnapshots = async (
  tickers:    string[],
  avgVolumes: Record<string, number> = {},
): Promise<PivotQuote[]> => {
  if (!throttler.canRequest("polygon")) return [];
  if (tickers.length === 0) return [];
  const list = tickers.join(",");
  try {
    const raw = await withRetry(() =>
      fetchJSON<PolySnapshotResponse>(
        `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${list}`,
      ),
    );
    return (raw.tickers ?? []).map((s) =>
      normalizeSnapshot(s, avgVolumes[s.ticker] ?? 0),
    );
  } catch (err) {
    console.error("[Polygon] fetchSnapshots error:", err);
    return [];
  }
};

/**
 * Compute average volume over last N days from candle data.
 */
export const computeAvgVolume = (candles: PivotCandle[], days = 30): number => {
  const slice = candles.slice(-days);
  if (slice.length === 0) return 0;
  return slice.reduce((sum, c) => sum + c.volume, 0) / slice.length;
};
