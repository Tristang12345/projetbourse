/**
 * Financial Math — Pure computation functions.
 * No I/O, no side effects. Fully testable.
 */
import type { PivotCandle, ScreenerResult, Signal, SignalType } from "../types";

// ── P&L ───────────────────────────────────────────────────────

export function computePnL(quantity: number, avgCost: number, currentPrice: number) {
  const marketValue  = quantity * currentPrice;
  const costBasis    = quantity * avgCost;
  const pnlAbsolute  = marketValue - costBasis;
  const pnlPercent   = costBasis > 0 ? (pnlAbsolute / costBasis) * 100 : 0;
  return { marketValue, pnlAbsolute, pnlPercent };
}

// ── RSI ───────────────────────────────────────────────────────

export function computeRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta > 0) gains += delta; else losses -= delta;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(delta, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-delta, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// ── SMA ───────────────────────────────────────────────────────

export function computeSMA(values: number[], period: number): number {
  if (values.length < period) return 0;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// ── EMA ───────────────────────────────────────────────────────

export function computeEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k   = 2 / (period + 1);
  const ema = [values[0]];
  for (let i = 1; i < values.length; i++) {
    ema.push(values[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

// ── RELATIVE VOLUME ───────────────────────────────────────────

export function computeRelVolume(todayVolume: number, avgVolume30d: number): number {
  if (avgVolume30d <= 0) return 1;
  return todayVolume / avgVolume30d;
}

// ── SCREENER SIGNALS ──────────────────────────────────────────

export function detectSignals(
  rsi: number, sma50: number, sma200: number,
  relVolume: number, price: number, week52High: number, week52Low: number
): Signal[] {
  const signals: Signal[] = [];

  const add = (type: SignalType, label: string, strength: Signal["strength"]) =>
    signals.push({ type, label, strength });

  // RSI signals
  if (rsi <= 30)      add("rsi_oversold",   `RSI oversold (${rsi.toFixed(1)})`, rsi <= 20 ? "strong" : "medium");
  else if (rsi >= 70) add("rsi_overbought", `RSI overbought (${rsi.toFixed(1)})`, rsi >= 80 ? "strong" : "medium");

  // MA cross signals
  if (sma50 > 0 && sma200 > 0) {
    if (sma50 > sma200 * 1.01) add("golden_cross", "SMA50 > SMA200",  "strong");
    else if (sma50 < sma200 * 0.99) add("death_cross", "SMA50 < SMA200", "strong");
  }

  // Volume breakout
  if (relVolume >= 3)      add("vol_breakout", `Vol ×${relVolume.toFixed(1)} vs avg`, "strong");
  else if (relVolume >= 2) add("vol_breakout", `Vol ×${relVolume.toFixed(1)} vs avg`, "medium");

  // 52-week proximity
  if (week52High > 0 && price >= week52High * 0.97)
    add("near_52w_high", "Near 52W High", "medium");
  if (week52Low > 0 && price <= week52Low * 1.03)
    add("near_52w_low", "Near 52W Low", "medium");

  return signals;
}

// ── COMPOSITE SCREENER SCORE (0–100) ──────────────────────────

export function computeScore(signals: Signal[], rsi: number, relVolume: number): number {
  let score = 50;
  for (const s of signals) {
    const w = s.strength === "strong" ? 15 : s.strength === "medium" ? 8 : 4;
    score += w;
  }
  // RSI component
  if (rsi <= 30) score += (30 - rsi);
  if (rsi >= 70) score += (rsi - 70);
  // Volume component
  score += Math.min(relVolume * 5, 20);
  return Math.min(100, Math.max(0, Math.round(score)));
}

// ── FORMAT HELPERS ────────────────────────────────────────────

export function formatCurrency(value: number, currency = "USD", compact = false): string {
  if (compact && Math.abs(value) >= 1_000_000_000)
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (compact && Math.abs(value) >= 1_000_000)
    return `${(value / 1_000_000).toFixed(2)}M`;
  if (compact && Math.abs(value) >= 1_000)
    return `${(value / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
}

export function formatPct(value: number, showPlus = true): string {
  const sign = value > 0 && showPlus ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatVolume(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return String(value);
}

export function sentimentLabel(score: number): { label: string; color: string } {
  if (score >= 0.3)  return { label: "Bullish",  color: "text-bull" };
  if (score <= -0.3) return { label: "Bearish",  color: "text-bear" };
  return                     { label: "Neutral",  color: "text-terminal-dim" };
}

// ── SPARKLINE DATA (normalize for SVG) ───────────────────────

export function normalizeSparkline(candles: PivotCandle[], width = 80, height = 24): string {
  if (candles.length < 2) return "";
  const closes = candles.map(c => c.close);
  const min    = Math.min(...closes);
  const max    = Math.max(...closes);
  const range  = max - min || 1;
  const step   = width / (closes.length - 1);
  const points = closes.map((c, i) => {
    const x = i * step;
    const y = height - ((c - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return points.join(" ");
}
