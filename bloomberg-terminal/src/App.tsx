// ============================================================
// ROOT APP — Tab navigation + layout
// ============================================================
import { useEffect } from "react";
import clsx from "clsx";
import { useTerminalStore } from "@/store";
import { PortfolioScreen } from "@/screens/Portfolio";
import { NewsScreen } from "@/screens/NewsIntelligence";
import { MarketScreen } from "@/screens/MarketActivity";
import { MacroScreen } from "@/screens/MacroCalendar";
import { ScreenerScreen } from "@/screens/Screener";
import { StatusBar } from "@/components/StatusBar";
import { TickerTape } from "@/components/TickerTape";
import { getApiService } from "@/services/apiService";
import type { ScreenId } from "@/types";

const TABS: { id: ScreenId; label: string; icon: string; shortcut: string }[] = [
  { id: "portfolio", label: "PORTFOLIO", icon: "◈", shortcut: "1" },
  { id: "news",      label: "NEWS INTEL", icon: "◉", shortcut: "2" },
  { id: "market",    label: "MARKET",     icon: "◧", shortcut: "3" },
  { id: "macro",     label: "MACRO",      icon: "◆", shortcut: "4" },
  { id: "screener",  label: "SCREENER",   icon: "◌", shortcut: "5" },
];

export default function App() {
  const { activeScreen, setActiveScreen, market, setMarketQuotes, portfolio, focusTicker, clearFocus, settings } = useTerminalStore();
  const api = getApiService();

  // Bootstrap market data
  useEffect(() => {
    const fetchMarket = async () => {
      const watchlistQuotes = await api.fetchQuotes(market.watchlist);
      setMarketQuotes(watchlistQuotes);
    };
    fetchMarket();
    const interval = setInterval(fetchMarket, settings.refreshIntervalFast);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      const tab = TABS.find((t) => t.shortcut === e.key);
      if (tab) setActiveScreen(tab.id);
      if (e.key === "Escape") clearFocus();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const SCREENS = {
    portfolio: <PortfolioScreen />,
    news: <NewsScreen />,
    market: <MarketScreen />,
    macro: <MacroScreen />,
    screener: <ScreenerScreen />,
  };

  return (
    <div className="h-screen flex flex-col bg-terminal-bg text-white overflow-hidden select-none">
      {/* Header */}
      <div className="flex items-center border-b border-terminal-border bg-terminal-surface shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-r border-terminal-border">
          <div className="w-5 h-5 bg-brand-amber rounded-sm flex items-center justify-center">
            <span className="text-black font-mono font-black text-xs">T</span>
          </div>
          <span className="font-mono font-bold text-white text-sm tracking-widest">TERMINAL</span>
          <span className="text-2xs font-mono text-gray-600">v1.0</span>
        </div>

        {/* Tabs */}
        <div className="flex items-stretch flex-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveScreen(tab.id)}
              className={clsx(
                "flex items-center gap-2 px-4 py-2.5 text-2xs font-mono font-semibold uppercase tracking-widest transition-colors border-r border-terminal-border",
                activeScreen === tab.id
                  ? "bg-terminal-accent text-brand-cyan border-b-2 border-b-brand-cyan -mb-px"
                  : "text-gray-500 hover:text-white hover:bg-terminal-hover"
              )}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              <span className={clsx("text-2xs opacity-40", activeScreen === tab.id && "opacity-60")}>
                [{tab.shortcut}]
              </span>
            </button>
          ))}
        </div>

        {/* Focus indicator */}
        {focusTicker && (
          <div className="flex items-center gap-2 px-4 py-2.5 border-l border-terminal-border bg-brand-amber/5">
            <span className="text-2xs font-mono text-gray-500">FOCUS</span>
            <span className="font-mono font-bold text-brand-amber">{focusTicker.ticker}</span>
            <button onClick={clearFocus} className="text-gray-600 hover:text-gray-300 text-xs ml-1">✕</button>
          </div>
        )}

        {/* Portfolio summary pill */}
        {portfolio.summary && (
          <div className="flex items-center gap-3 px-4 py-2.5 border-l border-terminal-border">
            <div className="text-right">
              <div className="text-2xs font-mono text-gray-500">DAY P&L</div>
              <div className={clsx("text-xs font-mono font-bold tabular-nums", portfolio.summary.dayPL >= 0 ? "text-pos" : "text-neg")}>
                {portfolio.summary.dayPL >= 0 ? "+" : ""}${Math.abs(portfolio.summary.dayPL).toFixed(0)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Ticker tape */}
      <TickerTape />

      {/* Main content */}
      <div className="flex-1 overflow-hidden animate-fade-in">
        {SCREENS[activeScreen]}
      </div>

      {/* Status bar */}
      <StatusBar />
    </div>
  );
}
