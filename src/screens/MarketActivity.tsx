/**
 * ============================================================
 * SCREEN 3 — MARKET ACTIVITY
 * Toggleable Table/Heatmap view.
 * Metrics: Volume Relative (vs avg30d), Capital Volume, Change%.
 * ============================================================
 */

import React, { useState, useMemo } from "react";
import { Grid3x3, Table2, ArrowUpDown, Volume2 } from "lucide-react";
import { useTerminalStore } from "../store/useTerminalStore";
import { useMarketRefresh } from "../hooks/useDataRefresh";
import {
  formatPercent, formatVolume, formatCurrency, colorClass,
} from "../utils/financialCalculations";
import { MARKET_UNIVERSE } from "../services/dataOrchestrator";
import type { PivotQuote } from "../services/types";

// ─── Heatmap Cell ─────────────────────────────────────────────

const HeatCell: React.FC<{
  quote: PivotQuote;
  onClick: () => void;
  isFocused: boolean;
}> = ({ quote, onClick, isFocused }) => {
  const pct = quote.changePercent;
  // Color intensity: map -5%..+5% to red..green gradient
  const intensity = Math.min(Math.abs(pct) / 5, 1);
  const bg = pct > 0
    ? `rgba(0, 230, 118, ${0.08 + intensity * 0.25})`
    : pct < 0
    ? `rgba(255, 23, 68,  ${0.08 + intensity * 0.25})`
    : "rgba(42, 51, 64, 0.5)";

  const volRatio = quote.avgVolume30d > 0
    ? quote.volume / quote.avgVolume30d
    : null;

  return (
    <div
      onClick={onClick}
      className={`rounded border cursor-pointer transition-all flex flex-col justify-between p-2.5 hover:brightness-125 ${
        isFocused ? "ring-2 ring-terminal-accent" : "border-terminal-border"
      }`}
      style={{ background: bg, minHeight: 80 }}
    >
      <div className="flex items-start justify-between">
        <span className="text-sm font-mono font-bold text-terminal-text">{quote.ticker}</span>
        {volRatio !== null && volRatio >= 2 && (
          <Volume2 size={10} className="text-warn" />
        )}
      </div>
      <div>
        <div className={`text-base font-mono font-semibold ${colorClass(pct)}`}>
          {formatPercent(pct)}
        </div>
        <div className="text-2xs font-mono text-terminal-dim">
          ${quote.price.toFixed(2)}
        </div>
        {volRatio !== null && (
          <div className="text-2xs font-mono text-terminal-dim mt-0.5">
            {volRatio.toFixed(1)}x vol
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Table View ───────────────────────────────────────────────

const MarketTable: React.FC<{
  quotes: PivotQuote[];
  focusedTicker: string | null;
  onFocus: (t: string) => void;
}> = ({ quotes, focusedTicker, onFocus }) => {
  const [sortCol, setSortCol]  = useState<string>("changePercent");
  const [sortDir, setSortDir]  = useState<"asc" | "desc">("desc");

  const sort = (col: string) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("desc"); }
  };

  const sorted = useMemo(() => {
    return [...quotes].sort((a, b) => {
      const va = (a as any)[sortCol] ?? 0;
      const vb = (b as any)[sortCol] ?? 0;
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [quotes, sortCol, sortDir]);

  const ColHeader = ({ col, label }: { col: string; label: string }) => (
    <button
      onClick={() => sort(col)}
      className={`flex items-center gap-1 text-2xs font-mono tracking-widest uppercase hover:text-terminal-text transition-colors ${
        sortCol === col ? "text-terminal-accent" : "text-terminal-dim"
      }`}
    >
      {label}
      <ArrowUpDown size={9} />
    </button>
  );

  return (
    <div className="w-full">
      {/* Headers */}
      <div className="grid grid-cols-8 px-4 py-2 border-b border-terminal-border bg-terminal-bg sticky top-0">
        <ColHeader col="ticker"        label="Ticker"   />
        <div className="col-span-2">
          <ColHeader col="name"        label="Company"  />
        </div>
        <ColHeader col="price"         label="Price"    />
        <ColHeader col="changePercent" label="Chg %"    />
        <ColHeader col="volume"        label="Volume"   />
        <ColHeader col="avgVolume30d"  label="Avg Vol"  />
        <div className="text-right">
          <ColHeader col="marketCap"   label="Mkt Cap"  />
        </div>
      </div>

      {/* Rows */}
      {sorted.map((q) => {
        const volRatio = q.avgVolume30d > 0 ? q.volume / q.avgVolume30d : null;
        const capVol   = q.price * q.volume;
        const isFocused = focusedTicker === q.ticker;

        return (
          <div
            key={q.ticker}
            onClick={() => onFocus(q.ticker)}
            className={`grid grid-cols-8 items-center px-4 py-2.5 border-b border-terminal-border/50 cursor-pointer transition-colors
              ${isFocused ? "bg-terminal-accent/5 border-l-2 border-l-terminal-accent" : "hover:bg-terminal-elevated"}`}
          >
            <div className="text-sm font-mono font-semibold text-terminal-text">{q.ticker}</div>
            <div className="col-span-2 text-xs text-terminal-dim truncate">{q.name || q.ticker}</div>
            <div className="text-sm font-mono">${q.price.toFixed(2)}</div>
            <div className={`text-sm font-mono font-semibold ${colorClass(q.changePercent)}`}>
              {formatPercent(q.changePercent)}
            </div>
            <div className="text-xs font-mono text-terminal-dim">
              {formatVolume(q.volume)}
              {volRatio !== null && volRatio >= 2 && (
                <span className="ml-1 text-warn text-2xs">{volRatio.toFixed(1)}x</span>
              )}
            </div>
            <div className="text-xs font-mono text-terminal-dim">{formatVolume(q.avgVolume30d)}</div>
            <div className="text-xs font-mono text-terminal-dim text-right">
              {q.marketCap ? formatCurrency(q.marketCap, "USD", true) : "—"}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Main Screen ──────────────────────────────────────────────

export const MarketActivity: React.FC = () => {
  useMarketRefresh();

  const { quotes, setFocusedTicker, focusedTicker, isLoading } = useTerminalStore();
  const [view, setView]   = useState<"table" | "heatmap">("heatmap");
  const [sector, setSector] = useState<string>("ALL");

  const marketQuotes = MARKET_UNIVERSE
    .map((t) => quotes[t])
    .filter(Boolean) as PivotQuote[];

  const gainers   = marketQuotes.filter((q) => q.changePercent > 0).length;
  const losers    = marketQuotes.filter((q) => q.changePercent < 0).length;
  const unchanged = marketQuotes.length - gainers - losers;

  const handleFocus = (ticker: string) =>
    setFocusedTicker(focusedTicker === ticker ? null : ticker);

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-terminal-border bg-terminal-bg shrink-0">
        {/* Market breadth */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className="text-up font-semibold">{gainers} ▲</span>
            <span className="text-terminal-dim">|</span>
            <span className="text-down font-semibold">{losers} ▼</span>
            <span className="text-terminal-dim">|</span>
            <span className="text-terminal-dim">{unchanged} −</span>
          </div>

          {isLoading["market"] && (
            <span className="text-2xs font-mono text-terminal-accent animate-pulse">● LIVE</span>
          )}
        </div>

        {/* View Toggle */}
        <div className="flex items-center border border-terminal-border rounded overflow-hidden">
          <button
            onClick={() => setView("heatmap")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-2xs font-mono transition-colors ${
              view === "heatmap"
                ? "bg-terminal-accent/15 text-terminal-accent"
                : "text-terminal-dim hover:text-terminal-text"
            }`}
          >
            <Grid3x3 size={11} /> HEATMAP
          </button>
          <button
            onClick={() => setView("table")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-2xs font-mono transition-colors border-l border-terminal-border ${
              view === "table"
                ? "bg-terminal-accent/15 text-terminal-accent"
                : "text-terminal-dim hover:text-terminal-text"
            }`}
          >
            <Table2 size={11} /> TABLE
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto p-4">
        {view === "heatmap" ? (
          <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2">
            {marketQuotes.map((q) => (
              <HeatCell
                key={q.ticker}
                quote={q}
                onClick={() => handleFocus(q.ticker)}
                isFocused={focusedTicker === q.ticker}
              />
            ))}
            {marketQuotes.length === 0 &&
              MARKET_UNIVERSE.map((t) => (
                <div
                  key={t}
                  className="rounded border border-terminal-border bg-terminal-muted/10 animate-pulse"
                  style={{ minHeight: 80 }}
                >
                  <div className="p-2 text-xs font-mono text-terminal-dim">{t}</div>
                </div>
              ))}
          </div>
        ) : (
          <MarketTable
            quotes={marketQuotes}
            focusedTicker={focusedTicker}
            onFocus={handleFocus}
          />
        )}
      </div>
    </div>
  );
};
