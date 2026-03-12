/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TERMINAL STORE (Zustand)
 * État global centralisé et réactif du terminal Bloomberg.
 * Toutes les actions de données passent par ce store.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { create } from 'zustand';
import type {
  Position, EnrichedPosition, PivotQuote, PivotNewsItem, MacroIndicator,
  EconomicEvent, ScreenerResult, MarketActivityItem, ApiConfig,
} from '../services/types';
import {
  enrichPosition, calcPortfolioMetrics, generateScreenerSignals, calcScreenerScore,
} from '../utils/financialCalculations';

// ─── Refresh intervals (ms) ───────────────────────────────────────────────────
const INTERVALS = {
  portfolio: 15_000,    // 15s — données P&L critiques
  news:      60_000,    // 1min
  activity:  30_000,    // 30s
  macro:     120_000,   // 2min — données macro lentes
  screener:  300_000,   // 5min — screener intensif
};

// ─── Types ────────────────────────────────────────────────────────────────────

type ActiveScreen = 'portfolio' | 'news' | 'activity' | 'macro' | 'screener';

interface TerminalState {
  // ── Config
  apiConfig:        ApiConfig;
  setApiConfig:     (config: Partial<ApiConfig>) => void;

  // ── Positions
  positions:        Position[];
  enrichedPositions: EnrichedPosition[];
  addPosition:      (p: Omit<Position, 'id'>) => void;
  removePosition:   (id: number) => void;
  updatePosition:   (id: number, updates: Partial<Position>) => void;

  // ── Quotes live
  quotes:           Map<string, PivotQuote>;
  setQuote:         (ticker: string, quote: PivotQuote) => void;
  setQuotes:        (quotes: Map<string, PivotQuote>) => void;

  // ── Global Focus Mode
  focusedTicker:    string | null;
  setFocusedTicker: (ticker: string | null) => void;

  // ── Navigation
  activeScreen:     ActiveScreen;
  setActiveScreen:  (s: ActiveScreen) => void;

  // ── News
  news:             PivotNewsItem[];
  setNews:          (items: PivotNewsItem[]) => void;
  newsFilter:       string;        // filtre texte libre
  setNewsFilter:    (f: string) => void;
  newsSectorFilter: string | null;
  setNewsSectorFilter: (s: string | null) => void;

  // ── Market Activity
  marketActivity:   MarketActivityItem[];
  setMarketActivity: (items: MarketActivityItem[]) => void;
  activityView:     'table' | 'heatmap';
  setActivityView:  (v: 'table' | 'heatmap') => void;

  // ── Macro
  macroIndicators:  MacroIndicator[];
  setMacroIndicators: (indicators: MacroIndicator[]) => void;
  economicCalendar: EconomicEvent[];
  setEconomicCalendar: (events: EconomicEvent[]) => void;
  calendarFilter:   'all' | 'high' | 'medium';
  setCalendarFilter: (f: 'all' | 'high' | 'medium') => void;
  vix?:             MacroIndicator;
  dxy?:             MacroIndicator;
  setVIX:           (v: MacroIndicator) => void;
  setDXY:           (v: MacroIndicator) => void;

  // ── Screener
  screenerResults:  ScreenerResult[];
  setScreenerResults: (r: ScreenerResult[]) => void;
  screenerFilter:   { minRSI: number; maxRSI: number; minScore: number };
  setScreenerFilter: (f: Partial<{ minRSI: number; maxRSI: number; minScore: number }>) => void;

  // ── Refresh timers
  refreshIntervals: Map<string, ReturnType<typeof setInterval>>;
  startRefreshTimer: (key: string, fn: () => void, interval: number) => void;
  stopRefreshTimer:  (key: string) => void;
  stopAllTimers:     () => void;

  // ── Loading states
  loading:          Record<string, boolean>;
  setLoading:       (key: string, value: boolean) => void;

  // ── Errors
  errors:           Record<string, string | null>;
  setError:         (key: string, msg: string | null) => void;

  // ── Snapshot
  isSnapshotting:   boolean;
  lastSnapshotAt?:  number;
  setSnapshotting:  (v: boolean) => void;
  setLastSnapshotAt: (ts: number) => void;

