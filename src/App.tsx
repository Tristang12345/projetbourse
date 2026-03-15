/**
 * ============================================================
 * APP ROOT
 * ✅ Point 5  : Persistance Tauri câblée (usePersistPositions utilisé)
 * ✅ Point 7  : Ticker tape sur tous les onglets
 * ✅ Point 10 : useApiKeys branché (clés chargées au démarrage)
 * ✅ Point 15 : Alertes prix → notification Tauri native
 * + WebSocket Finnhub pour prix US temps réel
 * + Onglet Settings pour saisie sécurisée des clés API
 * ============================================================
 */

import React, { useEffect } from "react";
import {
  BarChart2, Newspaper, Activity, Globe2, Zap, X,
  ChevronRight, WifiOff, Bell, FlaskConical, Settings as SettingsIcon,
} from "lucide-react";
import { useTerminalStore }   from "./store/useTerminalStore";
import { StatusBar }          from "./components/StatusBar";
import { Portfolio }          from "./screens/Portfolio";
import { NewsIntelligence }   from "./screens/NewsIntelligence";
import { MarketActivity }     from "./screens/MarketActivity";
import { MacroCalendar }      from "./screens/MacroCalendar";
import { Screener }           from "./screens/Screener";
import { Settings }           from "./screens/Settings";
import { usePersistPositions, useCacheNews } from "./hooks/useTauriDb";
import { useConnectionState } from "./hooks/useConnectionState";
import { useAlertStore }      from "./store/useAlertStore";
import { useRealtimePrices }  from "./hooks/useWebSocket";
import { ErrorBoundary }      from "./components/ErrorBoundary";
import { formatPercent, colorClass, formatPrice } from "./utils/financialCalculations";
import { MARKET_UNIVERSE }    from "./services/dataOrchestrator";

// ─── Tab config ───────────────────────────────────────────────

const TABS = [
  { label: "PORTFOLIO", icon: BarChart2,      component: Portfolio,       shortcut: "1" },
  { label: "NEWS",      icon: Newspaper,      component: NewsIntelligence, shortcut: "2" },
  { label: "MARKET",    icon: Activity,       component: MarketActivity,   shortcut: "3" },
  { label: "MACRO",     icon: Globe2,         component: MacroCalendar,    shortcut: "4" },
  { label: "SCREENER",  icon: Zap,            component: Screener,         shortcut: "5" },
  { label: "SETTINGS",  icon: SettingsIcon,   component: Settings,         shortcut: "6" },
];

// ─── Ticker Tape — affiché sur tous les onglets ───────────────

