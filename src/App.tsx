/**
 * ============================================================
 * APP ROOT — Tab navigation, ticker tape, global layout.
 * ============================================================
 */

import React, { useEffect } from "react";
import {
  BarChart2, Newspaper, Activity, Globe2, Zap, X, ChevronRight,
} from "lucide-react";
import { useTerminalStore } from "./store/useTerminalStore";
import { StatusBar }         from "./components/StatusBar";
import { Portfolio }         from "./screens/Portfolio";
import { NewsIntelligence }  from "./screens/NewsIntelligence";
import { MarketActivity }    from "./screens/MarketActivity";
import { MacroCalendar }     from "./screens/MacroCalendar";
import { Screener }          from "./screens/Screener";
import { usePersistPositions, useCacheNews } from "./hooks/useTauriDb";
import { formatPercent, colorClass } from "./utils/financialCalculations";
import { MARKET_UNIVERSE } from "./services/dataOrchestrator";

// ─── Tab config ───────────────────────────────────────────────

const TABS = [
  { label: "PORTFOLIO", icon: BarChart2, component: Portfolio,       shortcut: "1" },
  { label: "NEWS",      icon: Newspaper, component: NewsIntelligence, shortcut: "2" },
  { label: "MARKET",    icon: Activity,  component: MarketActivity,   shortcut: "3" },
  { label: "MACRO",     icon: Globe2,    component: MacroCalendar,    shortcut: "4" },
  { label: "SCREENER",  icon: Zap,       component: Screener,         shortcut: "5" },
];

// ─── Ticker Tape ─────────────────────────────────────────────

const TickerTape: React.FC = () => {
  const { quotes, setFocusedTicker } = useTerminalStore();
  const tickers = MARKET_UNIVERSE.filter((t) => quotes[t]);
  if (!tickers.length) return null;

  const items = [...tickers, ...tickers];

  return (
    <div className="h-6 bg-terminal-surface border-b border-terminal-border overflow-hidden relative flex items-center shrink-0">
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-terminal-surface to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-terminal-surface to-transparent z-10 pointer-events-none" />
      <div className="flex items-center animate-ticker whitespace-nowrap">
        {items.map((ticker, i) => {
          const q = quotes[ticker];
          if (!q) return null;
          return (
            <button
              key={`${ticker}-${i}`}
              onClick={() => setFocusedTicker(ticker)}
              className="inline-flex items-center gap-2 px-3 hover:bg-terminal-muted/30 transition-colors h-6"
            >
              <span className="text-2xs font-mono font-semibold text-terminal-text">{ticker}</span>
              <span className="text-2xs font-mono text-terminal-dim">{q.price.toFixed(2)}</span>
              <span className={`text-2xs font-mono font-semibold ${colorClass(q.changePercent)}`}>
                {formatPercent(q.changePercent)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─── Focus Banner ─────────────────────────────────────────────

const FocusBanner: React.FC = () => {
  const { focusedTicker, setFocusedTicker, quotes } = useTerminalStore();
  if (!focusedTicker) return null;
  const q = quotes[focusedTicker];

  return (
    <div className="flex items-center gap-2 px-4 py-1 bg-terminal-accent/5 border-b border-terminal-accent/20 text-xs font-mono shrink-0">
      <div className="w-1.5 h-1.5 rounded-full bg-terminal-accent animate-pulse" />
      <span className="text-terminal-accent font-semibold tracking-widest text-2xs">GLOBAL FOCUS</span>
      <span className="text-terminal-text font-bold">{focusedTicker}</span>
      {q && (
        <>
          <ChevronRight size={10} className="text-terminal-dim" />
          <span className="text-terminal-text">${q.price.toFixed(2)}</span>
          <span className={colorClass(q.changePercent)}>{formatPercent(q.changePercent)}</span>
          {q.name && <span className="text-terminal-dim text-2xs">· {q.name}</span>}
        </>
      )}
      <button onClick={() => setFocusedTicker(null)} className="ml-auto text-terminal-dim hover:text-terminal-text">
        <X size={11} />
      </button>
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────────

const App: React.FC = () => {
  const { activeTab, setActiveTab } = useTerminalStore();
  const ActiveScreen = TABS[activeTab].component;

  // Tauri DB sync
  usePersistPositions();
  useCacheNews();

  // Keyboard shortcuts: Cmd/Ctrl + 1-5 to switch tabs
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "5") {
        e.preventDefault();
        setActiveTab(parseInt(e.key) - 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-terminal-bg text-terminal-text overflow-hidden select-none">
      {/* ── Top Bar ── */}
      <div
        className="flex items-center border-b border-terminal-border bg-terminal-surface shrink-0"
        style={{ height: 38 }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 border-r border-terminal-border h-full">
          <div className="w-2 h-2 rounded-full bg-terminal-accent" />
          <span className="text-2xs font-mono font-bold tracking-[0.3em] text-terminal-accent uppercase">
            Terminal Pro
          </span>
        </div>

        {/* Tabs */}
        <nav className="flex items-center h-full flex-1">
          {TABS.map((tab, i) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.label}
                onClick={() => setActiveTab(i)}
                className={`flex items-center gap-1.5 h-full px-5 text-2xs font-mono tracking-[0.15em] transition-all border-b-2 relative
                  ${activeTab === i
                    ? "text-terminal-accent border-terminal-accent bg-terminal-accent/5"
                    : "text-terminal-dim border-transparent hover:text-terminal-text hover:bg-terminal-elevated"}`}
              >
                <Icon size={10} />
                {tab.label}
                <span className="ml-1 text-terminal-dim/40 text-2xs hidden xl:inline">⌘{tab.shortcut}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Ticker Tape ── */}
      <TickerTape />

      {/* ── Focus Banner ── */}
      <FocusBanner />

      {/* ── Main Content ── */}
      <div className="flex-1 min-h-0">
        <ActiveScreen />
      </div>

      {/* ── Status Bar ── */}
      <StatusBar />
    </div>
  );
};

export default App;
