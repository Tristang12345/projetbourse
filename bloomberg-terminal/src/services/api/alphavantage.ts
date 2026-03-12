/**
 * Alpha Vantage Service — Macro indicators, RSI, SMA, earnings calendar.
 */
import type { PivotQuote, EconomicEvent } from "../../types";
import { throttledFetch } from "./throttler";

const BASE = "https://www.alphavantage.co/query";

async function get<T>(params: Record<string, string>, key: string): Promise<T> {
  return throttledFetch("alphavantage", async () => {
    const q   = new URLSearchParams({ apikey: key, ...params });
    const res = await fetch(`${BASE}?${q}`);
    if (!res.ok) throw new Error(`AlphaVantage: ${res.status}`);
    return res.json() as Promise<T>;
  });
}

// ── RSI ───────────────────────────────────────────────────────
interface AVRsi { "Technical Analysis: RSI": Record<string, { RSI: string }> }

export async function fetchRSI(ticker: string, key: string): Promise<number> {
  const raw = await get<AVRsi>({
    function: "RSI", symbol: ticker,
    interval: "daily", time_period: "14", series_type: "close",
  }, key);
  const values = raw["Technical Analysis: RSI"];
  if (!values) return 50;
  const latest = Object.values(values)[0];
  return parseFloat(latest?.RSI ?? "50");
}

// ── SMA ───────────────────────────────────────────────────────
interface AVSMA { "Technical Analysis: SMA": Record<string, { SMA: string }> }

export async function fetchSMA(ticker: string, key: string, period: number): Promise<number> {
  const raw = await get<AVSMA>({
    function: "SMA", symbol: ticker,
    interval: "daily", time_period: String(period), series_type: "close",
  }, key);
  const values = raw["Technical Analysis: SMA"];
  if (!values) return 0;
  const latest = Object.values(values)[0];
  return parseFloat(latest?.SMA ?? "0");
}

// ── ECONOMIC CALENDAR (via AV earnings/macro endpoint) ────────
interface AVEarnings { quarterlyEarnings?: { fiscalDateEnding: string; reportedEPS: string; estimatedEPS: string; }[] }

export async function fetchEarningsCalendar(ticker: string, key: string): Promise<EconomicEvent[]> {
  const raw = await get<AVEarnings>({ function: "EARNINGS", symbol: ticker }, key);
  return (raw.quarterlyEarnings ?? []).slice(0, 8).map((e, i) => ({
    id:         `${ticker}_earn_${i}`,
    date:       new Date(e.fiscalDateEnding),
    time:       "AMC",
    country:    "US",
    event:      `${ticker} Earnings`,
    importance: "high" as const,
    actual:     e.reportedEPS ?? null,
    forecast:   e.estimatedEPS ?? null,
    previous:   null,
  }));
}

// ── FOREX / MACRO ─────────────────────────────────────────────
interface AVFxRate { "Realtime Currency Exchange Rate"?: { "5. Exchange Rate": string; "8. Bid Price": string; "9. Ask Price": string; } }

export async function fetchForexRate(from: string, to: string, key: string): Promise<Partial<PivotQuote>> {
  const raw = await get<AVFxRate>({ function: "CURRENCY_EXCHANGE_RATE", from_currency: from, to_currency: to }, key);
  const rate = raw["Realtime Currency Exchange Rate"];
  const price = parseFloat(rate?.["5. Exchange Rate"] ?? "0");
  return { ticker: `${from}${to}`, name: `${from}/${to}`, price, provider: "alphavantage" };
}
