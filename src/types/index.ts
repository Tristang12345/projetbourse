// ============================================================
// CORE DOMAIN TYPES
// ============================================================

export interface QuoteSnapshot {
  ticker: string; price: number; open: number; high: number; low: number;
  prevClose: number; change: number; changePct: number;
  volume: number; avgVolume30d: number; marketCap?: number;
  timestamp: number; source: DataSource;
}
export interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }
export interface SparkPoint { time: number; value: number; }
export interface NewsItem {
  id: string; headline: string; summary: string; source: string; url: string;
  publishedAt: number; tickers: string[]; sectors: string[];
  sentiment: "positive" | "negative" | "neutral"; image?: string;
}
export interface EconomicEvent {
  id: string; date: string; time?: string; country: string; event: string;
  importance: "low" | "medium" | "high"; actual?: number; forecast?: number; previous?: number; unit?: string;
}
export interface MacroIndicator {
  symbol: string; name: string; value: number; change: number; changePct: number; timestamp: number;
}
export type SignalFlag = "RSI_OVERSOLD"|"RSI_OVERBOUGHT"|"GOLDEN_CROSS"|"DEATH_CROSS"|"VOLUME_BREAKOUT"|"ABOVE_SMA50"|"BELOW_SMA50"|"NEAR_52W_HIGH"|"NEAR_52W_LOW";
export interface TechnicalSignal {
  ticker: string; rsi14: number; sma50: number; sma200: number;
  currentPrice: number; avgVolume: number; currentVolume: number;
  signals: SignalFlag[]; score: number;
}
export interface Position {
  id: string; ticker: string; name: string; sector: string;
  quantity: number; avgCost: number; addedAt: string;
  quote?: QuoteSnapshot; sparks?: SparkPoint[];
}
export interface PositionWithPL extends Position {
  currentValue: number; costBasis: number; unrealizedPL: number; unrealizedPLPct: number;
  dayPL: number; dayPLPct: number; weight: number;
}
export interface PortfolioSummary {
  totalValue: number; totalCost: number; totalPL: number; totalPLPct: number;
  dayPL: number; dayPLPct: number; topGainer: string; topLoser: string;
  sectorBreakdown: Record<string, number>;
}
export type DataSource = "finnhub" | "polygon" | "alphavantage" | "mock";
export interface APIConfig { finnhub: string; polygon: string; alphavantage: string; }
export type ScreenId = "portfolio" | "news" | "market" | "macro" | "screener";
export type ViewMode = "table" | "heatmap";
export interface AppSettings {
  refreshIntervalFast: number; refreshIntervalSlow: number;
  apiKeys: APIConfig; theme: "dark"; defaultScreen: ScreenId;
}
export interface FocusTicker { ticker: string; source: ScreenId; timestamp: number; }
export interface MarketSnapshot { id: string; label: string; createdAt: string; data: string; }
