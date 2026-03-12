// ============================================================
// MOCK DATA SERVICE — Realistic demo data for development
// Simulates live market data with random walk
// ============================================================
import type { QuoteSnapshot, NewsItem, EconomicEvent, MacroIndicator, SparkPoint, Candle } from "@/types";

const BASE_PRICES: Record<string, number> = {
  AAPL: 189.5, MSFT: 415.2, NVDA: 875.4, TSLA: 248.3, AMZN: 182.7,
  META: 527.9, GOOGL: 171.8, JPM: 202.3, XOM: 118.4, UNH: 540.1,
  JNJ: 158.9, SPY: 512.6, QQQ: 441.3, BRK: 385.2, V: 278.5,
  MA: 488.7, BAC: 39.8, WMT: 68.4, PG: 163.2, HD: 381.9,
  INTC: 42.3, AMD: 178.6, CRM: 282.1, NFLX: 621.4, DIS: 111.2,
  VIX: 14.8, DXY: 104.3, GLD: 183.2, TLT: 92.4,
};

/** Realistic random walk with mean reversion */
function randomWalk(base: number, seed: number): number {
  const drift = (Math.sin(seed * 0.01) * 0.003);
  const noise = (Math.random() - 0.5) * 0.008;
  return base * (1 + drift + noise);
}

let priceCache: Record<string, number> = { ...BASE_PRICES };

export function generateQuote(ticker: string): QuoteSnapshot {
  const base = BASE_PRICES[ticker] ?? 100;
  const prev = priceCache[ticker] ?? base;
  const price = randomWalk(prev, Date.now() % 10000);
  priceCache[ticker] = price;
  const open = base * (1 + (Math.random() - 0.5) * 0.01);
  const high = Math.max(price, open) * (1 + Math.random() * 0.005);
  const low = Math.min(price, open) * (1 - Math.random() * 0.005);
  const prevClose = base * (1 + (Math.random() - 0.48) * 0.012);
  const change = price - prevClose;
  const changePct = (change / prevClose) * 100;
  const baseVol = ticker === "SPY" ? 80e6 : ticker.length <= 4 ? 20e6 : 5e6;
  const volume = Math.floor(baseVol * (0.5 + Math.random()));
  return {
    ticker, price, open, high, low, prevClose, change, changePct,
    volume, avgVolume30d: baseVol, marketCap: price * 1e9 * (Math.random() * 5 + 1),
    timestamp: Date.now(), source: "mock",
  };
}

export function generateSparks(ticker: string, points = 78): SparkPoint[] {
  const base = BASE_PRICES[ticker] ?? 100;
  let price = base * (1 - 0.02);
  return Array.from({ length: points }, (_, i) => {
    price = randomWalk(price, i * 13);
    return { time: Date.now() - (points - i) * 5 * 60 * 1000, value: price };
  });
}

export function generateCandles(ticker: string, bars = 250): Candle[] {
  const base = BASE_PRICES[ticker] ?? 100;
  let price = base * 0.7;
  return Array.from({ length: bars }, (_, i) => {
    const open = price;
    price = randomWalk(price, i * 7 + ticker.charCodeAt(0));
    const close = price;
    const high = Math.max(open, close) * (1 + Math.random() * 0.008);
    const low = Math.min(open, close) * (1 - Math.random() * 0.008);
    const volume = Math.floor((Math.random() * 0.8 + 0.6) * 10e6);
    return { time: Date.now() - (bars - i) * 86400000, open, high, low, close, volume };
  });
}

const NEWS_TEMPLATES = [
  { h: "AAPL reports record Q4 earnings, beats analyst estimates by 8%", s: "positive", sec: ["Technology"] },
  { h: "Federal Reserve signals potential rate cuts amid cooling inflation data", s: "positive", sec: ["Financials", "Real Estate"] },
  { h: "NVDA surges on AI chip demand, announces new H200 allocation", s: "positive", sec: ["Technology"] },
  { h: "Oil prices slip as inventory builds exceed expectations", s: "negative", sec: ["Energy"] },
  { h: "JPM warns of credit quality deterioration in consumer portfolio", s: "negative", sec: ["Financials"] },
  { h: "Microsoft Azure cloud revenue accelerates to 29% YoY growth", s: "positive", sec: ["Technology"] },
  { h: "UnitedHealth raises full-year guidance on strong Medicare enrollment", s: "positive", sec: ["Healthcare"] },
  { h: "Amazon Web Services wins $1.2B DoD contract renewal", s: "positive", sec: ["Technology", "Consumer"] },
  { h: "Tesla deliveries miss Q3 consensus by 4%, stock under pressure", s: "negative", sec: ["Consumer", "Technology"] },
  { h: "Macro: US CPI prints in-line at 3.2%, core remains sticky", s: "neutral", sec: [] },
  { h: "Johnson & Johnson settles talc litigation for $9B", s: "negative", sec: ["Healthcare"] },
  { h: "Exxon Mobil acquires Pioneer Natural Resources in $60B deal", s: "positive", sec: ["Energy"] },
];