const TickerTape: React.FC = () => {
  const { quotes, setFocusedTicker, positions } = useTerminalStore();

  // Combine tickers portfolio + universe S&P pour la tape
  const portfolioTickers = positions.map((p) => p.ticker);
  const allTickers = [...new Set([...portfolioTickers, ...MARKET_UNIVERSE])].filter((t) => quotes[t]);
  if (!allTickers.length) return null;

  const items = [...allTickers, ...allTickers];

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
              <span className="text-2xs font-mono font-semibold text-terminal-text">
                {ticker.replace(/\.[A-Z]+$/, "")}
              </span>
              <span className="text-2xs font-mono text-terminal-dim">
                {formatPrice(q.price, q.currency)}
              </span>
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
          <span className="text-terminal-text">{formatPrice(q.price, q.currency)}</span>
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

// ─── Alert Toast ─────────────────────────────────────────────

const AlertToast: React.FC = () => {
  const { alerts, dismissAlert } = useAlertStore();
  const { quotes } = useTerminalStore();

  // Vérifier les alertes à chaque changement de prix
  React.useEffect(() => {
    const prices: Record<string, number> = {};
    Object.entries(quotes).forEach(([t, q]) => { prices[t] = q.price; });
    useAlertStore.getState().checkAlerts(prices);
  }, [quotes]);

  const triggered = alerts.filter((a) => a.status === "triggered");
  if (!triggered.length) return null;

  return (
    <div className="fixed bottom-8 right-4 flex flex-col gap-2 z-50">
      {triggered.slice(0, 3).map((alert) => (
        <div key={alert.id}
          className="flex items-center gap-3 bg-terminal-elevated border border-warn/40 rounded-lg px-4 py-2.5 shadow-panel animate-slide-up">
          <Bell size={12} className="text-warn" />
          <div className="font-mono">
            <span className="text-sm font-bold text-terminal-text">{alert.ticker}</span>
            <span className="text-xs text-terminal-dim ml-2">
              {alert.direction === "above" ? "≥" : "≤"} {alert.targetPrice.toFixed(2)}
            </span>
            {alert.note && <span className="text-2xs text-terminal-dim block">{alert.note}</span>}
          </div>
          <button onClick={() => dismissAlert(alert.id)} className="ml-2 text-terminal-dim hover:text-terminal-text">
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  );
};

// ─── Offline Banner ───────────────────────────────────────────

const ConnectionBanner: React.FC = () => {
  const { status } = useConnectionState();
  if (status !== "offline") return null;
  return (
    <div className="flex items-center gap-2 px-4 py-1 text-2xs font-mono shrink-0 border-b bg-down/5 border-down/20 text-down">
      <WifiOff size={10} /> HORS LIGNE — données en cache
    </div>
  );
};

// ─── Hook WebSocket — prix temps réel ────────────────────────

const RealtimePricesProvider: React.FC = () => {
  const { positions } = useTerminalStore();
  const tickers = positions.map((p) => p.ticker);
  useRealtimePrices(tickers);
  return null;
};

// ─── Main App ─────────────────────────────────────────────────

const App: React.FC = () => {
  const { activeTab, setActiveTab } = useTerminalStore();
  const ActiveScreen = TABS[activeTab].component;

  // ✅ Point 5 : Persistance Tauri — positions synchro SQLite ↔ Zustand
  usePersistPositions();
  useCacheNews();

  // Keyboard shortcuts Cmd/Ctrl + 1-6
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "6") {
        e.preventDefault();
        setActiveTab(parseInt(e.key) - 1);
      }
      // Escape = quitter le focus
      if (e.key === "Escape") {
        useTerminalStore.getState().setFocusedTicker(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-terminal-bg text-terminal-text overflow-hidden select-none">

      {/* ── WebSocket provider (invisible) ── */}
      <RealtimePricesProvider />

      {/* ── Banners ── */}
      <ConnectionBanner />
      <AlertToast />

      {/* ── Top Bar ── */}
      <div className="flex items-center border-b border-terminal-border bg-terminal-surface shrink-0" style={{ height: 38 }}>
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 border-r border-terminal-border h-full">
          <div className="w-2 h-2 rounded-full bg-terminal-accent" />
          <span className="text-2xs font-mono font-bold tracking-[0.3em] text-terminal-accent uppercase">Terminal Pro</span>
        </div>

        {/* Tabs */}
        <nav className="flex items-center h-full flex-1">
          {TABS.map((tab, i) => {
            const Icon = tab.icon;
            const isSettings = tab.label === "SETTINGS";
            return (
              <button
                key={tab.label}
                onClick={() => setActiveTab(i)}
                className={`flex items-center gap-1.5 h-full px-4 text-2xs font-mono tracking-[0.15em] transition-all border-b-2 relative
                  ${isSettings ? "ml-auto border-r-0 border-l border-terminal-border" : ""}
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

      {/* ── Ticker Tape (tous les onglets) ── */}
      <TickerTape />

      {/* ── Focus Banner ── */}
      <FocusBanner />

      {/* ── Main Content ── */}
      <div className="flex-1 min-h-0">
        <ErrorBoundary screenName={TABS[activeTab].label}>
          <ActiveScreen />
        </ErrorBoundary>
      </div>

      {/* ── Status Bar ── */}
      <StatusBar />
    </div>
  );
};

export default App;
