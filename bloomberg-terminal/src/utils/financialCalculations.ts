/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FINANCIAL CALCULATIONS
 * Logique de calcul financier pure — aucune dépendance UI.
 * Toutes les fonctions sont pures et testables de manière isolée.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { EnrichedPosition, Position, PivotQuote, ScreenerResult, ScreenerSignal } from '../services/types';

// ─── Portfolio Metrics ────────────────────────────────────────────────────────

/**
 * Calcule la valeur de marché d'une position
 */
export function calcMarketValue(quantity: number, currentPrice: number): number {
  return quantity * currentPrice;
}

/**
 * Calcule le coût total d'une position (PRU × quantité)
 */
export function calcCostBasis(quantity: number, avgCost: number): number {
  return quantity * avgCost;
}

/**
 * Calcule le P&L total d'une position
 */
export function calcTotalPnL(marketValue: number, costBasis: number): number {
  return marketValue - costBasis;
}

/**
 * Calcule le P&L total en pourcentage
 */
export function calcTotalPnLPct(totalPnL: number, costBasis: number): number {
  if (costBasis === 0) return 0;
  return (totalPnL / costBasis) * 100;
}

/**
 * Calcule le P&L du jour uniquement (basé sur la variation journalière)
 */
export function calcDayPnL(quantity: number, price: number, changePercent: number): number {
  const previousPrice = price / (1 + changePercent / 100);
  return quantity * (price - previousPrice);
}

/**
 * Enrichit une position avec les données de marché live
 */
export function enrichPosition(
  position: Position,
  quote: PivotQuote,
  totalPortfolioValue: number
): EnrichedPosition {
  const marketValue  = calcMarketValue(position.quantity, quote.price);
  const costBasis    = calcCostBasis(position.quantity, position.avgCost);
  const totalPnL     = calcTotalPnL(marketValue, costBasis);
  const totalPnLPct  = calcTotalPnLPct(totalPnL, costBasis);
  const dayPnL       = calcDayPnL(position.quantity, quote.price, quote.changePercent);
  const weight       = totalPortfolioValue > 0 ? (marketValue / totalPortfolioValue) * 100 : 0;
  const relativeVol  = quote.avgVolume30d > 0 ? quote.volume / quote.avgVolume30d : 0;

  return {
    ...position,
    currentPrice:   quote.price,
    change:         quote.change,
    changePercent:  quote.changePercent,
    dayPnL,
    totalPnL,
    totalPnLPct,
    marketValue,
    costBasis,
    weight,
    volume:         quote.volume,
    avgVolume30d:   quote.avgVolume30d,
    relativeVolume: relativeVol,
  };
}

/**
 * Calcule les métriques agrégées du portfolio
 */
export function calcPortfolioMetrics(positions: EnrichedPosition[]): {
  totalValue:      number;
  totalCost:       number;
  totalPnL:        number;
  totalPnLPct:     number;
  dayPnL:          number;
  dayPnLPct:       number;
  topGainer:       EnrichedPosition | null;
  topLoser:        EnrichedPosition | null;
  bestSector:      string | null;
} {
  const totalValue  = positions.reduce((s, p) => s + p.marketValue, 0);
  const totalCost   = positions.reduce((s, p) => s + p.costBasis, 0);
  const totalPnL    = totalValue - totalCost;
  const totalPnLPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;
  const dayPnL      = positions.reduce((s, p) => s + p.dayPnL, 0);
  const dayPnLPct   = totalValue > 0 ? (dayPnL / (totalValue - dayPnL)) * 100 : 0;

  const sorted      = [...positions].sort((a, b) => b.changePercent - a.changePercent);
  const topGainer   = sorted[0] ?? null;
  const topLoser    = sorted[sorted.length - 1] ?? null;

  // Secteur le plus performant (pondéré par valeur)
  const sectorPnL   = new Map<string, number>();
  for (const p of positions) {
    sectorPnL.set(p.sector, (sectorPnL.get(p.sector) ?? 0) + p.totalPnL);
  }
  let bestSector: string | null = null;
  let bestVal = -Infinity;
  for (const [sector, pnl] of sectorPnL) {
    if (pnl > bestVal) { bestVal = pnl; bestSector = sector; }
  }

  return { totalValue, totalCost, totalPnL, totalPnLPct, dayPnL, dayPnLPct, topGainer, topLoser, bestSector };
}

// ─── Technical Indicators ─────────────────────────────────────────────────────

/**
 * Calcule le RSI à partir d'une série de prix
 */
