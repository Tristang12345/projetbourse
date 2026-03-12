/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PIVOT DATA TYPES
 * Format de données interne unifié - indépendant de la source API
 * Chaque service (Finnhub, Polygon, AlphaVantage) convertit vers ce format.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Quote ───────────────────────────────────────────────────────────────────

/** Snapshot de prix en temps réel */
export interface PivotQuote {
  ticker:        string;
  name:          string;
  price:         number;
  previousClose: number;
  open:          number;
  high:          number;
  low:           number;
  change:        number;      // Variation absolue
  changePercent: number;      // Variation %
  volume:        number;
  avgVolume30d:  number;      // Volume moyen 30 jours
  marketCap?:    number;
  timestamp:     number;      // Unix ms
  source:        DataSource;
}

// ─── Candle / OHLC ───────────────────────────────────────────────────────────

export interface PivotCandle {
  timestamp: number;          // Unix ms
  open:      number;
  high:      number;
  low:       number;
  close:     number;
  volume:    number;
}

// ─── Position Portfolio ───────────────────────────────────────────────────────

export interface Position {
  id:         number;
  ticker:     string;
  name:       string;
  sector:     MarketSector;
  quantity:   number;
  avgCost:    number;         // PRU - Prix de Revient Unitaire
  currency:   string;
  addedAt:    string;         // ISO date
  notes?:     string;
}

/** Position enrichie avec les données de marché */
export interface EnrichedPosition extends Position {
  currentPrice:  number;
  change:        number;
  changePercent: number;
  dayPnL:        number;      // P&L du jour
  totalPnL:      number;      // P&L total
  totalPnLPct:   number;      // P&L total %
  marketValue:   number;      // Valeur de marché actuelle
  costBasis:     number;      // Coût total (PRU × quantité)
  weight:        number;      // Poids % dans le portfolio
  volume:        number;
  avgVolume30d:  number;
  relativeVolume: number;     // Volume relatif (vol/avgVol)
  sparkline?:    number[];    // Données intraday pour sparkline
}

// ─── News ─────────────────────────────────────────────────────────────────────

export interface PivotNewsItem {
  id:         string;
  title:      string;
  summary:    string;
  url:        string;
  source:     string;
  publishedAt: number;        // Unix ms
  relatedTickers: string[];
  sector:     MarketSector;
  sentiment:  NewsSentiment;
  importance: NewsImportance;
  imageUrl?:  string;
}

export type NewsSentiment  = 'positive' | 'negative' | 'neutral';
export type NewsImportance = 'high' | 'medium' | 'low';

// ─── Macro ─────────────────────────────────────────────────────────────────────

export interface MacroIndicator {
  symbol:        string;
  name:          string;
  value:         number;
  change:        number;
  changePercent: number;
  timestamp:     number;
  unit?:         string;
}

export interface EconomicEvent {
  id:          string;
  date:        string;         // ISO date
  time:        string;         // HH:mm
  country:     string;
  flag:        string;         // emoji drapeau
  name:        string;
  importance:  EventImportance;
  actual?:     string;
  forecast?:   string;
  previous?:   string;
  impact?:     EventImpact;
}

export type EventImportance = 'high' | 'medium' | 'low';
export type EventImpact     = 'positive' | 'negative' | 'neutral';

// ─── Screener ─────────────────────────────────────────────────────────────────

export interface ScreenerResult {
  ticker:          string;
  name:            string;
  sector:          MarketSector;
  price:           number;
  changePercent:   number;
  volume:          number;
  relativeVolume:  number;
  rsi:             number;
  ma50:            number;
  ma200:           number;
  maSignal:        MACrossSignal;
  volumeBreakout:  boolean;
  signals:         ScreenerSignal[];
  score:           number;     // Score composite 0-100
}

export interface ScreenerSignal {
  type:        SignalType;
  label:       string;
  description: string;
  strength:    'strong' | 'moderate' | 'weak';
}

export type SignalType    = 'RSI_OVERSOLD' | 'RSI_OVERBOUGHT' | 'MA_GOLDEN_CROSS' | 'MA_DEATH_CROSS' | 'VOLUME_BREAKOUT' | 'PRICE_BREAKOUT';
export type MACrossSignal = 'golden_cross' | 'death_cross' | 'bullish' | 'bearish' | 'neutral';

// ─── Market Activity ──────────────────────────────────────────────────────────

export interface MarketActivityItem {
  ticker:          string;
  name:            string;
  sector:          MarketSector;
  price:           number;
  changePercent:   number;
  volume:          number;
  volumeCapital:   number;     // Volume en valeur ($)
  relativeVolume:  number;
  marketCap?:      number;
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────

export interface HeatmapCell {
  ticker:      string;
  name:        string;
  sector:      MarketSector;
  changePercent: number;
  marketCap:   number;
  size:        number;         // Taille relative pour le treemap (0-1)
}

// ─── Secteurs ─────────────────────────────────────────────────────────────────

export type MarketSector =
  | 'Technology'
  | 'Healthcare'
  | 'Finance'
  | 'Energy'
  | 'Consumer'
  | 'Industrials'
  | 'Materials'
  | 'Utilities'
  | 'Real Estate'
  | 'Communication'
  | 'Unknown';

export const SECTOR_COLORS: Record<MarketSector, string> = {
  'Technology':    '#1E90FF',
  'Healthcare':    '#00C49F',
  'Finance':       '#FFB830',
  'Energy':        '#FF7043',
  'Consumer':      '#AB47BC',
  'Industrials':   '#26C6DA',
  'Materials':     '#8D6E63',
  'Utilities':     '#66BB6A',
  'Real Estate':   '#EC407A',
  'Communication': '#42A5F5',
  'Unknown':       '#546E7A',
};

// ─── Sources de données ────────────────────────────────────────────────────────

export type DataSource = 'finnhub' | 'polygon' | 'alphavantage' | 'mock';

// ─── Snapshot ─────────────────────────────────────────────────────────────────

export interface TerminalSnapshot {
  id:          number;
  name:        string;
  createdAt:   string;
  positions:   Position[];
  quotes:      Record<string, PivotQuote>;
  macroData:   MacroIndicator[];
  notes?:      string;
}

// ─── Config API ───────────────────────────────────────────────────────────────

export interface ApiConfig {
  finnhubKey:       string;
  polygonKey:       string;
  alphaVantageKey:  string;
}
