/**
 * ============================================================
 * SCREEN 5 — MATHEMATICAL SCREENER
 * Auto-detects: RSI signals (30/70), MA crossovers (50/200),
 * Volume breakouts. Sortable by strength, signal type.
 * ============================================================
 */

import React, { useState } from "react";
import {
  Zap, RefreshCw, Search, TrendingUp, TrendingDown,
  Volume2, ArrowLeftRight, Filter,
} from "lucide-react";
import { useTerminalStore } from "../store/useTerminalStore";
import { useScreenerRefresh } from "../hooks/useDataRefresh";
import { MARKET_UNIVERSE } from "../services/dataOrchestrator";
import { formatPercent, colorClass, rsiColorClass } from "../utils/financialCalculations";
import type { PivotScreenerSignal, SignalType } from "../services/types";

// ─── Signal config ────────────────────────────────────────────

const SIGNAL_META: Record<SignalType, {
  label:    string;
  icon:     React.FC<any>;
  color:    string;
  bgColor:  string;
}> = {
  RSI_OVERSOLD:    { label: "RSI Oversold",    icon: TrendingUp,   color: "text-up",   bgColor: "bg-up/10 border-up/30"   },
  RSI_OVERBOUGHT:  { label: "RSI Overbought",  icon: TrendingDown, color: "text-down", bgColor: "bg-down/10 border-down/30" },
  GOLDEN_CROSS:    { label: "Golden Cross",    icon: Zap,          color: "text-warn", bgColor: "bg-warn/10 border-warn/30" },
  DEATH_CROSS:     { label: "Death Cross",     icon: Zap,          color: "text-down", bgColor: "bg-down/10 border-down/30" },
  VOLUME_BREAKOUT: { label: "Volume Breakout", icon: Volume2,      color: "text-terminal-accent", bgColor: "bg-terminal-accent/10 border-terminal-accent/30" },
  PRICE_BREAKOUT:  { label: "Price Breakout",  icon: ArrowLeftRight, color: "text-warn", bgColor: "bg-warn/10 border-warn/30" },
};

const STRENGTH_ORDER = { strong: 0, moderate: 1, weak: 2 };
const STRENGTH_STYLE = {
  strong:   "text-up border-up/40 bg-up/5",
  moderate: "text-warn border-warn/40 bg-warn/5",
  weak:     "text-terminal-dim border-terminal-border bg-terminal-surface",
};

// ─── Signal Card ──────────────────────────────────────────────