export function calcRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains  += diff;
    else          losses -= diff;
  }

  let avgGain  = gains  / period;
  let avgLoss  = losses / period;

  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    avgGain  = (avgGain  * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss  = (avgLoss  * (period - 1) + Math.max(-diff, 0)) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Calcule la SMA (Simple Moving Average)
 */
export function calcSMA(prices: number[], period: number): number {
  const slice = prices.slice(-period);
  if (slice.length < period) return 0;
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * Calcule l'EMA (Exponential Moving Average)
 */
export function calcEMA(prices: number[], period: number): number {
  if (prices.length < period) return 0;
  const k     = 2 / (period + 1);
  let ema     = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

/**
 * Calcule l'ATR (Average True Range)
 */
export function calcATR(candles: Array<{ high: number; low: number; close: number }>, period = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prevClose      = candles[i - 1].close;
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }

  return trs.slice(-period).reduce((a, b) => a + b, 0) / Math.min(trs.length, period);
}

/**
 * Calcule le Relative Volume (volume actuel / moyenne N jours)
 */
export function calcRelativeVolume(currentVolume: number, avgVolume: number): number {
  if (avgVolume === 0) return 0;
  return currentVolume / avgVolume;
}

/**
 * Détecte un breakout de volume (RelVol > 2)
 */
export function isVolumeBreakout(relativeVolume: number, threshold = 2.0): boolean {
  return relativeVolume >= threshold;
}

// ─── Screener Score ───────────────────────────────────────────────────────────

/**
 * Génère les signaux de screener pour un ticker
 */
export function generateScreenerSignals(params: {
  rsi:            number | null;
  maSignal:       string;
  relativeVolume: number;
  changePercent:  number;
}): ScreenerSignal[] {
  const signals: ScreenerSignal[] = [];
  const { rsi, maSignal, relativeVolume, changePercent } = params;

  // ── RSI
  if (rsi !== null) {
    if (rsi <= 30) {
      signals.push({
        type:        'RSI_OVERSOLD',
        label:       `RSI ${rsi.toFixed(1)} — Survendu`,
        description: 'RSI ≤ 30 : zone de retournement potentielle',
        strength:    rsi <= 20 ? 'strong' : rsi <= 25 ? 'moderate' : 'weak',
      });
    } else if (rsi >= 70) {
      signals.push({
        type:        'RSI_OVERBOUGHT',
        label:       `RSI ${rsi.toFixed(1)} — Suracheté`,
        description: 'RSI ≥ 70 : risque de correction',
        strength:    rsi >= 80 ? 'strong' : rsi >= 75 ? 'moderate' : 'weak',
      });
    }
  }

  // ── MA Croisements
  if (maSignal === 'golden_cross') {
    signals.push({
      type:        'MA_GOLDEN_CROSS',
      label:       'Golden Cross MA50/200',
      description: 'MA50 vient de passer au-dessus de MA200 — signal haussier majeur',
      strength:    'strong',
    });
  } else if (maSignal === 'death_cross') {
    signals.push({
      type:        'MA_DEATH_CROSS',
      label:       'Death Cross MA50/200',
      description: 'MA50 vient de passer sous MA200 — signal baissier majeur',
      strength:    'strong',
    });
  }

  // ── Volume Breakout
  if (relativeVolume >= 2) {
    signals.push({
      type:        'VOLUME_BREAKOUT',
      label:       `Vol. ×${relativeVolume.toFixed(1)} vs moyenne`,
      description: 'Volume exceptionnellement élevé vs moyenne 30 jours',
      strength:    relativeVolume >= 5 ? 'strong' : relativeVolume >= 3 ? 'moderate' : 'weak',
    });
  }

  // ── Price Breakout (combiné volume + mouvement)
  if (relativeVolume >= 1.5 && Math.abs(changePercent) >= 3) {
    signals.push({
      type:        'PRICE_BREAKOUT',
      label:       `Breakout ${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%`,
      description: 'Mouvement de prix fort avec volume confirmant',
      strength:    Math.abs(changePercent) >= 5 ? 'strong' : 'moderate',
    });
  }

  return signals;
}

/**
 * Calcule un score composite 0-100 pour le screener
 */
export function calcScreenerScore(signals: ScreenerSignal[], changePercent: number, relativeVolume: number): number {
  let score = 50; // Base

  for (const signal of signals) {
    const w = signal.strength === 'strong' ? 15 : signal.strength === 'moderate' ? 8 : 4;
    score  += w;
  }

  // Bonus volume
  score += Math.min(relativeVolume * 2, 15);

  // Bonus momentum
  score += Math.min(Math.abs(changePercent), 10);

  return Math.min(100, Math.max(0, Math.round(score)));
}

// ─── Formatters ───────────────────────────────────────────────────────────────

/** Formate un montant en USD (compact) */
export function fmtCurrency(value: number, compact = false): string {
  if (compact) {
    if (Math.abs(value) >= 1e9)  return `$${(value / 1e9).toFixed(2)}B`;
    if (Math.abs(value) >= 1e6)  return `$${(value / 1e6).toFixed(2)}M`;
    if (Math.abs(value) >= 1e3)  return `$${(value / 1e3).toFixed(1)}K`;
    return `$${value.toFixed(2)}`;
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

/** Formate un pourcentage avec signe */
export function fmtPercent(value: number, decimals = 2): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/** Formate un volume */
export function fmtVolume(volume: number): string {
  if (volume >= 1e9)  return `${(volume / 1e9).toFixed(2)}B`;
  if (volume >= 1e6)  return `${(volume / 1e6).toFixed(2)}M`;
  if (volume >= 1e3)  return `${(volume / 1e3).toFixed(1)}K`;
  return String(volume);
}

/** Formate un prix avec précision adaptée */
export function fmtPrice(price: number): string {
  if (price >= 1000) return price.toFixed(2);
  if (price >= 10)   return price.toFixed(2);
  if (price >= 1)    return price.toFixed(3);
  return price.toFixed(4);
}

/** Couleur CSS selon la valeur */
export function colorForValue(value: number): string {
  if (value > 0) return 'text-market-up';
  if (value < 0) return 'text-market-down';
  return 'text-market-flat';
}

/** Couleur d'intensité pour la heatmap */
export function heatmapColor(changePercent: number): string {
  const intensity = Math.min(Math.abs(changePercent) / 5, 1); // 5% = saturation max
  if (changePercent >= 0) {
    const g = Math.round(60 + intensity * 195);
    const r = Math.round(0 + intensity * 20);
    return `rgba(${r}, ${g}, 100, 0.85)`;
  } else {
    const r = Math.round(80 + intensity * 175);
    const g = Math.round(0);
    return `rgba(${r}, ${g}, 60, 0.85)`;
  }
}
