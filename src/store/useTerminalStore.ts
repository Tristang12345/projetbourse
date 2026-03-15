/**
 * ============================================================
 * ZUSTAND TERMINAL STORE
 * ✅ Point 12 : Store splitté — UI state séparé des données métier
 * ✅ Point 6  : updatePosition avec champs editables (PRU, quantité, nom)
 * ============================================================
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  Position, PositionWithPnL, PivotQuote, PivotNewsItem,
  PivotMacroData, PivotScreenerSignal, PivotEconomicEvent, ApiStatus,
} from "../services/types";
import { calcPnL, calcPnLPercent, calcDayPnL, calcMarketValue } from "../utils/financialCalculations";

// ─── UI Store (non persisté) ──────────────────────────────────

interface UIState {
  activeTab:     number;
  setActiveTab:  (tab: number) => void;
  isLoading:     Record<string, boolean>;
  setLoading:    (key: string, val: boolean) => void;
  focusedTicker:     string | null;
  setFocusedTicker:  (ticker: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTab:    0,
  setActiveTab: (tab) => set({ activeTab: tab }),
  isLoading:    {},
  setLoading:   (key, val) =>
    set((s) => ({ isLoading: { ...s.isLoading, [key]: val } })),
  focusedTicker:    null,
  setFocusedTicker: (ticker) => set({ focusedTicker: ticker }),
}));

// ─── Terminal Store (données métier) ──────────────────────────

export interface TerminalState {
  // Portfolio
  positions:      Position[];
  addPosition:    (pos: Omit<Position, "id" | "addedAt">) => void;
  removePosition: (id: string) => void;
  updatePosition: (id: string, updates: Partial<Pick<Position, "name" | "sector" | "quantity" | "avgCost">>) => void;

  // Quotes
  quotes:    Record<string, PivotQuote>;
  setQuote:  (ticker: string, quote: PivotQuote) => void;
  setQuotes: (quotes: PivotQuote[]) => void;

  // Derived
  getPositionsWithPnL: () => PositionWithPnL[];

  // News
  news:    PivotNewsItem[];
  setNews: (news: PivotNewsItem[]) => void;

  // Macro
  macroData:    PivotMacroData | null;
  setMacroData: (data: PivotMacroData) => void;

  // Screener
  screenerSignals:    PivotScreenerSignal[];
  setScreenerSignals: (signals: PivotScreenerSignal[]) => void;

  // Calendar
  economicEvents:    PivotEconomicEvent[];
  setEconomicEvents: (events: PivotEconomicEvent[]) => void;

  // API Status
  apiStatus:    ApiStatus;
  setApiStatus: (status: Partial<ApiStatus>) => void;

  // Snapshot
  lastSnapshot: number | null;
  saveSnapshot: () => void;

  // Compat: these are kept so existing screens don't break
  // They delegate to useUIStore
  activeTab:        number;
  setActiveTab:     (tab: number) => void;
  isLoading:        Record<string, boolean>;
  setLoading:       (key: string, val: boolean) => void;
  focusedTicker:    string | null;
  setFocusedTicker: (ticker: string | null) => void;
}

export const useTerminalStore = create<TerminalState>()(
  persist(
    (set, get) => ({
      // ── Compat delegates ──
      get activeTab()        { return useUIStore.getState().activeTab; },
      get isLoading()        { return useUIStore.getState().isLoading; },
      get focusedTicker()    { return useUIStore.getState().focusedTicker; },
      setActiveTab:     (tab) => useUIStore.getState().setActiveTab(tab),
      setLoading:       (k, v) => useUIStore.getState().setLoading(k, v),
      setFocusedTicker: (t) => useUIStore.getState().setFocusedTicker(t),

      // ── Portfolio ──
      positions: [],

      addPosition: (pos) =>
        set((s) => ({
          positions: [
            ...s.positions,
            { ...pos, id: crypto.randomUUID(), addedAt: Date.now() },
          ],
        })),

      removePosition: (id) =>
        set((s) => ({ positions: s.positions.filter((p) => p.id !== id) })),

      /**
       * ✅ Point 6 — Édition de position (PRU, quantité, nom, secteur).
       * Le champ `id` et `ticker` ne peuvent pas être modifiés.
       */
      updatePosition: (id, updates) =>
        set((s) => ({
          positions: s.positions.map((p) =>
            p.id === id ? { ...p, ...updates } : p,
          ),
        })),

      // ── Quotes ──
      quotes: {},

      setQuote: (ticker, quote) =>
        set((s) => ({ quotes: { ...s.quotes, [ticker]: quote } })),

      setQuotes: (quotes) =>
        set((s) => {
          const updated = { ...s.quotes };
          quotes.forEach((q) => { updated[q.ticker] = q; });
          return { quotes: updated };
        }),

      // ── Derived P&L ──
      getPositionsWithPnL: () => {
        const { positions, quotes } = get();
        return positions.map((pos) => {
          const q      = quotes[pos.ticker];
          const price  = q?.price     ?? pos.avgCost;
          const prev   = q?.prevClose ?? pos.avgCost;
          const pnl    = calcPnL(price, pos.avgCost, pos.quantity);
          const pnlPct = calcPnLPercent(price, pos.avgCost);
          const dayPnL = calcDayPnL(price, prev, pos.quantity);
          const dayPct = prev > 0 ? ((price - prev) / prev) * 100 : 0;
          return {
            ...pos,
            currentPrice:  price,
            change:        q?.change        ?? 0,
            changePercent: q?.changePercent ?? 0,
            marketValue:   calcMarketValue(price, pos.quantity),
            pnl, pnlPercent: pnlPct,
            dayPnL, dayPnLPercent: dayPct,
            sparkline:  [],
            currency:   q?.currency  ?? "USD",
            open:       q?.open      ?? price,
            prevClose:  q?.prevClose ?? price,
          };
        });
      },

      // ── News ──
      news:    [],
      setNews: (news) => set({ news }),

      // ── Macro ──
      macroData:    null,
      setMacroData: (data) => set({ macroData: data }),

      // ── Screener ──
      screenerSignals:    [],
      setScreenerSignals: (signals) => set({ screenerSignals: signals }),

      // ── Calendar ──
      economicEvents:    [],
      setEconomicEvents: (events) => set({ economicEvents: events }),

      // ── API Status ──
      apiStatus: { finnhub: "idle", polygon: "idle", alphavantage: "idle", lastUpdated: 0 },
      setApiStatus: (status) =>
        set((s) => ({ apiStatus: { ...s.apiStatus, ...status, lastUpdated: Date.now() } })),

      // ── Snapshot ──
      lastSnapshot: null,
      saveSnapshot: () => set({ lastSnapshot: Date.now() }),
    }),
    {
      name:    "bloomberg-terminal-state",
      version: 4,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        positions:    s.positions,
        lastSnapshot: s.lastSnapshot,
      }),
      migrate: (persisted: any, version: number) => {
        if (version < 4) {
          return {
            ...persisted,
            positions: (persisted.positions ?? []).map((p: any) => ({
              id:       p.id       ?? crypto.randomUUID(),
              ticker:   p.ticker   ?? "",
              name:     p.name     ?? p.ticker ?? "",
              sector:   p.sector   ?? "Unknown",
              quantity: p.quantity ?? 0,
              avgCost:  p.avgCost  ?? p.avg_cost ?? 0,
              addedAt:  p.addedAt  ?? p.added_at ?? Date.now(),
            })),
          };
        }
        return persisted;
      },
    },
  ),
);