const SOURCES = ["Reuters", "Bloomberg", "WSJ", "CNBC", "FT", "MarketWatch", "Barron's", "Seeking Alpha"];
const TICKERS_MAP: Record<string, string[]> = {
  Technology: ["AAPL","MSFT","NVDA","AMZN","META","GOOGL","TSLA"],
  Financials: ["JPM","BAC","V","MA"],
  Healthcare: ["UNH","JNJ"],
  Energy: ["XOM"],
  Consumer: ["AMZN","TSLA","WMT"],
};

export function generateNews(): NewsItem[] {
  return NEWS_TEMPLATES.map((t, i) => {
    const tickers = t.sec.flatMap((s) => TICKERS_MAP[s] ?? []).slice(0, 3);
    return {
      id: String(i), headline: t.h,
      summary: `${t.h}. Analysts are closely monitoring the implications for sector earnings. Trading volumes elevated in pre-market session.`,
      source: SOURCES[i % SOURCES.length], url: "#",
      publishedAt: Date.now() - i * 1800000,
      tickers, sectors: t.sec,
      sentiment: t.s as "positive" | "negative" | "neutral",
    };
  });
}

export function generateMacroIndicators(): MacroIndicator[] {
  return [
    { symbol: "VIX",  name: "CBOE Volatility Index",    value: 14.82, change: -0.43, changePct: -2.82, timestamp: Date.now() },
    { symbol: "DXY",  name: "US Dollar Index",          value: 104.31, change: 0.18, changePct: 0.17, timestamp: Date.now() },
    { symbol: "US10Y",name: "US 10Y Treasury Yield",    value: 4.28, change: -0.03, changePct: -0.69, timestamp: Date.now() },
    { symbol: "US2Y", name: "US 2Y Treasury Yield",     value: 4.71, change: -0.02, changePct: -0.42, timestamp: Date.now() },
    { symbol: "GLD",  name: "Gold Spot ($/oz)",         value: 2384.5, change: 12.3, changePct: 0.52, timestamp: Date.now() },
    { symbol: "BTC",  name: "Bitcoin / USD",            value: 67420, change: 1240, changePct: 1.87, timestamp: Date.now() },
    { symbol: "OIL",  name: "WTI Crude ($/bbl)",        value: 78.43, change: -0.87, changePct: -1.10, timestamp: Date.now() },
    { symbol: "EURUSD",name: "EUR/USD",                 value: 1.0842, change: 0.0023, changePct: 0.21, timestamp: Date.now() },
  ];
}

export function generateCalendar(): EconomicEvent[] {
  const today = new Date().toISOString().split("T")[0];
  return [
    { id: "1", date: today, time: "08:30", country: "US", event: "CPI (YoY)", importance: "high", actual: 3.2, forecast: 3.1, previous: 3.5, unit: "%" },
    { id: "2", date: today, time: "10:00", country: "US", event: "Consumer Confidence", importance: "medium", forecast: 102.5, previous: 99.8 },
    { id: "3", date: today, time: "14:00", country: "US", event: "FOMC Minutes", importance: "high" },
    { id: "4", date: today, time: "08:30", country: "US", event: "Initial Jobless Claims", importance: "medium", actual: 218000, forecast: 220000, previous: 225000 },
    { id: "5", date: today, time: "08:30", country: "US", event: "PPI (MoM)", importance: "high", forecast: 0.2, previous: 0.1, unit: "%" },
    { id: "6", date: today, time: "16:00", country: "EU", event: "ECB Rate Decision", importance: "high", forecast: 4.5, previous: 4.5, unit: "%" },
    { id: "7", date: today, time: "09:45", country: "US", event: "PMI Manufacturing", importance: "medium", forecast: 52.4, previous: 51.9 },
    { id: "8", date: today, time: "13:00", country: "US", event: "30-Year Bond Auction", importance: "low" },
  ];
}
