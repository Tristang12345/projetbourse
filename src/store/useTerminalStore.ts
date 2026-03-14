/**
 * ============================================================
 * ZUSTAND TERMINAL STORE
 * Single source of truth for the entire application state.
 * All screens subscribe to slices of this store.
 * ============================================================
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  Position, PositionWithPnL, PivotQuote, PivotNewsItem,
  PivotMacroData, PivotScreenerSignal, PivotEconomicEvent,
  ApiStatus,
} from "../services/types";
import {
  calcPnL, calcPnLPercent, calcDayPnL, calcMarketValue,
} from "../utils/financialCalculations";

// ─── State Shape ──────────────────────────────────────────────

export interface TerminalState {
  // ── Active ticker (Global Focus Mode) ──
  focusedTicker: string | null;
  setFocusedTicker: (ticker: string | null) => void;

  // ── Portfolio ──
  positions: Position[];
  addPosition:    (pos: Omit<Position, "id" | "addedAt">) => void;
  removePosition: (id: string) => void;
  updatePosition: (id: string, updates: Partial<Position>) => void;

  // ── Live Quotes (keyed by ticker) ──
  quotes: Record<string, PivotQuote>;
  setQuote:  (ticker: string, quote: PivotQuote) => void;
  setQuotes: (quotes: PivotQuote[]) => void;

  // ── Derived: positions with live P&L ──
  getPositionsWithPnL: () => PositionWithPnL[];

  // ── News ──
  news:    PivotNewsItem[];
  setNews: (news: PivotNewsItem[]) => void;

  // ── Macro ──
  macroData:    PivotMacroData | null;
  setMacroData: (data: PivotMacroData) => void;

  // ── Screener Signals ──
  screenerSignals:    PivotScreenerSignal[];
  setScreenerSignals: (signals: PivotScreenerSignal[]) => void;

  // ── Economic Calendar ──
  economicEvents:    PivotEconomicEvent[];
  setEconomicEvents: (events: PivotEconomicEvent[]) => void;

  // ── API Status ──
  apiStatus:    ApiStatus;
  setApiStatus: (status: Partial<ApiStatus>) => void;

  // ── UI State ──
  activeTab:    number;
  setActiveTab: (tab: number) => void;
  isLoading:    Record<string, boolean>;
  setLoading:   (key: string, val: boolean) => void;

  // ── Snapshot ──
  lastSnapshot:    number | null;
  saveSnapshot:    () => void;
}

// ─── Store Implementation ─────────────────────────────────────

export const useTerminalStore = create<TerminalState>()(
  persist(
    (set, get) => ({
      // ── Focus ──
      focusedTicker: null,
      setFocusedTicker: (ticker) => set({ focusedTicker: ticker }),

      // ── Portfolio — vide au démarrage, hydraté depuis localStorage / SQLite ──
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
          const q       = quotes[pos.ticker];
          const price   = q?.price     ?? pos.avgCost;
          const prev    = q?.prevClose ?? pos.avgCost;
          const pnl     = calcPnL(price, pos.avgCost, pos.quantity);
          const pnlPct  = calcPnLPercent(price, pos.avgCost);
          const dayPnL  = calcDayPnL(price, prev, pos.quantity);
          const dayPct  = prev > 0 ? ((price - prev) / prev) * 100 : 0;
          const mktVal  = calcMarketValue(price, pos.quantity);

          return {
            ...pos,
            currentPrice:  price,
            change:        q?.change        ?? 0,
            changePercent: q?.changePercent ?? 0,
            marketValue:   mktVal,
            pnl,
            pnlPercent:    pnlPct,
            dayPnL,
            dayPnLPercent: dayPct,
            sparkline:     [],              // populated by Portfolio screen
            currency:      q?.currency      ?? "USD",
            open:          q?.open          ?? price,
            prevClose:     q?.prevClose     ?? price,
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
      apiStatus: {
        finnhub:      "idle",
        polygon:      "idle",
        alphavantage: "idle",
        lastUpdated:  0,
      },
      setApiStatus: (status) =>
        set((s) => ({
          apiStatus: { ...s.apiStatus, ...status, lastUpdated: Date.now() },
        })),

      // ── UI ──
      activeTab: 0,
      setActiveTab: (tab) => set({ activeTab: tab }),
      isLoading: {},
      setLoading: (key, val) =>
        set((s) => ({ isLoading: { ...s.isLoading, [key]: val } })),

      // ── Snapshot ──
      lastSnapshot: null,
      saveSnapshot: () => set({ lastSnapshot: Date.now() }),
    }),
    {
      name:    "bloomberg-terminal-state",
      version: 3,  // bump when Position shape changes to trigger migration
      storage: createJSONStorage(() => localStorage),
      // Only persist positions & settings; not live data
      partialize: (s) => ({
        positions:     s.positions,
        activeTab:     s.activeTab,
        lastSnapshot:  s.lastSnapshot,
        focusedTicker: s.focusedTicker,
      }),
      // Migration: si le format stocké est d'une version antérieure,
      // on conserve les positions (champs de base) et on purge le reste
      migrate: (persisted: any, version: number) => {
        if (version < 3) {
          return {
            ...persisted,
            // Garantit que les positions ont bien les champs obligatoires
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
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error("[Store] Échec de rehydratation localStorage:", error);
          return;
        }
        // Zustand v4 : on ne peut pas muter state directement ici.
        // On utilise setState via un microtask après la fin de l'hydratation.
        // Premier lancement ou data loss → pré-remplir avec BNP.PA
        if (state && state.positions.length === 0) {
          Promise.resolve().then(() => {
            // Vérifie à nouveau (double-check) pour éviter les races
            const current = useTerminalStore.getState();
            if (current.positions.length === 0) {
              useTerminalStore.setState({
                positions: [
                  {
                    id:       "bnp-default-1",
                    ticker:   "BNP.PA",
                    name:     "BNP Paribas",
                    sector:   "Finance",
                    quantity: 50,
                    avgCost:  95.21,
                    addedAt:  Date.now(),
                  },
                ],
              });
            }
          });
        }
      },
    },
  ),
);
