/**
 * ============================================================
 * TYPES BARREL — Source unique de vérité pour tous les imports de types.
 *
 * Architecture à deux niveaux :
 *   1. Re-exports de src/services/types.ts  → types "Pivot" canoniques
 *   2. Types legacy locaux                  → compatibilité avec l'ancien code
 *   3. Alias de transition                  → ScreenerResult, Signal, etc.
 *
 * Règle : tout import de type passe par "@/types" ou "../types".
 *         Ne jamais importer directement depuis "../services/types" dans les
 *         screens / hooks / utils — uniquement dans les services eux-mêmes.
 * ============================================================
 */

// ─── 1. Re-exports canoniques (src/services/types.ts) ────────
export type {
  PivotQuote,
  PivotCandle,
  PivotNewsItem,
  PivotIndicators,
  PivotScreenerSignal,
  PivotMacroData,
  PivotEconomicEvent,
  Position,
  PositionWithPnL,
  ScreenerProgress,
  ApiStatus,
  DataSource,
  SignalType,
  EventImportance,
} from "../services/types";

// ─── 2. Types legacy (compatibilité ascendante) ───────────────

/** Snapshot de cotation — utilisé par le store legacy et les composants anciens */
export interface QuoteSnapshot {
  ticker:      string;
  price:       number;
  open:        number;
  high:        number;
  low:         number;
  prevClose:   number;
  change:      number;
  changePct:   number;
  volume:      number;
  avgVolume30d: number;
  marketCap?:  number;
  timestamp:   number;
  source:      "finnhub" | "polygon" | "alphavantage" | "mock";
}

/** Bougie OHLCV sans ticker (format léger pour les graphiques) */
export interface Candle {
  time:   number;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

/** Point de sparkline */
export interface SparkPoint {
  time:  number;
  value: number;
}

/** Actualité financière (format legacy) */
export interface NewsItem {
  id:          string;
  headline:    string;
  summary:     string;
  source:      string;
  url:         string;
  publishedAt: number;
  tickers:     string[];
  sectors:     string[];
  sentiment:   "positive" | "negative" | "neutral";
  image?:      string;
}

/** Événement macro-économique (format legacy) */
export interface EconomicEvent {
  id:          string;
  date:        string;
  time?:       string;
  country:     string;
  event:       string;
  importance:  "low" | "medium" | "high";
  actual?:     number;
  forecast?:   number;
  previous?:   number;
  unit?:       string;
}

/** Indicateur macro (VIX, DXY, SPY…) */
export interface MacroIndicator {
  symbol:    string;
  name:      string;
  value:     number;
  change:    number;
  changePct: number;
  timestamp: number;
}

/** Drapeaux de signal technique (screener legacy) */
export type SignalFlag =
  | "RSI_OVERSOLD" | "RSI_OVERBOUGHT"
  | "GOLDEN_CROSS" | "DEATH_CROSS"
  | "VOLUME_BREAKOUT"
  | "ABOVE_SMA50" | "BELOW_SMA50"
  | "NEAR_52W_HIGH" | "NEAR_52W_LOW";

/** Résultat d'analyse technique par ticker (screener legacy) */
export interface TechnicalSignal {
  ticker:         string;
  rsi14:          number;
  sma50:          number;
  sma200:         number;
  currentPrice:   number;
  avgVolume:      number;
  currentVolume:  number;
  signals:        SignalFlag[];
  score:          number;
}

/** Position enrichie avec P&L (format legacy — différent de PositionWithPnL) */
export interface PositionWithPL {
  id:              string;
  ticker:          string;
  name:            string;
  sector:          string;
  quantity:        number;
  avgCost:         number;
  addedAt:         string;
  currentValue:    number;
  costBasis:       number;
  unrealizedPL:    number;
  unrealizedPLPct: number;
  dayPL:           number;
  dayPLPct:        number;
  weight:          number;
}

/** Résumé global du portefeuille */
export interface PortfolioSummary {
  totalValue:       number;
  totalCost:        number;
  totalPL:          number;
  totalPLPct:       number;
  dayPL:            number;
  dayPLPct:         number;
  topGainer:        string;
  topLoser:         string;
  sectorBreakdown:  Record<string, number>;
}

/** Configuration API keys */
export interface APIConfig {
  finnhub:      string;
  polygon:      string;
  alphavantage: string;
}

/** Paramètres globaux de l'application */
export interface AppSettings {
  refreshIntervalFast: number;
  refreshIntervalSlow: number;
  apiKeys:             APIConfig;
  theme:               "dark";
  defaultScreen:       ScreenId;
}

export type ScreenId   = "portfolio" | "news" | "market" | "macro" | "screener";
export type ViewMode   = "table" | "heatmap";

export interface FocusTicker {
  ticker:    string;
  source:    ScreenId;
  timestamp: number;
}

export interface MarketSnapshot {
  id:        string;
  label:     string;
  createdAt: string;
  data:      string;
}

// ─── 3. Alias de transition ───────────────────────────────────
// Ces types permettent à l'ancien code (finance.ts, useDataOrchestrator.ts…)
// de compiler sans modification, le temps d'une migration progressive.

/**
 * @deprecated Utiliser `PivotScreenerSignal` (src/services/types.ts)
 * Alias de compatibilité pour le screener legacy.
 */
export type ScreenerResult = import("../services/types").PivotScreenerSignal;

/**
 * @deprecated Utiliser `PivotScreenerSignal`
 * Alias court utilisé dans les composants SignalChip et finance.ts
 */
export type Signal = import("../services/types").PivotScreenerSignal;

/**
 * @deprecated Utiliser `PositionWithPnL` (src/services/types.ts)
 * Ancien nom utilisé dans useDataOrchestrator.ts
 */
export type PositionPnL = import("../services/types").PositionWithPnL;

/**
 * @deprecated Utiliser `PivotMacroData` (src/services/types.ts)
 */
export type PivotMacro = import("../services/types").PivotMacroData;

/**
 * @deprecated Utiliser `PivotNewsItem` (src/services/types.ts)
 */
export type PivotNews = import("../services/types").PivotNewsItem;