const SignalCard: React.FC<{
  signal:    PivotScreenerSignal;
  onFocus:   (t: string) => void;
  isFocused: boolean;
}> = ({ signal, onFocus, isFocused }) => {
  const meta = SIGNAL_META[signal.signal];
  const Icon = meta.icon;
  const rsi  = signal.indicators.rsi14;

  return (
    <div
      onClick={() => onFocus(signal.ticker)}
      className={`border rounded-md p-4 cursor-pointer transition-all hover:border-terminal-muted animate-slide-up
        ${isFocused ? "ring-1 ring-terminal-accent bg-terminal-accent/5 border-terminal-accent/40" : "border-terminal-border bg-terminal-elevated"}`}
    >
      {/* Row 1: Signal badge + strength */}
      <div className="flex items-center justify-between mb-3">
        <div className={`flex items-center gap-1.5 text-2xs font-mono border px-2 py-1 rounded-sm ${meta.bgColor}`}>
          <Icon size={10} className={meta.color} />
          <span className={meta.color}>{meta.label}</span>
        </div>
        <span className={`text-2xs font-mono border px-1.5 py-0.5 rounded-sm ${STRENGTH_STYLE[signal.strength]}`}>
          {signal.strength.toUpperCase()}
        </span>
      </div>

      {/* Row 2: Ticker + Price */}
      <div className="flex items-end justify-between mb-2">
        <div>
          <div className="text-base font-mono font-bold text-terminal-text">{signal.ticker}</div>
          <div className="text-xs text-terminal-dim truncate max-w-[160px]">{signal.name}</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-mono font-semibold text-terminal-text">
            ${signal.price.toFixed(2)}
          </div>
          <div className={`text-xs font-mono ${colorClass(signal.changePercent)}`}>
            {formatPercent(signal.changePercent)}
          </div>
        </div>
      </div>

      {/* Row 3: Indicator details */}
      <div className="bg-terminal-surface/60 rounded px-3 py-2 mt-2">
        <p className="text-2xs font-mono text-terminal-dim">{signal.details}</p>
        {rsi !== null && (
          <div className="flex items-center gap-4 mt-1.5">
            <span className="text-2xs font-mono text-terminal-dim">RSI(14)</span>
            <div className="flex-1 h-1 bg-terminal-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width:      `${Math.min(Math.max(rsi, 0), 100)}%`,
                  background: rsi <= 30 ? "#00e676" : rsi >= 70 ? "#ff1744" : "#1a9fff",
                }}
              />
            </div>
            <span className={`text-2xs font-mono font-semibold ${rsiColorClass(rsi)}`}>
              {rsi.toFixed(1)}
            </span>
          </div>
        )}
        {signal.indicators.sma50 !== null && signal.indicators.sma200 !== null && (
          <div className="flex items-center gap-3 mt-1">
            <span className="text-2xs font-mono text-terminal-dim">
              SMA50 <span className="text-terminal-text">${signal.indicators.sma50?.toFixed(2)}</span>
            </span>
            <span className="text-2xs font-mono text-terminal-dim">
              SMA200 <span className="text-terminal-text">${signal.indicators.sma200?.toFixed(2)}</span>
            </span>
          </div>
        )}
        {signal.indicators.volumeRatio !== null && (
          <div className="mt-1">
            <span className="text-2xs font-mono text-terminal-dim">
              Vol Ratio: <span className={signal.indicators.volumeRatio! >= 2 ? "text-terminal-accent" : "text-terminal-text"}>
                {signal.indicators.volumeRatio?.toFixed(2)}x
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Universe Selector ────────────────────────────────────────

const DEFAULT_UNIVERSE = MARKET_UNIVERSE.slice(0, 10);

// ─── Main Screen ──────────────────────────────────────────────

export const Screener: React.FC = () => {
  const [universe, setUniverse] = useState<string[]>(DEFAULT_UNIVERSE);
  const [customInput, setCustomInput] = useState("");
  const [filterSignal, setFilterSignal] = useState<SignalType | "ALL">("ALL");

  const { screenerSignals, setFocusedTicker, focusedTicker, isLoading, positions } = useTerminalStore();
  const { refresh } = useScreenerRefresh(universe);

  const filtered = screenerSignals
    .filter((s) => filterSignal === "ALL" || s.signal === filterSignal)
    .sort((a, b) => STRENGTH_ORDER[a.strength] - STRENGTH_ORDER[b.strength]);

  const addTicker = () => {
    const t = customInput.trim().toUpperCase();
    if (t && !universe.includes(t)) {
      setUniverse([...universe, t]);
    }
    setCustomInput("");
  };

  const usePortfolioUniverse = () => {
    const tickers = positions.map((p) => p.ticker);
    setUniverse(tickers);
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="px-4 py-3 border-b border-terminal-border bg-terminal-bg shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Zap size={14} className="text-warn" />
            <span className="text-sm font-mono font-semibold text-terminal-text tracking-wider">
              MATHEMATICAL SCREENER
            </span>
            <span className="text-2xs font-mono text-terminal-dim border border-terminal-border px-2 py-0.5 rounded">
              {universe.length} symbols
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={usePortfolioUniverse}
              className="text-2xs font-mono text-terminal-dim hover:text-terminal-text border border-terminal-border hover:border-terminal-muted px-2.5 py-1.5 rounded transition-colors"
            >
              USE PORTFOLIO
            </button>
            <button
              onClick={refresh}
              disabled={isLoading["screener"]}
              className="flex items-center gap-1.5 text-2xs font-mono text-terminal-accent border border-terminal-accent/40 hover:border-terminal-accent px-2.5 py-1.5 rounded transition-colors disabled:opacity-50"
            >
              <RefreshCw size={10} className={isLoading["screener"] ? "animate-spin" : ""} />
              {isLoading["screener"] ? "SCANNING..." : "RUN SCAN"}
            </button>
          </div>
        </div>

        {/* Universe chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {universe.map((t) => (
            <button
              key={t}
              onClick={() => setUniverse(universe.filter((u) => u !== t))}
              className="text-2xs font-mono text-terminal-dim hover:text-down border border-terminal-border hover:border-down/40 px-2 py-0.5 rounded-sm transition-colors"
            >
              {t} ×
            </button>
          ))}
          <div className="flex items-center gap-1">
            <input
              className="bg-terminal-surface border border-terminal-border rounded px-2 py-0.5 text-xs font-mono text-terminal-text w-20 focus:outline-none focus:border-terminal-accent"
              placeholder="TICKER"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && addTicker()}
            />
            <button onClick={addTicker}
              className="text-2xs text-terminal-accent border border-terminal-accent/40 px-2 py-0.5 rounded font-mono hover:bg-terminal-accent/10 transition-colors">
              + ADD
            </button>
          </div>
        </div>
      </div>

      {/* ── Signal Filter ── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-terminal-border bg-terminal-bg shrink-0">
        <Filter size={11} className="text-terminal-dim" />
        <button
          onClick={() => setFilterSignal("ALL")}
          className={`text-2xs font-mono px-2 py-1 rounded border transition-colors ${
            filterSignal === "ALL"
              ? "text-terminal-accent border-terminal-accent/40 bg-terminal-accent/10"
              : "text-terminal-dim border-transparent"
          }`}
        >
          ALL ({screenerSignals.length})
        </button>
        {(Object.keys(SIGNAL_META) as SignalType[]).map((s) => {
          const count = screenerSignals.filter((sig) => sig.signal === s).length;
          if (!count) return null;
          const meta = SIGNAL_META[s];
          return (
            <button
              key={s}
              onClick={() => setFilterSignal(s)}
              className={`text-2xs font-mono px-2 py-1 rounded border transition-colors ${
                filterSignal === s
                  ? `${meta.color} ${meta.bgColor}`
                  : "text-terminal-dim border-transparent"
              }`}
            >
              {meta.label} ({count})
            </button>
          );
        })}
      </div>

      {/* ── Signal Grid ── */}
      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-terminal-dim">
            <Search size={28} className="mb-3 opacity-30" />
            {isLoading["screener"] ? (
              <p className="font-mono text-sm animate-pulse text-terminal-accent">
                Scanning {universe.length} symbols...
              </p>
            ) : (
              <>
                <p className="font-mono text-sm">No signals detected</p>
                <p className="font-mono text-2xs mt-1">
                  Click "RUN SCAN" to screen for RSI, MA crossovers & volume breakouts
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((s, i) => (
              <SignalCard
                key={`${s.ticker}-${s.signal}-${i}`}
                signal={s}
                onFocus={(t) => setFocusedTicker(focusedTicker === t ? null : t)}
                isFocused={focusedTicker === s.ticker}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
