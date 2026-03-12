/**
 * ============================================================
 * PIVOT DATA FORMAT — Source-agnostic internal data contracts
 * All API services normalize their output to these types.
 * Screens must ONLY consume these types, never raw API shapes.
 * ============================================================
 */

// ─── Quote ──────────────────────────────────────────────────
export interface PivotQuote {
  ticker:         string;
  name:           string;
  price:          number;
  open:           number;
  high:           number;
  low:            number;
  prevClose:      number;
  change:         number;       // absolute
  changePercent:  number;       // %
  volume:         number;
  avgVolume30d:   number;
  marketCap?:     number;
  sector?:        string;
  timestamp:      number;       // epoch ms
  source:         DataSource;
}

// ─── OHLCV Candle ────────────────────────────────────────────
export interface PivotCandle {
  ticker:    string;
  time:      number;            // epoch ms
  open:      number;
  high:      number;
  low:       number;
  close:     number;
  volume:    number;
}

// ─── News Item ───────────────────────────────────────────────
export interface PivotNewsItem {
  id:         string;
  ticker?:    string;           // linked ticker if any
  sector?:    string;
  headline:   string;
  summary:    string;
  source:     string;
  url:        string;
  sentiment?: "bullish" | "bearish" | "neutral";
  publishedAt: number;         // epoch ms
  tags:       string[];
}

// ─── Technical Indicator ─────────────────────────────────────
export interface PivotIndicators {
  ticker:         string;
  rsi14:          number | null;
  sma50:          number | null;
  sma200:         number | null;
  ema20:          number | null;
  macdLine:       number | null;
  macdSignal:     number | null;
  macdHistogram:  number | null;
  volumeRatio:    number | null;  // volume / avg30d
  atr14:          number | null;
  timestamp:      number;
}

// ─── Macro Indicator ─────────────────────────────────────────
export interface PivotMacroData {
  vix:          number | null;
  dxy:          number | null;
  sp500:        number | null;
  sp500Change:  number | null;
  gold:         number | null;
  goldChange:   number | null;
  oil:          number | null;
  oilChange:    number | null;
  btc:          number | null;
  btcChange:    number | null;
  us10y:        number | null;  // 10-year Treasury yield
  timestamp:    number;
}

// ─── Economic Event ──────────────────────────────────────────
export type EventImportance = "low" | "medium" | "high";
export interface PivotEconomicEvent {
  id:          string;
  title:       string;
  country:     string;
  datetime:    number;          // epoch ms
  importance:  EventImportance;
  actual?:     string;
  forecast?:   string;
  previous?:   string;
  currency:    string;
}

// ─── Screener Signal ─────────────────────────────────────────
export type SignalType =
  | "RSI_OVERSOLD"
  | "RSI_OVERBOUGHT"
  | "GOLDEN_CROSS"
  | "DEATH_CROSS"
  | "VOLUME_BREAKOUT"
  | "PRICE_BREAKOUT";

export interface PivotScreenerSignal {
  ticker:       string;
  name:         string;
  signal:       SignalType;
  strength:     "weak" | "moderate" | "strong";
  price:        number;
  changePercent: number;
  details:      string;
  indicators:   Partial<PivotIndicators>;
  detectedAt:   number;        // epoch ms
}

// ─── Portfolio Position ──────────────────────────────────────
export interface Position {
  id:          string;
  ticker:      string;
  name:        string;
  sector:      string;
  quantity:    number;
  avgCost:     number;         // Prix de Revient Unitaire (PRU)
  addedAt:     number;         // epoch ms
}

export interface PositionWithPnL extends Position {
  currentPrice: number;
  change:       number;
  changePercent: number;
  marketValue:  number;
  pnl:          number;        // unrealized P&L
  pnlPercent:   number;
  dayPnL:       number;
  dayPnLPercent: number;
  sparkline:    number[];      // last N closes for miniChart
}

// ─── Metadata ────────────────────────────────────────────────
export type DataSource = "finnhub" | "polygon" | "alphavantage" | "mock";

export interface ApiStatus {
  finnhub:      "ok" | "limited" | "error" | "idle";
  polygon:      "ok" | "limited" | "error" | "idle";
  alphavantage: "ok" | "limited" | "error" | "idle";
  lastUpdated:  number;
}