  // ── Computed (actions)
  computeEnrichedPositions: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useTerminalStore = create<TerminalState>((set, get) => ({
  // ── Config
  apiConfig: {
    finnhubKey:      import.meta.env.VITE_FINNHUB_KEY      ?? 'demo',
    polygonKey:      import.meta.env.VITE_POLYGON_KEY       ?? 'demo',
    alphaVantageKey: import.meta.env.VITE_ALPHAVANTAGE_KEY  ?? 'demo',
  },
  setApiConfig: (config) => set(s => ({ apiConfig: { ...s.apiConfig, ...config } })),

  // ── Positions
  positions: [
    // Positions démo par défaut
    { id: 1, ticker: 'AAPL',  name: 'Apple Inc.',          sector: 'Technology',    quantity: 50,  avgCost: 162.50, currency: 'USD', addedAt: '2023-06-15' },
    { id: 2, ticker: 'NVDA',  name: 'NVIDIA Corp.',         sector: 'Technology',    quantity: 20,  avgCost: 415.00, currency: 'USD', addedAt: '2023-08-10' },
    { id: 3, ticker: 'MSFT',  name: 'Microsoft Corp.',      sector: 'Technology',    quantity: 30,  avgCost: 320.00, currency: 'USD', addedAt: '2023-07-20' },
    { id: 4, ticker: 'JPM',   name: 'JPMorgan Chase',       sector: 'Finance',       quantity: 40,  avgCost: 152.00, currency: 'USD', addedAt: '2023-09-05' },
    { id: 5, ticker: 'XOM',   name: 'Exxon Mobil Corp.',    sector: 'Energy',        quantity: 60,  avgCost: 108.00, currency: 'USD', addedAt: '2023-05-12' },
    { id: 6, ticker: 'JNJ',   name: 'Johnson & Johnson',    sector: 'Healthcare',    quantity: 25,  avgCost: 158.00, currency: 'USD', addedAt: '2023-10-01' },
    { id: 7, ticker: 'AMZN',  name: 'Amazon.com Inc.',      sector: 'Consumer',      quantity: 15,  avgCost: 138.00, currency: 'USD', addedAt: '2023-11-15' },
    { id: 8, ticker: 'TSLA',  name: 'Tesla Inc.',           sector: 'Consumer',      quantity: 35,  avgCost: 235.00, currency: 'USD', addedAt: '2023-12-01' },
  ],
  enrichedPositions: [],

  addPosition: (p) => set(s => ({
    positions: [...s.positions, { ...p, id: Date.now() }],
  })),

  removePosition: (id) => set(s => ({
    positions: s.positions.filter(p => p.id !== id),
  })),

  updatePosition: (id, updates) => set(s => ({
    positions: s.positions.map(p => p.id === id ? { ...p, ...updates } : p),
  })),

  // ── Quotes
  quotes: new Map(),
  setQuote: (ticker, quote) => set(s => {
    const next = new Map(s.quotes);
    next.set(ticker, quote);
    return { quotes: next };
  }),
  setQuotes: (quotes) => set({ quotes }),

  // ── Focus
  focusedTicker: null,
  setFocusedTicker: (ticker) => set({ focusedTicker: ticker }),

  // ── Navigation
  activeScreen: 'portfolio',
  setActiveScreen: (s) => set({ activeScreen: s }),

  // ── News
  news: [],
  setNews: (items) => set({ news: items }),
  newsFilter: '',
  setNewsFilter: (f) => set({ newsFilter: f }),
  newsSectorFilter: null,
  setNewsSectorFilter: (s) => set({ newsSectorFilter: s }),

  // ── Market Activity
  marketActivity: [],
  setMarketActivity: (items) => set({ marketActivity: items }),
  activityView: 'table',
  setActivityView: (v) => set({ activityView: v }),

  // ── Macro
  macroIndicators: [],
  setMacroIndicators: (indicators) => set({ macroIndicators: indicators }),
  economicCalendar: [],
  setEconomicCalendar: (events) => set({ economicCalendar: events }),
  calendarFilter: 'all',
  setCalendarFilter: (f) => set({ calendarFilter: f }),
  setVIX: (vix) => set({ vix }),
  setDXY: (dxy) => set({ dxy }),

  // ── Screener
  screenerResults: [],
  setScreenerResults: (r) => set({ screenerResults: r }),
  screenerFilter: { minRSI: 0, maxRSI: 100, minScore: 60 },
  setScreenerFilter: (f) => set(s => ({ screenerFilter: { ...s.screenerFilter, ...f } })),

  // ── Timers
  refreshIntervals: new Map(),
  startRefreshTimer: (key, fn, interval) => {
    const { stopRefreshTimer } = get();
    stopRefreshTimer(key); // Annule l'ancien timer si existant
    fn(); // Exécution immédiate
    const timer = setInterval(fn, interval);
    set(s => {
      const next = new Map(s.refreshIntervals);
      next.set(key, timer);
      return { refreshIntervals: next };
    });
  },
  stopRefreshTimer: (key) => {
    const timer = get().refreshIntervals.get(key);
    if (timer) {
      clearInterval(timer);
      set(s => {
        const next = new Map(s.refreshIntervals);
        next.delete(key);
        return { refreshIntervals: next };
      });
    }
  },
  stopAllTimers: () => {
    const { refreshIntervals } = get();
    for (const timer of refreshIntervals.values()) clearInterval(timer);
    set({ refreshIntervals: new Map() });
  },

  // ── Loading
  loading: {},
  setLoading: (key, value) => set(s => ({ loading: { ...s.loading, [key]: value } })),

  // ── Errors
  errors: {},
  setError: (key, msg) => set(s => ({ errors: { ...s.errors, [key]: msg } })),

  // ── Snapshot
  isSnapshotting: false,
  setSnapshotting: (v) => set({ isSnapshotting: v }),
  setLastSnapshotAt: (ts) => set({ lastSnapshotAt: ts }),

  // ── Computed
  computeEnrichedPositions: () => {
    const { positions, quotes } = get();
    if (!quotes.size) return;

    // Calcul de la valeur totale du portfolio
    let totalValue = 0;
    for (const pos of positions) {
      const q = quotes.get(pos.ticker);
      if (q) totalValue += pos.quantity * q.price;
    }

    const enriched = positions
      .map(pos => {
        const quote = quotes.get(pos.ticker);
        if (!quote) return null;
        return enrichPosition(pos, quote, totalValue);
      })
      .filter((p): p is EnrichedPosition => p !== null);

    set({ enrichedPositions: enriched });
  },
}));

// ─── Selectors ────────────────────────────────────────────────────────────────

/** Sélecteur : tickers uniques du portfolio */
export const selectPortfolioTickers = (state: TerminalState) =>
  state.positions.map(p => p.ticker);

/** Sélecteur : métriques agrégées portfolio */
export const selectPortfolioMetrics = (state: TerminalState) =>
  calcPortfolioMetrics(state.enrichedPositions);

/** Sélecteur : news filtrées */
export const selectFilteredNews = (state: TerminalState) => {
  let items = state.news;
  if (state.newsFilter) {
    const q = state.newsFilter.toLowerCase();
    items = items.filter(n =>
      n.title.toLowerCase().includes(q) ||
      n.relatedTickers.some(t => t.toLowerCase().includes(q))
    );
  }
  if (state.newsSectorFilter) {
    items = items.filter(n => n.sector === state.newsSectorFilter);
  }
  if (state.focusedTicker) {
    // En Focus Mode : les news du ticker focusé en premier
    items = [
      ...items.filter(n => n.relatedTickers.includes(state.focusedTicker!)),
      ...items.filter(n => !n.relatedTickers.includes(state.focusedTicker!)),
    ];
  }
  return items;
};

/** Sélecteur : résultats screener filtrés */
export const selectFilteredScreener = (state: TerminalState) => {
  const { minRSI, maxRSI, minScore } = state.screenerFilter;
  return state.screenerResults
    .filter(r => {
      if (r.rsi < minRSI || r.rsi > maxRSI) return false;
      if (r.score < minScore) return false;
      return true;
    })
    .sort((a, b) => b.score - a.score);
};

export const REFRESH_INTERVALS = INTERVALS;
