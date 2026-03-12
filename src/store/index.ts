// ============================================================
// ZUSTAND STORE — Centralized reactive state
// ============================================================
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
  Position, QuoteSnapshot, NewsItem, EconomicEvent, MacroIndicator,
  TechnicalSignal, PortfolioSummary, FocusTicker, ScreenId, ViewMode,
  AppSettings, MarketSnapshot, SparkPoint,
} from "@/types";
import { computePortfolioSummary, computePositionPL } from "@/lib/financialCalc";

interface PortfolioState { positions: Position[]; quotes: Record<string, QuoteSnapshot>; sparks: Record<string, SparkPoint[]>; summary: PortfolioSummary | null; isLoading: boolean; lastUpdate: number; }
interface NewsState { items: NewsItem[]; isLoading: boolean; filter: "all" | "portfolio"; sectorFilter: string | null; lastUpdate: number; }
interface MarketState { quotes: Record<string, QuoteSnapshot>; viewMode: ViewMode; isLoading: boolean; watchlist: string[]; lastUpdate: number; }
interface MacroState { indicators: MacroIndicator[]; calendar: EconomicEvent[]; calendarFilter: "all" | "high" | "medium"; isLoading: boolean; lastUpdate: number; }
interface ScreenerState { signals: TechnicalSignal[]; isLoading: boolean; filterRSIOversold: boolean; filterRSIOverbought: boolean; filterGoldenCross: boolean; filterVolumeBreakout: boolean; lastUpdate: number; }

interface AppActions {
  settings: AppSettings; updateSettings: (s: Partial<AppSettings>) => void;
  activeScreen: ScreenId; setActiveScreen: (s: ScreenId) => void;
  focusTicker: FocusTicker | null; setFocusTicker: (ticker: string, source: ScreenId) => void; clearFocus: () => void;
  portfolio: PortfolioState; addPosition: (p: Omit<Position, "id">) => void; removePosition: (id: string) => void;
  updateQuotes: (q: Record<string, QuoteSnapshot>) => void; updateSparks: (s: Record<string, SparkPoint[]>) => void; recomputePortfolio: () => void;
  news: NewsState; setNewsItems: (items: NewsItem[]) => void; setNewsFilter: (f: "all" | "portfolio") => void; setNewsSectorFilter: (s: string | null) => void;
  market: MarketState; setMarketQuotes: (q: Record<string, QuoteSnapshot>) => void; setMarketViewMode: (m: ViewMode) => void; addToWatchlist: (ticker: string) => void; removeFromWatchlist: (ticker: string) => void;
  macro: MacroState; setMacroIndicators: (i: MacroIndicator[]) => void; setCalendarEvents: (e: EconomicEvent[]) => void; setCalendarFilter: (f: "all" | "high" | "medium") => void;
  screener: ScreenerState; setScreenerSignals: (s: TechnicalSignal[]) => void;
  toggleScreenerFilter: (f: "filterRSIOversold"|"filterRSIOverbought"|"filterGoldenCross"|"filterVolumeBreakout") => void;
  snapshots: MarketSnapshot[]; saveSnapshot: (label: string) => void; loadSnapshot: (id: string) => void;
}

const DEFAULT_WATCHLIST = ["SPY","QQQ","AAPL","MSFT","NVDA","TSLA","AMZN","META","GOOGL","JPM","XOM","UNH"];
const DEFAULT_SETTINGS: AppSettings = {
  refreshIntervalFast: 15_000, refreshIntervalSlow: 300_000,
  apiKeys: { finnhub: import.meta.env.VITE_FINNHUB_KEY || "", polygon: import.meta.env.VITE_POLYGON_KEY || "", alphavantage: import.meta.env.VITE_ALPHAVANTAGE_KEY || "" },
  theme: "dark", defaultScreen: "portfolio",
};
const DEMO_POSITIONS: Position[] = [
  { id: "1", ticker: "AAPL",  name: "Apple Inc.",          sector: "Technology",  quantity: 50, avgCost: 165.00, addedAt: "2024-01-15" },
  { id: "2", ticker: "MSFT",  name: "Microsoft Corp.",     sector: "Technology",  quantity: 30, avgCost: 380.00, addedAt: "2024-02-01" },
  { id: "3", ticker: "NVDA",  name: "NVIDIA Corp.",        sector: "Technology",  quantity: 20, avgCost: 485.00, addedAt: "2024-03-10" },
  { id: "4", ticker: "JPM",   name: "JPMorgan Chase",      sector: "Financials",  quantity: 40, avgCost: 190.00, addedAt: "2024-01-20" },
  { id: "5", ticker: "XOM",   name: "Exxon Mobil",         sector: "Energy",      quantity: 60, avgCost: 105.00, addedAt: "2024-02-15" },
  { id: "6", ticker: "AMZN",  name: "Amazon.com Inc.",     sector: "Consumer",    quantity: 25, avgCost: 175.00, addedAt: "2024-03-01" },
  { id: "7", ticker: "UNH",   name: "UnitedHealth Group",  sector: "Healthcare",  quantity: 15, avgCost: 520.00, addedAt: "2024-01-30" },
  { id: "8", ticker: "JNJ",   name: "Johnson & Johnson",   sector: "Healthcare",  quantity: 35, avgCost: 155.00, addedAt: "2024-02-20" },
];

