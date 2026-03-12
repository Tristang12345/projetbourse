// ============================================================
// FINANCIAL CALCULATIONS — Pure functions, no side effects
// ============================================================
import type { Position, PositionWithPL, QuoteSnapshot, PortfolioSummary, TechnicalSignal, SignalFlag, Candle } from "@/types";

export function computePositionPL(position: Position, quote?: QuoteSnapshot): PositionWithPL {
  const price = quote?.price ?? position.avgCost;
  const prevClose = quote?.prevClose ?? position.avgCost;
  const costBasis = position.quantity * position.avgCost;
  const currentValue = position.quantity * price;
  const unrealizedPL = currentValue - costBasis;
  const unrealizedPLPct = costBasis > 0 ? (unrealizedPL / costBasis) * 100 : 0;
  const dayPL = position.quantity * (price - prevClose);
  const dayPLPct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
  return { ...position, quote, currentValue, costBasis, unrealizedPL, unrealizedPLPct, dayPL, dayPLPct, weight: 0 };
}

export function computePortfolioSummary(positions: Array<Position & { quote?: QuoteSnapshot }>): PortfolioSummary {
  const computed = positions.map((p) => computePositionPL(p, p.quote));
  const totalValue = computed.reduce((s, p) => s + p.currentValue, 0);
  const totalCost = computed.reduce((s, p) => s + p.costBasis, 0);
  const totalPL = totalValue - totalCost;
  const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;
  const dayPL = computed.reduce((s, p) => s + p.dayPL, 0);
  const dayPLPct = totalValue > 0 ? (dayPL / (totalValue - dayPL)) * 100 : 0;
  computed.forEach((p) => { p.weight = totalValue > 0 ? (p.currentValue / totalValue) * 100 : 0; });
  const sorted = [...computed].sort((a, b) => b.unrealizedPLPct - a.unrealizedPLPct);
  const sectorBreakdown: Record<string, number> = {};
  computed.forEach((p) => { sectorBreakdown[p.sector] = (sectorBreakdown[p.sector] ?? 0) + p.currentValue; });
  return { totalValue, totalCost, totalPL, totalPLPct, dayPL, dayPLPct, topGainer: sorted[0]?.ticker ?? "—", topLoser: sorted[sorted.length - 1]?.ticker ?? "—", sectorBreakdown };
}

export function sma(values: number[], period: number): number {
  if (values.length < period) return 0;
  return values.slice(-period).reduce((s, v) => s + v, 0) / period;
}

export function ema(values: number[], period: number): number {
  if (!values.length) return 0;
  const k = 2 / (period + 1);
  let acc = values[0];
  for (let i = 1; i < values.length; i++) acc = values[i] * k + acc * (1 - k);
  return acc;
}

export function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + Math.max(0, changes[i])) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -changes[i])) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function computeTechnicalSignal(ticker: string, candles: Candle[]): TechnicalSignal {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const currentPrice = closes.at(-1) ?? 0;
  const currentVolume = volumes.at(-1) ?? 0;
  const avgVolume = sma(volumes, Math.min(30, volumes.length));
  const rsi14 = rsi(closes);
  const sma50 = sma(closes, Math.min(50, closes.length));
  const sma200 = sma(closes, Math.min(200, closes.length));
  const signals: SignalFlag[] = [];
  if (rsi14 < 30) signals.push("RSI_OVERSOLD");
  if (rsi14 > 70) signals.push("RSI_OVERBOUGHT");
  if (sma50 > sma200 && sma200 > 0) signals.push("GOLDEN_CROSS");
  else if (sma50 < sma200 && sma200 > 0) signals.push("DEATH_CROSS");
  if (avgVolume > 0 && currentVolume / avgVolume > 2) signals.push("VOLUME_BREAKOUT");
  signals.push(currentPrice > sma50 ? "ABOVE_SMA50" : "BELOW_SMA50");
  return { ticker, rsi14, sma50, sma200, currentPrice, avgVolume, currentVolume, signals, score: 0 };
}

export const formatCurrency = (v: number, d = 2) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
export const formatCompact = (v: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(v);
export const formatPct = (v: number, d = 2): string => `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
export const formatVolume = (v: number): string => v >= 1e9 ? `${(v/1e9).toFixed(2)}B` : v >= 1e6 ? `${(v/1e6).toFixed(2)}M` : v >= 1e3 ? `${(v/1e3).toFixed(1)}K` : String(v);
export const classifyChange = (v: number): "pos" | "neg" | "neutral" => v > 0.001 ? "pos" : v < -0.001 ? "neg" : "neutral";
