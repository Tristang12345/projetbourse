/**
 * ============================================================
 * FINANCIAL CALCULATIONS — Pure functions, no side effects.
 * All calculations are separated from display logic.
 * ============================================================
 */

// ─── P&L ─────────────────────────────────────────────────────

/** Absolute unrealized P&L */
export const calcPnL = (
  currentPrice: number,
  avgCost: number,
  quantity: number,
): number => (currentPrice - avgCost) * quantity;

/** P&L as percentage of cost basis */
export const calcPnLPercent = (
  currentPrice: number,
  avgCost: number,
): number =>
  avgCost === 0 ? 0 : ((currentPrice - avgCost) / avgCost) * 100;

/** Day P&L: (current - prevClose) * qty */
export const calcDayPnL = (
  currentPrice: number,
  prevClose: number,
  quantity: number,
): number => (currentPrice - prevClose) * quantity;

/** Current market value of a position */
export const calcMarketValue = (price: number, qty: number): number =>
  price * qty;

// ─── Technical Indicators ────────────────────────────────────

/**
 * Simple Moving Average
 * @param data  Array of closing prices (oldest → newest)
 * @param period  Window size
 */
export const calcSMA = (data: number[], period: number): number | null => {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
};

/**
 * Exponential Moving Average
 * Uses SMA as seed; applies smoothing factor k = 2/(period+1)
 */
export const calcEMA = (data: number[], period: number): number | null => {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
};

/**
 * Relative Strength Index (Wilder's method)
 * @param closes  Array of closing prices (oldest → newest)
 * @param period  Default 14
 */
export const calcRSI = (closes: number[], period = 14): number | null => {
  if (closes.length < period + 1) return null;

  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
};

/** MACD: returns { line, signal, histogram } */
export const calcMACD = (
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9,
): { line: number | null; signal: number | null; histogram: number | null } => {
  const fastEMA  = calcEMA(closes, fast);
  const slowEMA  = calcEMA(closes, slow);
  if (fastEMA === null || slowEMA === null)
    return { line: null, signal: null, histogram: null };
  const macdLine = fastEMA - slowEMA;
  // Approximate signal using last 9 MACD values (simplified)
  const signalVal = macdLine; // Real impl requires historical MACD series
  return {
    line:      macdLine,
    signal:    signalVal,
    histogram: macdLine - signalVal,
  };
};

/**
 * Average True Range (simplified — requires OHLC series)
 * @param highs   Array of highs
 * @param lows    Array of lows
 * @param closes  Array of closes
 * @param period  Default 14
 */
export const calcATR = (
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): number | null => {
  if (highs.length < period + 1) return null;
  const trValues: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const hl   = highs[i] - lows[i];
    const hpc  = Math.abs(highs[i] - closes[i - 1]);
    const lpc  = Math.abs(lows[i] - closes[i - 1]);
    trValues.push(Math.max(hl, hpc, lpc));
  }
  return calcSMA(trValues, period);
};

// ─── Screener Signals ────────────────────────────────────────

/** Detect RSI oversold/overbought */
export const detectRSISignal = (
  rsi: number | null,
): "RSI_OVERSOLD" | "RSI_OVERBOUGHT" | null => {
  if (rsi === null) return null;
  if (rsi <= 30) return "RSI_OVERSOLD";
  if (rsi >= 70) return "RSI_OVERBOUGHT";
  return null;
};

/** Detect golden/death cross */
export const detectMACrossSignal = (
  sma50: number | null,
  sma200: number | null,
  prevSma50: number | null,
  prevSma200: number | null,
): "GOLDEN_CROSS" | "DEATH_CROSS" | null => {
  if (!sma50 || !sma200 || !prevSma50 || !prevSma200) return null;
  const isCrossAbove = prevSma50 < prevSma200 && sma50 > sma200;
  const isCrossBelow = prevSma50 > prevSma200 && sma50 < sma200;
  if (isCrossAbove) return "GOLDEN_CROSS";
  if (isCrossBelow) return "DEATH_CROSS";
  return null;
};

/** Volume breakout: current volume significantly above average */
export const detectVolumeBreakout = (
  volume: number,
  avgVolume: number,
  threshold = 2.0,
): boolean => avgVolume > 0 && volume / avgVolume >= threshold;

// ─── Formatting Helpers ──────────────────────────────────────

/** Format number as currency string */
export const formatCurrency = (
  value: number,
  currency = "USD",
  compact = false,
): string => {
  if (compact && Math.abs(value) >= 1_000_000) {
    const m = value / 1_000_000;
    return `${m >= 0 ? "+" : ""}${m.toFixed(2)}M`;
  }
  return new Intl.NumberFormat("en-US", {
    style:    "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

/** Format percentage with sign */
export const formatPercent = (value: number, decimals = 2): string => {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
};

/** Format large volume numbers */
export const formatVolume = (vol: number): string => {
  if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(2)}B`;
  if (vol >= 1_000_000)     return `${(vol / 1_000_000).toFixed(2)}M`;
  if (vol >= 1_000)         return `${(vol / 1_000).toFixed(1)}K`;
  return vol.toString();
};

/** Color class based on sign */
export const colorClass = (value: number): string =>
  value > 0 ? "text-up" : value < 0 ? "text-down" : "text-terminal-dim";

/** RSI color zone */
export const rsiColorClass = (rsi: number | null): string => {
  if (rsi === null) return "text-terminal-dim";
  if (rsi <= 30)   return "text-up";
  if (rsi >= 70)   return "text-down";
  return "text-terminal-text";
};

/** Format price with correct currency symbol (€ for EUR, £ for GBP, etc.) */
export const formatPrice = (
  value:    number,
  currency: "USD" | "EUR" | "GBP" | "JPY" | "CHF" = "USD",
  decimals?: number,
): string => {
  const d = decimals ?? (value < 10 ? 3 : value < 100 ? 2 : 0);
  const formatted = value.toFixed(d);
  switch (currency) {
    case "EUR": return `${formatted} €`;
    case "GBP": return `£${formatted}`;
    case "JPY": return `¥${value.toFixed(0)}`;
    case "CHF": return `Fr ${formatted}`;
    default:    return `$${formatted}`;
  }
};

/** Currency symbol only */
export const currencySymbol = (currency: "USD" | "EUR" | "GBP" | "JPY" | "CHF" = "USD"): string => {
  const symbols: Record<string, string> = {
    USD: "$", EUR: "€", GBP: "£", JPY: "¥", CHF: "Fr",
  };
  return symbols[currency] ?? "$";
};