export const useTerminalStore = create<AppActions>()(
  subscribeWithSelector((set, get) => ({
    settings: DEFAULT_SETTINGS, updateSettings: (s) => set((state) => ({ settings: { ...state.settings, ...s } })),
    activeScreen: "portfolio", setActiveScreen: (s) => set({ activeScreen: s }),
    focusTicker: null, setFocusTicker: (ticker, source) => set({ focusTicker: { ticker, source, timestamp: Date.now() } }), clearFocus: () => set({ focusTicker: null }),
    portfolio: { positions: DEMO_POSITIONS, quotes: {}, sparks: {}, summary: null, isLoading: false, lastUpdate: 0 },
    addPosition: (p) => { const id = crypto.randomUUID(); set((state) => ({ portfolio: { ...state.portfolio, positions: [...state.portfolio.positions, { ...p, id }] } })); },
    removePosition: (id) => set((state) => ({ portfolio: { ...state.portfolio, positions: state.portfolio.positions.filter((p) => p.id !== id) } })),
    updateQuotes: (q) => { set((state) => ({ portfolio: { ...state.portfolio, quotes: { ...state.portfolio.quotes, ...q }, lastUpdate: Date.now() } })); get().recomputePortfolio(); },
    updateSparks: (s) => set((state) => ({ portfolio: { ...state.portfolio, sparks: { ...state.portfolio.sparks, ...s } } })),
    recomputePortfolio: () => { const { positions, quotes } = get().portfolio; const summary = computePortfolioSummary(positions.map((p) => ({ ...p, quote: quotes[p.ticker] }))); set((state) => ({ portfolio: { ...state.portfolio, summary } })); },
    news: { items: [], isLoading: false, filter: "portfolio", sectorFilter: null, lastUpdate: 0 },
    setNewsItems: (items) => set((state) => ({ news: { ...state.news, items, lastUpdate: Date.now() } })),
    setNewsFilter: (f) => set((state) => ({ news: { ...state.news, filter: f } })),
    setNewsSectorFilter: (s) => set((state) => ({ news: { ...state.news, sectorFilter: s } })),
    market: { quotes: {}, viewMode: "table", isLoading: false, watchlist: DEFAULT_WATCHLIST, lastUpdate: 0 },
    setMarketQuotes: (q) => set((state) => ({ market: { ...state.market, quotes: { ...state.market.quotes, ...q }, lastUpdate: Date.now() } })),
    setMarketViewMode: (m) => set((state) => ({ market: { ...state.market, viewMode: m } })),
    addToWatchlist: (ticker) => set((state) => ({ market: { ...state.market, watchlist: state.market.watchlist.includes(ticker) ? state.market.watchlist : [...state.market.watchlist, ticker] } })),
    removeFromWatchlist: (ticker) => set((state) => ({ market: { ...state.market, watchlist: state.market.watchlist.filter((t) => t !== ticker) } })),
    macro: { indicators: [], calendar: [], calendarFilter: "all", isLoading: false, lastUpdate: 0 },
    setMacroIndicators: (i) => set((state) => ({ macro: { ...state.macro, indicators: i, lastUpdate: Date.now() } })),
    setCalendarEvents: (e) => set((state) => ({ macro: { ...state.macro, calendar: e } })),
    setCalendarFilter: (f) => set((state) => ({ macro: { ...state.macro, calendarFilter: f } })),
    screener: { signals: [], isLoading: false, filterRSIOversold: false, filterRSIOverbought: false, filterGoldenCross: false, filterVolumeBreakout: false, lastUpdate: 0 },
    setScreenerSignals: (s) => set((state) => ({ screener: { ...state.screener, signals: s, lastUpdate: Date.now() } })),
    toggleScreenerFilter: (f) => set((state) => ({ screener: { ...state.screener, [f]: !state.screener[f] } })),
    snapshots: [], saveSnapshot: (label) => { const { portfolio, market, macro } = get(); set((state) => ({ snapshots: [{ id: crypto.randomUUID(), label, createdAt: new Date().toISOString(), data: JSON.stringify({ portfolio, market, macro }) }, ...state.snapshots].slice(0, 20) })); },
    loadSnapshot: (_id) => console.info("Load snapshot:", _id),
  }))
);

export const selectPortfolioTickers = (s: AppActions): string[] => s.portfolio.positions.map((p) => p.ticker);
export const selectPositionsWithPL = (s: AppActions) => s.portfolio.positions.map((p) => computePositionPL(p, s.portfolio.quotes[p.ticker]));
