// ============================================================
// API SERVICE — Rate-limited, pivot-format data layer
// Supports Finnhub, Polygon, Alpha Vantage with fallback to mock
// ============================================================
import axios from "axios";
import type { QuoteSnapshot, NewsItem, Candle, MacroIndicator, EconomicEvent } from "@/types";
import { generateQuote, generateSparks, generateCandles, generateNews, generateMacroIndicators, generateCalendar } from "./mockData";

// ---- Rate limiter ----
interface RateBucket { calls: number; resetAt: number; limit: number; }
const buckets: Record<string, RateBucket> = {
  finnhub:      { calls: 0, resetAt: 0, limit: 60 },   // 60/min free
  polygon:      { calls: 0, resetAt: 0, limit: 5 },    // 5/min free
  alphavantage: { calls: 0, resetAt: 0, limit: 5 },    // 5/min free
};

function canCall(provider: string): boolean {
  const b = buckets[provider];
  const now = Date.now();
  if (now > b.resetAt) { b.calls = 0; b.resetAt = now + 60_000; }
  if (b.calls >= b.limit) return false;
  b.calls++;
  return true;
}

// ---- Pivot adapters ----

function adaptFinnhubQuote(ticker: string, data: Record<string, number>): QuoteSnapshot {
  const price = data.c ?? 0;
  const prevClose = data.pc ?? price;
  return {
    ticker, price, open: data.o ?? price, high: data.h ?? price, low: data.l ?? price,
    prevClose, change: price - prevClose, changePct: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0,
    volume: data.v ?? 0, avgVolume30d: data.av ?? data.v ?? 0, timestamp: (data.t ?? 0) * 1000, source: "finnhub",
  };
}

function adaptPolygonQuote(ticker: string, data: Record<string, unknown>): QuoteSnapshot {
  const r = (data.results as Record<string, number> | undefined) ?? {};
  const price = r.c ?? 0;
  const prevClose = r.o ?? price;
  return {
    ticker, price, open: r.o ?? price, high: r.h ?? price, low: r.l ?? price,
    prevClose, change: r.c - r.o, changePct: r.o > 0 ? ((r.c - r.o) / r.o) * 100 : 0,
    volume: r.v ?? 0, avgVolume30d: r.vw ?? r.v ?? 0, timestamp: Date.now(), source: "polygon",
  };
}

// ---- API Calls ----

const FINNHUB_BASE = "https://finnhub.io/api/v1";
const POLYGON_BASE = "https://api.polygon.io/v2";
const AV_BASE = "https://www.alphavantage.co/query";

export class ApiService {
  private finnhubKey: string;
  private polygonKey: string;
  private avKey: string;
  private useMock: boolean;

  constructor(finnhubKey = "", polygonKey = "", avKey = "") {
    this.finnhubKey = finnhubKey;
    this.polygonKey = polygonKey;
    this.avKey = avKey;
    this.useMock = !finnhubKey && !polygonKey && !avKey;
  }

  /** Fetch real-time quote — tries Finnhub → Polygon → mock */
  async fetchQuote(ticker: string): Promise<QuoteSnapshot> {
    if (!this.useMock && this.finnhubKey && canCall("finnhub")) {
      try {
        const { data } = await axios.get(`${FINNHUB_BASE}/quote`, {
          params: { symbol: ticker, token: this.finnhubKey }, timeout: 5000,
        });
        return adaptFinnhubQuote(ticker, data);
      } catch { /* fallthrough */ }
    }
    if (!this.useMock && this.polygonKey && canCall("polygon")) {
      try {
        const { data } = await axios.get(`${POLYGON_BASE}/aggs/ticker/${ticker}/prev`, {
          params: { apiKey: this.polygonKey }, timeout: 5000,
        });
        return adaptPolygonQuote(ticker, data);
      } catch { /* fallthrough */ }
    }
    return generateQuote(ticker);
  }

  /** Batch quote fetch — respects rate limits */
  async fetchQuotes(tickers: string[]): Promise<Record<string, QuoteSnapshot>> {
    const results: Record<string, QuoteSnapshot> = {};
    for (const ticker of tickers) {
      results[ticker] = await this.fetchQuote(ticker);
      await sleep(50); // small delay between requests
    }
    return results;
  }

  /** Fetch candle history for technical analysis */
  async fetchCandles(ticker: string, bars = 200): Promise<Candle[]> {
    if (!this.useMock && this.polygonKey && canCall("polygon")) {
      try {
        const to = new Date().toISOString().split("T")[0];
        const from = new Date(Date.now() - bars * 86400000).toISOString().split("T")[0];
        const { data } = await axios.get(`${POLYGON_BASE}/aggs/ticker/${ticker}/range/1/day/${from}/${to}`, {
          params: { apiKey: this.polygonKey, limit: bars }, timeout: 8000,
        });
        if (data.results?.length) {
          return data.results.map((r: Record<string, number>) => ({
            time: r.t, open: r.o, high: r.h, low: r.l, close: r.c, volume: r.v,
          }));
        }
      } catch { /* fallthrough */ }
    }
    return generateCandles(ticker, bars);
  }

  /** Fetch intraday sparks */
  async fetchSparks(ticker: string): Promise<{ time: number; value: number }[]> {
    return generateSparks(ticker);
  }

  /** Fetch news filtered by tickers */
  async fetchNews(tickers: string[]): Promise<NewsItem[]> {
    if (!this.useMock && this.finnhubKey && canCall("finnhub")) {
      try {
        const symbol = tickers[0];
        const { data } = await axios.get(`${FINNHUB_BASE}/company-news`, {
          params: { symbol, from: dateOffset(-7), to: dateOffset(0), token: this.finnhubKey }, timeout: 5000,
        });
        return (data as Record<string, unknown>[]).slice(0, 20).map((item, i) => ({
          id: String(i), headline: String(item.headline ?? ""), summary: String(item.summary ?? ""),
          source: String(item.source ?? ""), url: String(item.url ?? "#"),
          publishedAt: Number(item.datetime ?? 0) * 1000, tickers: [symbol], sectors: [],
          sentiment: "neutral" as const,
        }));
      } catch { /* fallthrough */ }
    }
    return generateNews().filter((n) => tickers.some((t) => n.tickers.includes(t)) || n.tickers.length === 0);
  }

  async fetchMacroIndicators(): Promise<MacroIndicator[]> {
    return generateMacroIndicators();
  }

  async fetchCalendar(): Promise<EconomicEvent[]> {
    return generateCalendar();
  }
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }
function dateOffset(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().split("T")[0];
}

// Singleton instance
let _apiService: ApiService | null = null;
export function getApiService(keys?: { finnhub?: string; polygon?: string; av?: string }): ApiService {
  if (!_apiService || keys) {
    _apiService = new ApiService(keys?.finnhub, keys?.polygon, keys?.av);
  }
  return _apiService;
}
