/**
 * ============================================================
 * FINANCIAL CALCULATIONS — Pure functions, no side effects.
 * Corrections : MACD (vraie ligne signal), Golden/Death Cross
 *               (croisement réel J-1→J), formatPrice (2 décimales).
 * ============================================================
 */

export const calcPnL = (currentPrice: number, avgCost: number, quantity: number): number =>
  (currentPrice - avgCost) * quantity;

export const calcPnLPercent = (currentPrice: number, avgCost: number): number =>
  avgCost === 0 ? 0 : ((currentPrice - avgCost) / avgCost) * 100;

export const calcDayPnL = (currentPrice: number, prevClose: number, quantity: number): number =>
  (currentPrice - prevClose) * quantity;

export const calcMarketValue = (price: number, qty: number): number => price * qty;

export const calcSMA = (data: number[], period: number): number | null => {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
};

export const calcEMA = (data: number[], period: number): number | null => {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) ema = data[i] * k + ema * (1 - k);
  return ema;
};

export const calcRSI = (closes: number[], period = 14): number | null => {
  if (closes.length < period + 1) return null;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + Math.max(changes[i], 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-changes[i], 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
};

/**
 * MACD CORRIGE — vraie ligne signal EMA(signalPeriod) calculée
 * sur la série historique complète des valeurs MACD.
 * Avant : signal = line → histogramme toujours 0.
 */
export const calcMACD = (
  closes: number[], fast = 12, slow = 26, signalPeriod = 9,
): { line: number | null; signal: number | null; histogram: number | null } => {
  if (closes.length < slow + signalPeriod)
    return { line: null, signal: null, histogram: null };

  const kf = 2 / (fast + 1), ks = 2 / (slow + 1), kSig = 2 / (signalPeriod + 1);
  let emaFast = closes.slice(0, fast).reduce((a, b) => a + b, 0) / fast;
  let emaSlow = closes.slice(0, slow).reduce((a, b) => a + b, 0) / slow;

  for (let i = fast; i < slow; i++) emaFast = closes[i] * kf + emaFast * (1 - kf);

  const macdSeries: number[] = [];
  for (let i = slow; i < closes.length; i++) {
    emaFast = closes[i] * kf + emaFast * (1 - kf);
    emaSlow = closes[i] * ks + emaSlow * (1 - ks);
    macdSeries.push(emaFast - emaSlow);
  }

  if (macdSeries.length < signalPeriod)
    return { line: null, signal: null, histogram: null };

  let signalEma = macdSeries.slice(0, signalPeriod).reduce((a, b) => a + b, 0) / signalPeriod;
  for (let i = signalPeriod; i < macdSeries.length; i++)
    signalEma = macdSeries[i] * kSig + signalEma * (1 - kSig);

  const macdLine = macdSeries[macdSeries.length - 1];
  return { line: macdLine, signal: signalEma, histogram: macdLine - signalEma };
};

export const calcATR = (
  highs: number[], lows: number[], closes: number[], period = 14,
): number | null => {
  if (highs.length < period + 1) return null;
  const tr: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    tr.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i]  - closes[i - 1]),
    ));
  }
  return calcSMA(tr, period);
};

export const detectRSISignal = (rsi: number | null): "RSI_OVERSOLD" | "RSI_OVERBOUGHT" | null => {
  if (rsi === null) return null;
  if (rsi <= 30) return "RSI_OVERSOLD";
  if (rsi >= 70) return "RSI_OVERBOUGHT";
  return null;
};

/**
 * GOLDEN/DEATH CROSS CORRIGE — croisement strict J-1 → J.
 * Avant : proximité < 0.5% → faux positifs permanents sur chaque refresh.
 */
export const detectMACrossSignal = (
  sma50: number | null, sma200: number | null,
  prevSma50: number | null, prevSma200: number | null,
): "GOLDEN_CROSS" | "DEATH_CROSS" | null => {
  if (!sma50 || !sma200 || !prevSma50 || !prevSma200) return null;
  if (prevSma50 < prevSma200 && sma50 > sma200) return "GOLDEN_CROSS";
  if (prevSma50 > prevSma200 && sma50 < sma200) return "DEATH_CROSS";
  return null;
};

export const detectVolumeBreakout = (
  volume: number, avgVolume: number, threshold = 2.0,
): boolean => avgVolume > 0 && volume / avgVolume >= threshold;

export const formatCurrency = (value: number, currency = "USD", compact = false): string => {
  if (compact && Math.abs(value) >= 1_000_000) {
    const m = value / 1_000_000;
    return `${m >= 0 ? "+" : ""}${m.toFixed(2)}M`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
};

export const formatPercent = (value: number, decimals = 2): string =>
  `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%`;

export const formatVolume = (vol: number): string => {
  if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(2)}B`;
  if (vol >= 1_000_000)     return `${(vol / 1_000_000).toFixed(2)}M`;
  if (vol >= 1_000)         return `${(vol / 1_000).toFixed(1)}K`;
  return vol.toString();
};

export const colorClass = (value: number): string =>
  value > 0 ? "text-up" : value < 0 ? "text-down" : "text-terminal-dim";

export const rsiColorClass = (rsi: number | null): string => {
  if (rsi === null) return "text-terminal-dim";
  if (rsi <= 30) return "text-up";
  if (rsi >= 70) return "text-down";
  return "text-terminal-text";
};

/** 2 décimales fixes partout sauf JPY (convention standard). */
export const formatPrice = (
  value: number,
  currency: "USD" | "EUR" | "GBP" | "JPY" | "CHF" = "USD",
  decimals?: number,
): string => {
  const d = decimals ?? (currency === "JPY" ? 0 : 2);
  const f = value.toFixed(d);
  switch (currency) {
    case "EUR": return `${f} €`;
    case "GBP": return `£${f}`;
    case "JPY": return `¥${f}`;
    case "CHF": return `Fr ${f}`;
    default:    return `$${f}`;
  }
};

export const currencySymbol = (
  currency: "USD" | "EUR" | "GBP" | "JPY" | "CHF" = "USD",
): string => ({ USD: "$", EUR: "€", GBP: "£", JPY: "¥", CHF: "Fr" })[currency] ?? "$";
