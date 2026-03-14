/**
 * ============================================================
 * PIVOT DATA FORMAT — Source-agnostic internal data contracts
 * All API services normalize their output to these types.
 * Screens must ONLY consume these types, never raw API shapes.
 * ============================================================
 */

// ─── Quote ───────────────────────────────────────────────────
export interface PivotQuote {
  ticker:         string;
  name:           string;
  price:          number;
  open:           number;
  high:           number;
  low:            number;
  prevClose:      number;
  change:         number;        // absolute Δ
  changePercent:  number;        // %
  volume:         number;
  avgVolume30d:   number;
  marketCap?:     number;
  sector?:        string;
  /** ISO 4217 — "USD" for US equities, "EUR" for Euronext */
  currency:       "USD" | "EUR" | "GBP" | "JPY" | "CHF";
  /** Exchange mic or short label */
  exchange?:      "NYSE" | "NASDAQ" | "EURONEXT" | "XETRA" | "LSE";
  /** ISO alpha-2 country of listing */
  country?:       "US" | "FR" | "DE" | "NL" | "BE" | "GB";
  timestamp:      number;        // epoch ms
  source:         DataSource;
}

// ─── OHLCV Candle ─────────────────────────────────────────────
export interface PivotCandle {
  ticker:    string;
  time:      number;             // epoch ms
  open:      number;
  high:      number;
  low:       number;
  close:     number;
  volume:    number;
}

// ─── News Item ────────────────────────────────────────────────
export interface PivotNewsItem {
  id:          string;
  ticker?:     string;           // linked ticker if any
  sector?:     string;
  headline:    string;
  summary:     string;
  source:      string;
  url:         string;
  sentiment?:  "bullish" | "bearish" | "neutral";
  publishedAt: number;           // epoch ms
  tags:        string[];
}

// ─── Technical Indicators ─────────────────────────────────────
export interface PivotIndicators {
  ticker:          string;
  rsi14:           number | null;
  sma50:           number | null;
  sma200:          number | null;
  ema20:           number | null;
  macdLine:        number | null;
  macdSignal:      number | null;
  macdHistogram:   number | null;
  volumeRatio:     number | null; // volume / avg30d
  atr14:           number | null;
  timestamp:       number;
}

// ─── Screener Signal ──────────────────────────────────────────
export type SignalType =
  | "RSI_OVERSOLD"
  | "RSI_OVERBOUGHT"
  | "GOLDEN_CROSS"
  | "DEATH_CROSS"
  | "VOLUME_BREAKOUT"
  | "PRICE_BREAKOUT";

export interface PivotScreenerSignal {
  ticker:        string;
  name:          string;
  signal:        SignalType;
  strength:      "weak" | "moderate" | "strong";
  price:         number;
  /** ISO 4217 currency of the price — critical for correct display */
  currency:      PivotQuote["currency"];
  exchange?:     PivotQuote["exchange"];
  country?:      PivotQuote["country"];
  sector?:       string;
  changePercent: number;
  details:       string;
  indicators:    Partial<PivotIndicators>;
  detectedAt:    number;         // epoch ms
}

// ─── Macro Indicator ──────────────────────────────────────────
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
  us10y:        number | null;
  timestamp:    number;
}

// ─── Economic Event ───────────────────────────────────────────
export type EventImportance = "low" | "medium" | "high";
export interface PivotEconomicEvent {
  id:          string;
  title:       string;
  country:     string;
  datetime:    number;           // epoch ms
  importance:  EventImportance;
  actual?:     string;
  forecast?:   string;
  previous?:   string;
  currency:    string;
}

// ─── Portfolio Position ───────────────────────────────────────
export interface Position {
  id:       string;
  ticker:   string;
  name:     string;
  sector:   string;
  quantity: number;
  avgCost:  number;              // PRU — en devise locale du ticker
  addedAt:  number;              // epoch ms
}

export interface PositionWithPnL extends Position {
  currentPrice:  number;
  open:          number;         // cours d'ouverture du jour
  prevClose:     number;         // clôture de la veille
  change:        number;
  changePercent: number;
  marketValue:   number;
  pnl:           number;         // unrealized P&L
  pnlPercent:    number;
  dayPnL:        number;
  dayPnLPercent: number;
  sparkline:     number[];
  currency:      PivotQuote["currency"];
}

// ─── Screener Progress ────────────────────────────────────────
export interface ScreenerProgress {
  total:     number;
  completed: number;
  current:   string;            // ticker being processed
  phase:     "idle" | "running" | "done";
}

// ─── Meta ─────────────────────────────────────────────────────
export type DataSource = "finnhub" | "polygon" | "alphavantage" | "yahoo" | "coingecko" | "mock";

export interface ApiStatus {
  finnhub:      "ok" | "limited" | "error" | "idle";
  polygon:      "ok" | "limited" | "error" | "idle";
  alphavantage: "ok" | "limited" | "error" | "idle";
  lastUpdated:  number;
}
